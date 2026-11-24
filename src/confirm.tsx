import { useEffect, useState } from 'react';
import { checkPasscode, getMeta } from './vault';

// In-app replacement for window.confirm (which looks out of place on phones and is blocked in some hosts).
// With `verify`, the person must also enter their PIN or password before the action goes ahead.
interface Req {
  message: string;
  ok: string;
  danger: boolean;
  verify: boolean;
  resolve: (v: boolean) => void;
}
let push: ((r: Req) => void) | null = null;

export function ask(message: string, opts: { ok?: string; danger?: boolean; verify?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) return resolve(false);
    push({ message, ok: opts.ok ?? 'Delete', danger: opts.danger ?? true, verify: opts.verify ?? false, resolve });
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    push = (r) => {
      setPass('');
      setError('');
      setBusy(false);
      setReq(r);
    };
    return () => {
      push = null;
    };
  }, []);
  if (!req) return null;
  const isPin = getMeta().kind !== 'password';
  const name = isPin ? 'PIN' : 'password';
  const done = (v: boolean) => {
    req.resolve(v);
    setReq(null);
  };
  const confirm = async () => {
    if (!req.verify) return done(true);
    if (!pass) return setError(`Enter your ${name} to continue`);
    setBusy(true);
    const ok = await checkPasscode(pass);
    setBusy(false);
    if (ok) return done(true);
    setPass('');
    setError(`That ${name} isn't right. Try again.`);
  };
  return (
    <div className="sheet-backdrop" style={{ alignItems: 'center', padding: 20, zIndex: 80 }} onClick={() => !busy && done(false)}>
      <div className="card" role="alertdialog" aria-modal="true" aria-label="Please confirm" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, width: '100%', display: 'flex', flexDirection: 'column', gap: 18, padding: 20 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.45 }}>{req.message}</p>
        {req.verify && (
          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            <span>Enter your {name} to confirm</span>
            <input
              className="input"
              type="password"
              inputMode={isPin ? 'numeric' : undefined}
              autoComplete="current-password"
              aria-label={`Your ${name}`}
              value={pass}
              onChange={(e) => {
                setPass(isPin ? e.target.value.replace(/\D/g, '') : e.target.value);
                setError('');
              }}
              autoFocus
            />
            {error && (
              <span className="exp small" role="alert" style={{ fontWeight: 600 }}>
                {error}
              </span>
            )}
          </form>
        )}
        <div className="grid2">
          <button className="btn secondary" onClick={() => done(false)} autoFocus={!req.verify} disabled={busy}>
            Cancel
          </button>
          <button className={`btn ${req.danger ? 'danger' : 'primary'}`} style={req.danger ? { background: 'var(--exp)', color: '#fff' } : undefined} onClick={confirm} disabled={busy}>
            {busy ? 'Checking…' : req.ok}
          </button>
        </div>
      </div>
    </div>
  );
}
