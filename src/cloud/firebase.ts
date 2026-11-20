// Firebase implementation: Authentication (email/password + Google) and Firestore.
// Loaded only when cloud features are used, so the app stays light otherwise.
import { Capacitor } from '@capacitor/core';
import type { Backend, CloudUser, Remote, RemoteMeta } from './backend';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDBpxfpda1K1t5fxB1y5S0a67LjSRuMr10',
  authDomain: 'ledgerly-f2170.firebaseapp.com',
  projectId: 'ledgerly-f2170',
  storageBucket: 'ledgerly-f2170.firebasestorage.app',
  messagingSenderId: '704765692147',
  appId: '1:704765692147:web:bd35896daf84a98023cf86',
};

const CHUNK = 700_000; // Firestore documents max out at 1 MB

export async function createFirebase(): Promise<Backend> {
  const [{ initializeApp }, A, F] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  const app = initializeApp(FIREBASE_CONFIG);
  const native = Capacitor.isNativePlatform();
  const auth = native
    ? A.initializeAuth(app, { persistence: A.indexedDBLocalPersistence })
    : A.initializeAuth(app, { persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence], popupRedirectResolver: A.browserPopupRedirectResolver });
  const db = F.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

  const toUser = (u: import('firebase/auth').User | null): CloudUser | null =>
    u ? { uid: u.uid, email: u.email, name: u.displayName, provider: u.providerData.some((p) => p.providerId === 'google.com') ? 'google.com' : 'password' } : null;

  // finish a Google redirect sign-in, if one was started
  if (!native) A.getRedirectResult(auth).catch(() => undefined);

  const metaRef = (uid: string) => F.doc(db, 'users', uid);
  const chunkRef = (uid: string, i: number) => F.doc(db, 'users', uid, 'chunks', String(i));

  const googleProvider = (scopes: string[] = []) => {
    const p = new A.GoogleAuthProvider();
    scopes.forEach((s) => p.addScope(s));
    p.setCustomParameters({ prompt: 'select_account' });
    return p;
  };

  // Android: Google's own sign-in sheet (Credential Manager), then hand the token to Firebase.
  const nativeGoogle = async (scopes: string[] = []) => {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    try {
      return await FirebaseAuthentication.signInWithGoogle(scopes.length ? { scopes } : undefined);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (/cancel/i.test(msg)) throw Object.assign(new Error('Google sign-in was closed before finishing.'), { code: 'auth/popup-closed-by-user' });
      if (/10:|DEVELOPER_ERROR|No credentials/i.test(msg))
        throw new Error('Google sign-in is not set up for this app yet (add the app\'s SHA-1 fingerprint in Firebase → Project settings → Android app).');
      throw e;
    }
  };

  return {
    onUser: (cb) => A.onAuthStateChanged(auth, (u) => cb(toUser(u))),
    async signUp(email, password) {
      const r = await A.createUserWithEmailAndPassword(auth, email, password);
      return toUser(r.user)!;
    },
    async signIn(email, password) {
      const r = await A.signInWithEmailAndPassword(auth, email, password);
      return toUser(r.user)!;
    },
    async signInGoogle() {
      if (native) {
        const r = await nativeGoogle();
        const idToken = r.credential?.idToken;
        if (!idToken) throw new Error('Google did not return a sign-in token.');
        const u = await A.signInWithCredential(auth, A.GoogleAuthProvider.credential(idToken, r.credential?.accessToken));
        return toUser(u.user)!;
      }
      try {
        const r = await A.signInWithPopup(auth, googleProvider());
        return toUser(r.user)!;
      } catch (e) {
        if ((e as { code?: string }).code === 'auth/popup-blocked') {
          await A.signInWithRedirect(auth, googleProvider());
        }
        throw e;
      }
    },
    resetPassword: (email) => A.sendPasswordResetEmail(auth, email),
    signOut: () => A.signOut(auth),
    async get(uid) {
      const m = await F.getDoc(metaRef(uid));
      if (!m.exists()) return null;
      const meta = m.data() as RemoteMeta;
      const parts = await Promise.all(Array.from({ length: meta.chunks }, (_, i) => F.getDoc(chunkRef(uid, i))));
      const blob = parts.map((p) => (p.data()?.d as string) ?? '').join('');
      return { ...meta, blob };
    },
    async head(uid) {
      const m = await F.getDoc(metaRef(uid));
      return m.exists() ? (m.data() as RemoteMeta) : null;
    },
    async put(uid, r: Remote) {
      const prev = await F.getDoc(metaRef(uid));
      const prevChunks = prev.exists() ? ((prev.data() as RemoteMeta).chunks ?? 0) : 0;
      const parts: string[] = [];
      for (let i = 0; i < r.blob.length; i += CHUNK) parts.push(r.blob.slice(i, i + CHUNK));
      const batch = F.writeBatch(db);
      parts.forEach((d, i) => batch.set(chunkRef(uid, i), { d }));
      for (let i = parts.length; i < prevChunks; i++) batch.delete(chunkRef(uid, i));
      const meta: RemoteMeta = { updatedAt: r.updatedAt, deviceId: r.deviceId, kind: r.kind, pinLength: r.pinLength, hash: r.hash, chunks: parts.length };
      batch.set(metaRef(uid), meta);
      await batch.commit();
    },
    watch(uid, cb) {
      return F.onSnapshot(
        metaRef(uid),
        (s) => {
          if (s.metadata.hasPendingWrites) return;
          cb(s.exists() ? (s.data() as RemoteMeta) : null);
        },
        (err) => console.warn('Cloud watch error', err),
      );
    },
    async deleteCloud(uid) {
      const prev = await F.getDoc(metaRef(uid));
      const n = prev.exists() ? ((prev.data() as RemoteMeta).chunks ?? 0) : 0;
      const batch = F.writeBatch(db);
      for (let i = 0; i < n; i++) batch.delete(chunkRef(uid, i));
      batch.delete(metaRef(uid));
      await batch.commit();
    },
    async googleAccessToken(scopes) {
      if (native) {
        const r = await nativeGoogle(scopes);
        const t = r.credential?.accessToken;
        if (!t) throw new Error('Google did not give access to Drive. Please allow it and try again.');
        return t;
      }
      const provider = googleProvider(scopes);
      const user = auth.currentUser;
      let result: import('firebase/auth').UserCredential;
      if (!user) result = await A.signInWithPopup(auth, provider);
      else if (user.providerData.some((p) => p.providerId === 'google.com')) result = await A.reauthenticateWithPopup(user, provider);
      else result = await A.linkWithPopup(user, provider);
      const token = A.GoogleAuthProvider.credentialFromResult(result)?.accessToken;
      if (!token) throw new Error('Google did not give access to Drive. Please allow it and try again.');
      return token;
    },
  };
}
