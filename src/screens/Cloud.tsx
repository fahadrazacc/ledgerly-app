import { useEffect, useState } from 'react';
import { ask } from '../confirm';
import { Icon } from '../icons';
import { toast } from '../toast';
import { IconTile, Keypad, Segmented, Sheet } from '../ui';
import { deleteCloudData, resetPassword, signIn, signInGoogle, signOut, signUp, syncNow, unlockAccount, useSync } from '../cloud/sync';
import { friendly } from '../cloud/backend';
import { backupToDrive, downloadDriveBackup, listDriveBackups, type DriveFile } from '../cloud/drive';
import { importBackup } from '../vault';

const ago = (t?: number) => {
  if (!t) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Sign in / create account. Works before the app is set up too. */
export function AuthSheet({ onClose, onDone, startWith = 'signin' }: { onClose: () => void; onDone?: () => void; startWith?: 'signin' | 'signup' }) {
  const [mode, setMode] = useState<'signin' | 'signup'>(startWith);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const done = () => {
    onDone?.();
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNote('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("That email doesn't look right.");
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    setBusy(true);
    try {
      if (mode === 'signup') await signUp(email.trim(), password);
      else await signIn(email.trim(), password);
      toast(mode === 'signup' ? 'Account created' : 'Signed in');
      done();
    } catch (err) {
      setError(friendly(err));
    }
    setBusy(false);
  };

  return (
    <Sheet title={mode === 'signup' ? 'Create your Ledgerly account' : 'Sign in to Ledgerly'} onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>
        Use the same account on your phone and in the browser to keep your data in sync. Your records are encrypted with your PIN before they're uploaded.
      </p>
      <button
        className="btn secondary block"
        disabled={busy}
        onClick={async () => {
          setError('');
          setBusy(true);
          try {
            await signInGoogle();
            toast('Signed in with Google');
            done();
          } catch (err) {
            setError(friendly(err));
          }
          setBusy(false);
        }}
      >
        <GoogleMark />
        Continue with Google
      </button>
      <div className="muted small" style={{ textAlign: 'center', fontWeight: 600 }}>
        or with email
      </div>
      <Segmented<'signin' | 'signup'>
        label="Account"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError('');
        }}
        options={[
          { value: 'signin', label: 'Sign in' },
          { value: 'signup', label: 'Create account' },
        ]}
      />
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </label>
        <label className="field">
          <span>{mode === 'signup' ? 'Choose a password (6+ characters)' : 'Password'}</span>
          <div style={{ position: 'relative' }}>
            <input className="input" type={show ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 52 }} />
            <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((v) => !v)} style={{ position: 'absolute', right: 4, top: 3, width: 44, height: 44, border: 0, background: 'transparent', color: 'var(--muted)' }}>
              <Icon name={show ? 'eyeOff' : 'eye'} size={20} />
            </button>
          </div>
        </label>
        {mode === 'signup' && (
          <p className="muted small" style={{ margin: 0 }}>
            This password is for your account. Your PIN still unlocks the app and encrypts your data.
          </p>
        )}
        {error && <div className="error" role="alert">{error}</div>}
        {note && <div className="note">{note}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
        {mode === 'signin' && (
          <button
            type="button"
            className="link"
            style={{ alignSelf: 'center' }}
            onClick={async () => {
              setError('');
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Type your email above first.');
              try {
                await resetPassword(email.trim());
                setNote('We sent a password reset link to ' + email.trim() + '.');
              } catch (err) {
                setError(friendly(err));
              }
            }}
          >
            Forgot password?
          </button>
        )}
      </form>
    </Sheet>
  );
}

