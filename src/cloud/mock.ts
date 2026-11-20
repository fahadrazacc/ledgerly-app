// Test-only cloud: stores the remote copy on a small local test server.
import type { Backend, CloudUser, Remote, RemoteMeta } from './backend';

export function createMock(base: string): Backend {
  const KEY = 'ledgerly.mockuser';
  let user: CloudUser | null = JSON.parse(localStorage.getItem(KEY) || 'null');
  const subs = new Set<(u: CloudUser | null) => void>();
  const set = (u: CloudUser | null) => {
    user = u;
    localStorage.setItem(KEY, JSON.stringify(u));
    subs.forEach((f) => f(u));
  };
  const call = async (path: string, init?: RequestInit) => {
    const r = await fetch(base + path, init);
    const j = await r.json();
    if (!r.ok) throw Object.assign(new Error(j.error), { code: j.code });
    return j;
  };
  const auth = async (path: string, email: string, password: string) => {
    const r = await fetch(base + path, { method: 'POST', body: JSON.stringify({ email, password }) });
    const j = await r.json();
    if (!r.ok) throw Object.assign(new Error(j.error), { code: j.code });
    const u: CloudUser = { uid: j.uid, email, name: null, provider: 'password' };
    set(u);
    return u;
  };
  return {
    onUser(cb) {
      subs.add(cb);
      setTimeout(() => cb(user), 0);
      return () => subs.delete(cb);
    },
    signUp: (e, p) => auth('/signup', e, p),
    signIn: (e, p) => auth('/signin', e, p),
    async signInGoogle() {
      throw Object.assign(new Error('mock'), { code: 'auth/operation-not-allowed' });
    },
    async resetPassword() {},
    async signOut() {
      set(null);
    },
    async get(uid) {
      const j = await call('/remote/' + uid);
      return (j.remote as Remote) ?? null;
    },
    async head(uid) {
      const j = await call('/meta/' + uid);
      return (j.meta as RemoteMeta) ?? null;
    },
    async put(uid, r) {
      await call('/remote/' + uid, { method: 'POST', body: JSON.stringify(r) });
    },
    watch(uid, cb) {
      let last = 0;
      const t = setInterval(async () => {
        try {
          const j = await call('/meta/' + uid);
          const m = j.meta as RemoteMeta | null;
          if (m && m.updatedAt !== last) {
            last = m.updatedAt;
            cb(m);
          }
        } catch {
          /* offline */
        }
      }, 700);
      return () => clearInterval(t);
    },
    async deleteCloud(uid) {
      await call('/remote/' + uid, { method: 'DELETE' });
    },
    async googleAccessToken() {
      throw new Error('mock');
    },
  };
}
