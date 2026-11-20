// Encrypted local vault.
// All app data is serialised to JSON and encrypted with AES-256-GCM before it is stored.
// The key is derived from the user's PIN with PBKDF2-SHA256 and a random per-vault salt,
// and is held only in memory while the app is unlocked.

import type { AppData } from './types';

const VAULT_KEY = 'ledgerly.vault.v1';
const META_KEY = 'ledgerly.meta.v1';
const ITERATIONS = 310_000;

const enc = new TextEncoder();
const dec = new TextDecoder();
const memory: Record<string, string> = {};

function getItem(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return memory[k] ?? null;
  }
}
function setItem(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    memory[k] = v;
  }
}
function removeItem(k: string) {
  try {
    localStorage.removeItem(k);
  } catch {
    delete memory[k];
  }
}

const toB64 = (b: Uint8Array) => {
  let s = '';
  b.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

interface VaultBlob {
  v: 1;
  iter: number;
  salt: string;
  iv: string;
  data: string;
}

export interface Session {
  key: CryptoKey;
  salt: Uint8Array<ArrayBuffer>;
}

async function deriveKey(pin: string, salt: Uint8Array<ArrayBuffer>, iter = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function hasVault() {
  return !!getItem(VAULT_KEY);
}

// Non-secret settings the lock screen needs before the vault is open.
export interface Meta {
  pinLength: number;
  kind: 'pin' | 'password';
  biometric: boolean;
}
export function getMeta(): Meta {
  let m: Partial<Meta> = {};
  try {
    m = JSON.parse(getItem(META_KEY) || '{}');
  } catch {
    /* ignore */
  }
  return { pinLength: typeof m.pinLength === 'number' ? m.pinLength : 4, kind: m.kind === 'password' ? 'password' : 'pin', biometric: !!m.biometric };
}
export function setMeta(patch: Partial<Meta>) {
  setItem(META_KEY, JSON.stringify({ ...getMeta(), ...patch }));
}
export const pinLength = () => getMeta().pinLength;

export async function writeVault(session: Session, data: AppData) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, session.key, enc.encode(JSON.stringify(data)));
  const blob: VaultBlob = { v: 1, iter: ITERATIONS, salt: toB64(session.salt), iv: toB64(iv), data: toB64(new Uint8Array(ct)) };
  setItem(VAULT_KEY, JSON.stringify(blob));
}

export async function createVault(pass: string, data: AppData, kind: 'pin' | 'password' = 'pin'): Promise<Session> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const session = { key: await deriveKey(pass, salt), salt };
  await writeVault(session, data);
  setMeta({ pinLength: pass.length, kind });
  return session;
}

/** Checks a passcode against the stored vault without changing anything. */
export async function checkPasscode(pass: string) {
  try {
    await openVault(pass);
    return true;
  } catch {
    return false;
  }
}

export async function openVault(pin: string): Promise<{ session: Session; data: AppData }> {
  const raw = getItem(VAULT_KEY);
  if (!raw) throw new Error('No data found');
  const blob = JSON.parse(raw) as VaultBlob;
  const salt = fromB64(blob.salt);
  const key = await deriveKey(pin, salt, blob.iter);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.data));
  } catch {
    throw new Error('Wrong PIN');
  }
  return { session: { key, salt }, data: JSON.parse(dec.decode(plain)) as AppData };
}

export async function changePasscode(pass: string, kind: 'pin' | 'password', data: AppData): Promise<Session> {
  return createVault(pass, data, kind);
}

/** The encrypted vault exactly as stored — safe to save as a backup file. */
export function exportBackup(): string | null {
  const raw = getItem(VAULT_KEY);
  if (!raw) return null;
  const m = getMeta();
  return JSON.stringify({ app: 'ledgerly', exportedAt: new Date().toISOString(), pinLength: m.pinLength, kind: m.kind, vault: JSON.parse(raw) });
}

export function importBackup(text: string) {
  const parsed = JSON.parse(text);
  const vault = parsed.vault as VaultBlob | undefined;
  if (parsed.app !== 'ledgerly' || !vault || !vault.salt || !vault.iv || !vault.data) {
    throw new Error('This is not a Ledgerly backup file');
  }
  setItem(VAULT_KEY, JSON.stringify(vault));
  setItem(META_KEY, JSON.stringify({ pinLength: parsed.pinLength ?? 4, kind: parsed.kind === 'password' ? 'password' : 'pin', biometric: false }));
}

export function wipeVault() {
  removeItem(VAULT_KEY);
  removeItem(META_KEY);
}
