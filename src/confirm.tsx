import { useEffect, useState } from 'react';

// In-app replacement for window.confirm (which looks out of place on phones and is blocked in some hosts).
interface Req {
  message: string;
  ok: string;
  danger: boolean;
  resolve: (v: boolean) => void;
}
let push: ((r: Req) => void) | null = null;

export function ask(message: string, opts: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) return resolve(false);
    push({ message, ok: opts.ok ?? 'Delete', danger: opts.danger ?? true, resolve });
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<Req | null>(null);
  useEffect(() => {
    push = setReq;
    return () => {
      push = null;
    };
  }, []);
  if (!req) return null;
  const done = (v: boolean) => {
    req.resolve(v);
    setReq(null);
  };
  return (
    <div className="sheet-backdrop" style={{ alignItems: 'center', padding: 20, zIndex: 80 }} onClick={() => done(false)}>
      <div className="card" role="alertdialog" aria-modal="true" aria-label="Please confirm" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, width: '100%', display: 'flex', flexDirection: 'column', gap: 18, padding: 20 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.45 }}>{req.message}</p>
        <div className="grid2">
          <button className="btn secondary" onClick={() => done(false)} autoFocus>
            Cancel
          </button>
          <button className={`btn ${req.danger ? 'danger' : 'primary'}`} style={req.danger ? { background: 'var(--exp)', color: '#fff' } : undefined} onClick={() => done(true)}>
            {req.ok}
          </button>
        </div>
      </div>
    </div>
  );
}
