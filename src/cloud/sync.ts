// Keeps this device and the user's cloud account in step.
//  - after every local change: upload an encrypted copy (debounced)
//  - when another device uploads: download, decrypt, merge, apply
//  - if the account's PIN/password differs from this device's: ask once, then switch to it
import { useSyncExternalStore } from 'react';
import { friendly, getBackend, type CloudUser, type Remote } from './backend';
import { baseOf, dataHash, merge, type SyncBase } from './merge';
import { adoptSession, deviceId, getMeta, openBlob, openWithSession, sealWith, store, type Session } from '../vault';
import type { AppData } from '../types';
import { normalize } from '../utils';
import { refreshBiometric } from '../biometric';

export type SyncStatus = 'signed-out' | 'idle' | 'syncing' | 'synced' | 'error' | 'needs-pass' | 'offline';
export interface SyncState {
  user: CloudUser | null;
  status: SyncStatus;
  lastAt?: number;
  error?: string;
  remoteKind?: 'pin' | 'password';
  remotePinLength?: number;
}

let state: SyncState = { user: null, status: 'signed-out' };
const listeners = new Set<() => void>();
const setState = (p: Partial<SyncState>) => {
  state = { ...state, ...p };
  listeners.forEach((f) => f());
};
export const useSync = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => state,
  );
export const syncState = () => state;

// ---- per-device sync bookkeeping (no secrets: fingerprints and times) ----
interface LocalSync {
  uid: string;
  base?: SyncBase;
  remoteAt?: number;
  remoteHash?: string;
  localAt?: number;
  lastAt?: number;
}
const KEY = 'ledgerly.sync.v1';
const FLAG = 'ledgerly.cloud';
function readLocal(uid: string): LocalSync {
  try {
    const l = JSON.parse(store.get(KEY) || 'null') as LocalSync | null;
    if (l && l.uid === uid) return l;
  } catch {
    /* ignore */
  }
  return { uid };
}
const writeLocal = (l: LocalSync) => store.set(KEY, JSON.stringify(l));

// ---- connection to the unlocked app ----
export interface Host {
  getData(): AppData;
  getSession(): Session;
  apply(d: AppData): void;
  setSession(s: Session): void;
}
let host: Host | null = null;
let unwatch: (() => void) | null = null;
let chain: Promise<unknown> = Promise.resolve();
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pending: Remote | null = null;
let started: Promise<void> | null = null;

const run = (job: () => Promise<void>) => {
  chain = chain
    .then(job)
    .catch((e) => {
      console.warn('Sync failed', e);
      setState({ status: navigator.onLine === false ? 'offline' : 'error', error: friendly(e) });
    });
  return chain;
};

/** Loads the cloud service if this device has used it before (or when asked). */
export function initCloud(force = false): Promise<void> {
  if (!force && store.get(FLAG) !== '1') return Promise.resolve();
  if (!started)
    started = getBackend().then((b) => {
      b.onUser((u) => {
        const was = state.user?.uid;
        setState({ user: u, status: u ? (state.status === 'signed-out' ? 'idle' : state.status) : 'signed-out', error: undefined });
        if (u) store.set(FLAG, '1');
        if (u && host && u.uid !== was) startSync();
        if (!u) stopWatch();
      });
      window.addEventListener('online', () => state.user && host && run(pull));
    });
  return started;
}

export function attach(h: Host) {
  host = h;
  if (state.user) startSync();
}
export function detach() {
  host = null;
  stopWatch();
  clearTimeout(pushTimer);
}

function stopWatch() {
  unwatch?.();
  unwatch = null;
}

function startSync() {
  stopWatch();
  run(pull).then(async () => {
    if (!state.user || !host) return;
    const b = await getBackend();
    const uid = state.user.uid;
    unwatch = b.watch(uid, (m) => {
      if (!m || !host) return;
      const l = readLocal(uid);
      if (m.deviceId !== deviceId() && m.updatedAt !== l.remoteAt) run(pull);
    });
  });
}

/** Called by the app after every save. */
export function afterSave(data: AppData) {
  if (!state.user || !host) return;
  const l = readLocal(state.user.uid);
  if (dataHash(data) !== l.remoteHash) {
    writeLocal({ ...l, localAt: Date.now() });
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => run(push), 1500);
  }
}

export const syncNow = () => run(pull);

/** Before changing the PIN/password: take in any pending changes from other devices (old key still open). */
export const beforePasscodeChange = () => (state.user && host && state.status !== 'needs-pass' ? run(pull) : Promise.resolve());
/** After changing it: upload a copy locked with the new one, so other devices ask for it once. */
export const afterPasscodeChange = () => (state.user && host ? run(() => push(true, undefined, true)) : Promise.resolve());