/** Ask for the account's PIN/password (another device uses a different one). */
export function AccountPassSheet({ onClose }: { onClose: () => void }) {
  const s = useSync();
  const isPin = s.remoteKind !== 'password';
  const len = s.remotePinLength ?? 4;
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const tryIt = async (p: string) => {
    setBusy(true);
    setError('');
    try {
      await unlockAccount(p);
      toast('Synced. This device now uses your account’s ' + (isPin ? 'PIN' : 'password'));
      onClose();
    } catch (e) {
      setError((e as Error).message === 'Wrong PIN' ? `That ${isPin ? 'PIN' : 'password'} doesn't open your account's data` : friendly(e));
      setPass('');
    }
    setBusy(false);
  };

  useEffect(() => {
    if (isPin && pass.length === len && !busy) tryIt(pass);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pass]);

  return (
    <Sheet title={`Enter your account ${isPin ? 'PIN' : 'password'}`} onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>
        Your Ledgerly account was set up with a different {isPin ? 'PIN' : 'password'} (or it was changed on another device). Enter it once: this device will switch to it, and your data from both will be combined.
      </p>
      {isPin ? (
        <>
          <div className="dots" style={{ alignSelf: 'center' }}>
            {Array.from({ length: len }, (_, i) => (
              <span key={i} className={i < pass.length ? 'on' : ''} />
            ))}
          </div>
          {error && <div className="error" role="alert" style={{ textAlign: 'center' }}>{error}</div>}
          <Keypad onKey={(k) => setPass((p) => (k === 'back' ? p.slice(0, -1) : /^\d$/.test(k) && p.length < len ? p + k : p))} />
        </>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (pass) tryIt(pass);
          }}
        >
          <input className="input" type="password" aria-label="Account password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
          {error && <div className="error" role="alert">{error}</div>}
          <button className="btn primary block" disabled={busy || !pass}>
            {busy ? 'Opening…' : 'Continue'}
          </button>
        </form>
      )}
    </Sheet>
  );
}

