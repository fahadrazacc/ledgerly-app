import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { Keypad } from '../ui';
import { CURRENCIES, emptyData, sampleData } from '../seed';
import type { AppData } from '../types';
import { createVault, hasVault, importBackup, openVault, pinLength, wipeVault, type Session } from '../vault';

export function Lock({ onOpen }: { onOpen: (s: Session, d: AppData) => void }) {
  const [mode, setMode] = useState<'unlock' | 'setup'>(hasVault() ? 'unlock' : 'setup');
  return mode === 'unlock' ? <Unlock onOpen={onOpen} onReset={() => setMode('setup')} /> : <Setup onOpen={onOpen} onRestored={() => setMode('unlock')} />;
}

function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <Icon name="savings" size={32} stroke={2} />
    </span>
  );
}

function Unlock({ onOpen, onReset }: { onOpen: (s: Session, d: AppData) => void; onReset: () => void }) {
  const len = pinLength();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const pinRef = useRef(pin);
  pinRef.current = pin;

  const press = (k: string) => {
    if (busy) return;
    setError('');
    if (k === 'back') setPin((p) => p.slice(0, -1));
    else if (/^\d$/.test(k)) setPin((p) => (p.length < len ? p + k : p));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (pin.length !== len) return;
    setBusy(true);
    openVault(pin)
      .then(({ session, data }) => onOpen(session, data))
      .catch((e: Error) => {
        setError(e.message === 'Wrong PIN' ? 'Wrong PIN, try again' : e.message);
        setShake(true);
        setTimeout(() => setShake(false), 400);
        setPin('');
      })
      .finally(() => setBusy(false));
  }, [pin, len, onOpen]);

  const erase = () => {
    if (confirm('Erase all data on this device and start again? This cannot be undone unless you have a backup file.')) {
      wipeVault();
      onReset();
    }
  };

  return (
    <main className="lock">
      <Logo />
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Welcome back</h1>
        <span className="muted" style={{ fontSize: 14 }}>
          {busy ? 'Unlocking…' : 'Enter your PIN to unlock'}
        </span>
      </div>
      <div className={`dots ${shake ? 'shake' : ''}`} aria-label={`${pin.length} of ${len} digits entered`}>
        {Array.from({ length: len }, (_, i) => (
          <span key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <div className="error" role="alert" style={{ minHeight: 18 }}>
        {error}
      </div>
      <Keypad onKey={press} />
      <button className="link" onClick={erase}>
        Forgot PIN? Erase and start again
      </button>
    </main>
  );
}

function Setup({ onOpen, onRestored }: { onOpen: (s: Session, d: AppData) => void; onRestored: () => void }) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('Rs');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [sample, setSample] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) return setError('PIN must be 4 to 6 digits');
    if (pin !== pin2) return setError('PINs do not match');
    setBusy(true);
    try {
      const n = name.trim() || 'there';
      const data = sample ? sampleData(n, currency) : emptyData(n, currency);
      const session = await createVault(pin, data);
      onOpen(session, data);
    } catch (err) {
      setError((err as Error).message || 'Could not create your vault');
      setBusy(false);
    }
  };

  const restore = async (f?: File) => {
    if (!f) return;
    try {
      importBackup(await f.text());
      onRestored();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <main className="lock" style={{ justifyContent: 'flex-start', paddingTop: 48 }}>
      <Logo />
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Welcome to Ledgerly</h1>
        <span className="muted" style={{ fontSize: 14 }}>
          Track spending, budgets and accounts. Your data is encrypted with your PIN.
        </span>
      </div>
      <form className="form" style={{ width: '100%' }} onSubmit={submit}>
        <label className="field">
          <span>Your name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fahad" autoComplete="given-name" />
        </label>
        <label className="field">
          <span>Currency</span>
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="grid2">
          <label className="field">
            <span>Create PIN (4–6 digits)</span>
            <input className="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="field">
            <span>Confirm PIN</span>
            <input className="input" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} />
          Start with sample data so I can try things out
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Setting up…' : 'Get started'}
        </button>
        <button type="button" className="btn secondary block" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={18} />
          Restore from a backup file
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => restore(e.target.files?.[0])} />
      </form>
      <div className="note">
        <Icon name="lock" size={18} />
        <span>There is no PIN recovery. Keep a backup file from Settings somewhere safe.</span>
      </div>
    </main>
  );
}
