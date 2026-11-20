// What the sync engine needs from a cloud service. The real one is Firebase (firebase.ts);
// tests swap in a small mock (mock.ts).
export interface CloudUser {
  uid: string;
  email: string | null;
  name: string | null;
  provider: string; // 'password' | 'google.com'
}

export interface RemoteMeta {
  updatedAt: number;
  deviceId: string;
  kind: 'pin' | 'password';
  pinLength: number;
  hash: string;
  chunks: number;
}
export interface Remote extends RemoteMeta {
  blob: string; // encrypted vault (JSON text)
}

export interface Backend {
  onUser(cb: (u: CloudUser | null) => void): () => void;
  signUp(email: string, password: string): Promise<CloudUser>;
  signIn(email: string, password: string): Promise<CloudUser>;
  signInGoogle(): Promise<CloudUser>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
  get(uid: string): Promise<Remote | null>;
  head(uid: string): Promise<RemoteMeta | null>;
  put(uid: string, r: Remote): Promise<void>;
  watch(uid: string, cb: (m: RemoteMeta | null) => void): () => void;
  deleteCloud(uid: string): Promise<void>;
  googleAccessToken(scopes: string[]): Promise<string>;
}

let backend: Promise<Backend> | null = null;
export function getBackend(): Promise<Backend> {
  if (!backend) {
    const mock = (window as unknown as { __LEDGERLY_CLOUD_MOCK?: string }).__LEDGERLY_CLOUD_MOCK;
    backend = mock ? import('./mock').then((m) => m.createMock(mock)) : import('./firebase').then((m) => m.createFirebase());
  }
  return backend;
}

/** Turns service error codes into plain messages. */
export function friendly(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
    'auth/invalid-credential': 'Email or password is not right.',
    'auth/wrong-password': 'Email or password is not right.',
    'auth/user-not-found': 'No account with that email. Create one instead.',
    'auth/invalid-email': "That email doesn't look right.",
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/missing-password': 'Enter your password.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/network-request-failed': "Can't reach the server. Check your internet connection.",
    'auth/popup-closed-by-user': 'Google sign-in was closed before finishing.',
    'auth/cancelled-popup-request': 'Google sign-in was closed before finishing.',
    'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups and try again.',
    'auth/unauthorized-domain': 'This website is not yet allowed in Firebase (Authentication → Settings → Authorized domains).',
    'auth/operation-not-allowed': 'This sign-in method is not turned on in Firebase yet.',
    'auth/credential-already-in-use': 'That Google account is already used by another Ledgerly account.',
    'auth/requires-recent-login': 'Please sign in again and retry.',
    'permission-denied': 'The cloud refused access. Check the Firestore rules.',
    unavailable: "Can't reach the cloud right now. We'll retry automatically.",
    'failed-precondition': 'The cloud database is not ready yet (create the Firestore database).',
    'not-found': 'The cloud database is not created yet.',
  };
  return map[code] ?? ((e as Error)?.message || 'Something went wrong');
}