/** Small banner when sync needs attention. */
export function SyncBanner() {
  const s = useSync();
  const [open, setOpen] = useState(false);
  if (s.status !== 'needs-pass') return null;
  return (
    <>
      <button className="note sync-banner" onClick={() => setOpen(true)} style={{ border: 0, width: '100%', textAlign: 'left' }}>
        <Icon name="lock" size={18} />
        <span style={{ flex: 1 }}>Sync paused: enter your account {s.remoteKind === 'password' ? 'password' : 'PIN'} to continue.</span>
        <Icon name="chevR" size={18} />
      </button>
      {open && <AccountPassSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** "Account & sync" section in Profile & settings. */
export function CloudSection() {
  const s = useSync();
  const [sheet, setSheet] = useState<null | 'auth' | 'pass'>(null);
  const status =
    s.status === 'syncing'
      ? 'Syncing…'
      : s.status === 'synced'
        ? `Synced ${ago(s.lastAt)}`
        : s.status === 'needs-pass'
          ? 'Paused: enter your account PIN'
          : s.status === 'offline'
            ? 'Offline: will sync when you’re back online'
            : s.status === 'error'
              ? s.error ?? 'Sync problem'
              : 'Connecting…';
  return (
    <section className="section">
      <h2 className="h2">Account &amp; sync</h2>
      {s.user ? (
        <div className="card list">
          <div className="row">
            <IconTile icon="user" color="#3B5BDB" />
            <span className="row-main">
              <span className="row-title">{s.user.email ?? 'Signed in'}</span>
              <span className="row-sub wrap" style={s.status === 'error' || s.status === 'needs-pass' ? { color: 'var(--exp)', fontWeight: 600 } : undefined}>
                {s.user.provider === 'google.com' ? 'Google account · ' : ''}
                {status}
              </span>
            </span>
          </div>
          {s.status === 'needs-pass' ? (
            <button className="row" onClick={() => setSheet('pass')}>
              <IconTile icon="lock" color="#C2410C" />
              <span className="row-main">
                <span className="row-title">Enter account {s.remoteKind === 'password' ? 'password' : 'PIN'}</span>
                <span className="row-sub wrap">Needed once to combine this device with your account</span>
              </span>
              <Icon name="chevR" />
            </button>
          ) : (
            <button className="row" onClick={() => syncNow()}>
              <IconTile icon="transfer" color="#087F5B" />
              <span className="row-main">
                <span className="row-title">Sync now</span>
                <span className="row-sub wrap">Happens automatically after every change</span>
              </span>
              <Icon name="chevR" />
            </button>
          )}
          <button
            className="row"
            onClick={async () => {
              if (await ask('Sign out on this device? Your data stays here; it just stops syncing.', { ok: 'Sign out', danger: false })) {
                await signOut();
                toast('Signed out');
              }
            }}
          >
            <IconTile icon="lock" color="#495057" />
            <span className="row-main">
              <span className="row-title">Sign out of account</span>
              <span className="row-sub wrap">Keeps the data on this device</span>
            </span>
            <Icon name="chevR" />
          </button>
          <button
            className="row"
            onClick={async () => {
              if (await ask('Delete your data from the cloud? Data on this and other devices stays, but stops syncing until it is uploaded again.', { ok: 'Delete cloud copy', verify: true })) {
                await deleteCloudData();
                toast('Cloud copy deleted');
              }
            }}
          >
            <IconTile icon="trash" color="#C2410C" />
            <span className="row-main">
              <span className="row-title exp">Delete cloud copy</span>
            </span>
            <Icon name="chevR" />
          </button>
        </div>
      ) : (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <IconTile icon="transfer" color="#3B5BDB" size={44} />
            <span className="row-main">
              <span className="row-title" style={{ fontWeight: 700 }}>
                Sync your phone and the web
              </span>
              <span className="row-sub wrap">Sign in to use Ledgerly on more than one device. Data is encrypted with your PIN before upload.</span>
            </span>
          </div>
          <button className="btn primary block" onClick={() => setSheet('auth')}>
            Sign in or create account
          </button>
        </div>
      )}
      {sheet === 'auth' && <AuthSheet onClose={() => setSheet(null)} />}
      {sheet === 'pass' && <AccountPassSheet onClose={() => setSheet(null)} />}
    </section>
  );
}

/** Google Drive backup rows, shown inside the Backup & restore card. */
export function DriveRows({ onRestored }: { onRestored: () => void }) {
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  return (
    <>
      <button
        className="row"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const f = await backupToDrive();
            toast(`Backed up to Google Drive · ${f.name}`);
          } catch (e) {
            toast(friendly(e));
          }
          setBusy(false);
        }}
      >
        <IconTile icon="upload" color="#1971C2" />
        <span className="row-main">
          <span className="row-title">{busy ? 'Working…' : 'Back up to Google Drive'}</span>
          <span className="row-sub wrap">Saved in a private Ledgerly folder in your Drive (keeps the last 10)</span>
        </span>
        <Icon name="chevR" />
      </button>
      <button
        className="row"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setFiles(await listDriveBackups());
          } catch (e) {
            toast(friendly(e));
          }
          setBusy(false);
        }}
      >
        <IconTile icon="download" color="#1971C2" />
        <span className="row-main">
          <span className="row-title">Restore from Google Drive</span>
          <span className="row-sub wrap">Pick one of your Drive backups</span>
        </span>
        <Icon name="chevR" />
      </button>
      {files && (
        <Sheet title="Google Drive backups" onClose={() => setFiles(null)}>
          {files.length === 0 ? (
            <p className="muted">No backups in Drive yet.</p>
          ) : (
            <div className="card list">
              {files.map((f) => (
                <button
                  key={f.id}
                  className="row"
                  onClick={async () => {
                    if (!(await ask(`Restore the backup from ${new Date(f.createdTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}? It replaces the data on this device.`, { ok: 'Restore', verify: true }))) return;
                    try {
                      importBackup(await downloadDriveBackup(f.id));
                      setFiles(null);
                      onRestored();
                    } catch (e) {
                      toast(friendly(e));
                    }
                  }}
                >
                  <IconTile icon="savings" color="#1971C2" />
                  <span className="row-main">
                    <span className="row-title">{new Date(f.createdTime).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    <span className="row-sub">{f.size ? `${Math.max(1, Math.round(Number(f.size) / 1024))} KB` : f.name}</span>
                  </span>
                  <Icon name="chevR" />
                </button>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
