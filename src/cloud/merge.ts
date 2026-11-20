// Three-way merge between this device's data and the account's data in the cloud.
// "base" is a fingerprint of the last state both sides agreed on, so we can tell
// who changed (or deleted) what since then, item by item.
import type { AppData } from '../types';

export const COLLECTIONS = ['accounts', 'categories', 'txns', 'budgets', 'debts', 'reminders'] as const;
type Coll = (typeof COLLECTIONS)[number];
type Item = { id: string };

export interface SyncBase {
  items: Record<Coll, Record<string, string>>;
  settings: string;
  order: string; // account order
}

export function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
const hashOf = (o: unknown) => fnv(JSON.stringify(o));
const list = (d: AppData, c: Coll) => ((d[c] as Item[] | undefined) ?? []) as Item[];

export function baseOf(d: AppData): SyncBase {
  const items = {} as SyncBase['items'];
  for (const c of COLLECTIONS) items[c] = Object.fromEntries(list(d, c).map((x) => [x.id, hashOf(x)]));
  return { items, settings: hashOf(d.settings), order: hashOf(d.accounts.map((a) => a.id)) };
}

export const dataHash = (d: AppData) => hashOf({ ...d });

/**
 * preferRemote decides the rare case where the very same item was changed on both sides.
 * With no base (first time this device joins the account) the two sides are combined.
 */
export function merge(local: AppData, remote: AppData, base: SyncBase | undefined, preferRemote: boolean): AppData {
  const out: AppData = { ...local, version: 1 };

  for (const c of COLLECTIONS) {
    const L = new Map(list(local, c).map((x) => [x.id, x]));
    const R = new Map(list(remote, c).map((x) => [x.id, x]));
    const B = base?.items[c] ?? null;
    const result = new Map<string, Item>();
    const ids = new Set([...L.keys(), ...R.keys(), ...(B ? Object.keys(B) : [])]);
    for (const id of ids) {
      const l = L.get(id);
      const r = R.get(id);
      if (!B) {
        // no shared history: keep everything; same id on both → newer side wins
        const pick = l && r ? (preferRemote ? r : l) : l ?? r;
        if (pick) result.set(id, pick);
        continue;
      }
      const b = B[id];
      const lh = l ? hashOf(l) : undefined;
      const rh = r ? hashOf(r) : undefined;
      const localChanged = lh !== b;
      const remoteChanged = rh !== b;
      let pick: Item | undefined;
      if (!localChanged) pick = r;
      else if (!remoteChanged) pick = l;
      else if (lh === rh) pick = l;
      else if (!l || !r) pick = l ?? r; // edited on one side, deleted on the other: keep the edit
      else pick = preferRemote ? r : l;
      if (pick) result.set(id, pick);
    }
    // keep a sensible order: the side that changed the order wins, new items go at the end
    const localOrder = list(local, c).map((x) => x.id);
    const remoteOrder = list(remote, c).map((x) => x.id);
    const useRemoteOrder = c === 'accounts' && base ? hashOf(localOrder) === base.order : false;
    const first = useRemoteOrder ? remoteOrder : localOrder;
    const second = useRemoteOrder ? localOrder : remoteOrder;
    const ordered: Item[] = [];
    const seen = new Set<string>();
    for (const id of [...first, ...second]) {
      if (seen.has(id) || !result.has(id)) continue;
      seen.add(id);
      ordered.push(result.get(id)!);
    }
    (out as unknown as Record<string, Item[]>)[c] = ordered;
  }

  // settings: one unit
  if (!base) out.settings = { ...remote.settings, ...local.settings };
  else {
    const lc = hashOf(local.settings) !== base.settings;
    const rc = hashOf(remote.settings) !== base.settings;
    out.settings = !lc ? remote.settings : !rc ? local.settings : preferRemote ? remote.settings : local.settings;
  }
  return out;
}