async function pull(): Promise<void> {
  if (!state.user || !host) return;
  setState({ status: 'syncing', error: undefined });
  const b = await getBackend();
  const uid = state.user.uid;
  const r = await b.get(uid);
  if (!r) return push(true);
  const l = readLocal(uid);
  if (r.updatedAt === l.remoteAt && r.hash === l.remoteHash) {
    // nothing new remotely; upload if we have local changes
    return push(true);
  }
  const remoteData = await openWithSession(host.getSession(), r.blob);
  if (!remoteData) {
    pending = r;
    setState({ status: 'needs-pass', remoteKind: r.kind, remotePinLength: r.pinLength });
    return;
  }
  await finishPull(r, remoteData);
}

async function finishPull(r: Remote, remoteData: AppData) {
  if (!state.user || !host) return;
  const uid = state.user.uid;
  const l = readLocal(uid);
  const local = host.getData();
  const merged = normalize(merge(local, normalize(remoteData), l.base, r.updatedAt >= (l.localAt ?? 0)));
  writeLocal({ ...l, base: baseOf(remoteData), remoteAt: r.updatedAt, remoteHash: r.hash });
  if (dataHash(merged) !== dataHash(local)) host.apply(merged);
  if (dataHash(merged) !== r.hash) await push(true, merged);
  else {
    const now = Date.now();
    writeLocal({ ...readLocal(uid), lastAt: now });
    setState({ status: 'synced', lastAt: now });
  }
}

async function push(skipCheck = false, override?: AppData, force = false): Promise<void> {
  if (!state.user || !host) return;
  const b = await getBackend();
  const uid = state.user.uid;
  const data = override ?? host.getData();
  const h = dataHash(data);
  let l = readLocal(uid);
  if (!skipCheck) {
    // someone else uploaded since we last looked: merge their changes first
    const head = await b.head(uid);
    if (head && head.updatedAt !== l.remoteAt) return pull();
  }
  if (h === l.remoteHash && !force) {
    const now = Date.now();
    writeLocal({ ...l, lastAt: now });
    setState({ status: 'synced', lastAt: now });
    return;
  }
  setState({ status: 'syncing', error: undefined });
  const meta = getMeta();
  const now = Date.now();
  const blob = await sealWith(host.getSession(), data);
  await b.put(uid, { updatedAt: now, deviceId: deviceId(), kind: meta.kind, pinLength: meta.pinLength, hash: h, chunks: 0, blob });
  l = readLocal(uid);
  writeLocal({ ...l, base: baseOf(data), remoteAt: now, remoteHash: h, lastAt: now });
  setState({ status: 'synced', lastAt: now });
}

/** The account uses another PIN/password: open it, switch this device to it, then merge. */
export async function unlockAccount(pass: string) {
  if (!pending || !host) throw new Error('Nothing to unlock');
  const r = pending;
  const opened = await openBlob(r.blob, pass);
  await adoptSession(opened.session, host.getData(), r.kind, r.pinLength);
  host.setSession(opened.session);
  await refreshBiometric(pass);
  pending = null;
  await run(() => finishPull(r, opened.data));
}

// ---- sign in / out ----
async function signedIn<T extends CloudUser>(p: Promise<T>) {
  const u = await p;
  store.set(FLAG, '1');
  setState({ user: u, status: 'idle', error: undefined });
  if (host) startSync();
  return u;
}
export async function signUp(email: string, password: string) {
  await initCloud(true);
  return signedIn((await getBackend()).signUp(email, password));
}
export async function signIn(email: string, password: string) {
  await initCloud(true);
  return signedIn((await getBackend()).signIn(email, password));
}
export async function signInGoogle() {
  await initCloud(true);
  return signedIn((await getBackend()).signInGoogle());
}
export async function resetPassword(email: string) {
  await initCloud(true);
  return (await getBackend()).resetPassword(email);
}
export async function signOut() {
  stopWatch();
  await (await getBackend()).signOut();
  store.remove(KEY);
  store.remove(FLAG);
  pending = null;
  setState({ user: null, status: 'signed-out', lastAt: undefined, error: undefined });
}
export async function deleteCloudData() {
  if (!state.user) return;
  await (await getBackend()).deleteCloud(state.user.uid);
  store.remove(KEY);
  setState({ status: 'idle' });
}

/** For a fresh install: the account's data, if any. */
export async function fetchAccountData(): Promise<Remote | null> {
  if (!state.user) return null;
  return (await getBackend()).get(state.user.uid);
}

/** For a fresh install: open the account's data with its PIN/password and make it this device's vault. */
export async function restoreFromAccount(r: Remote, pass: string) {
  const opened = await openBlob(r.blob, pass);
  const data = normalize(opened.data);
  await adoptSession(opened.session, data, r.kind, r.pinLength);
  writeLocal({ uid: state.user!.uid, base: baseOf(opened.data), remoteAt: r.updatedAt, remoteHash: r.hash, lastAt: Date.now() });
  return { session: opened.session, data };
}
