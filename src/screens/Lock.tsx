import { useCallback, useEffect, useRef, useState } from 'react';
import { ask } from '../confirm';
import { Icon } from '../icons';
import { Keypad, Segmented } from '../ui';
import { CURRENCIES, emptyData, sampleData } from '../seed';
import type { AppData } from '../types';
import { createVault, getMeta, hasVault, importBackup, openVault, wipeVault, type Session } from '../vault';
import { biometricEnabled, disableBiometric, unlockWithBiometric } from '../biometric';

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
  const meta = getMeta();
  const isPin = meta.kind === 'pin';
  const len = meta.pinLength;
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [bio] = useState(biometricEnabled);
  const tried = useRef(false);

  const tryOpen = useCallback(
    (p: string) => {
      setBusy(true);
      return openVault(p)
        .then(({ session, data }) => onOpen(session, data))
        .catch((e: Error) => {
          setError(e.message === 'Wrong PIN' ? (isPin ? 'Wrong PIN, try again' : 'Wrong password, try again') : e.message);
          setShake(true);
          setTimeout(() => setShake(false), 400);
          setPass('');
        })
        .finally(() => setBusy(false));
    },
    [onOpen, isPin],
  );

  const fingerprint = useCallback(async () => {
    setError('');
    try {
      const p = await unlockWithBiometric();
      await tryOpen(p);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (/no protected credentials|invalidated|21/i.test(msg)) {
        await disableBiometric();
        setError('Fingerprints changed on this phone. Unlock with your ' + (isPin ? 'PIN' : 'password') + ', then turn fingerprint on again in Profile.');
      } else if (!/cancel/i.test(msg)) setError('Fingerprint not recognised. Use your ' + (isPin ? 'PIN' : 'password') + '.');
    }
  }, [tryOpen, isPin]);

  // Ask for the fingerprint straight away when it's turned on.
  useEffect(() => {
    if (bio && !tried.current) {
      tried.current = true;
      fingerprint();
    }
  }, [bio, fingerprint]);

  const press = (k: string) => {
    if (busy) return;
    setError('');
    if (k === 'back') setPass((p) => p.slice(0, -1));
    else if (/^\d$/.test(k)) setPass((p) => (p.length < len ? p + k : p));
  };

  useEffect(() => {
    if (!isPin) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (isPin && pass.length === len) tryOpen(pass);
  }, [pass, len, isPin, tryOpen]);

  const erase = async () => {
    if (await ask('Erase all data on this device and start again? This cannot be undone unless you have a backup file.', { ok: 'Erase' })) {
      wipeVault();
      await disableBiometric();
      onReset();
    }
  };

  return (
    <main className="lock">
      <Logo />
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Welcome back</h1>
        <span className="muted" style={{ fontSize: 14 }}>
          {busy ? 'Unlocking…' : isPin ? 'Enter your PIN to unlock' : 'Enter your password to unlock'}
        </span>
      </div>
      {isPin ? (
        <div className={`dots ${shake ? 'shake' : ''}`} aria-label={`${pass.length} of ${len} digits entered`}>
          {Array.from({ length: len }, (_, i) => (
            <span key={i} className={i < pass.length ? 'on' : ''} />
          ))}
        </div>
      ) : (
        <form
          className={`form ${shake ? 'shake' : ''}`}
          style={{ width: '100%', maxWidth: 320 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (pass) tryOpen(pass);
          }}
        >
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            aria-label="Password"
            value={pass}
            onChange={(e) => {
              setPass(e.target.value);
              setError('');
            }}
            autoFocus={!bio}
          />
          <button className="btn primary block" disabled={busy || !pass}>
            Unlock
          </button>
        </form>
      )}
      <div className="error" role="alert" style={{ minHeight: 18, textAlign: 'center' }}>
        {error}
      </div>
      {isPin && <Keypad onKey={press} />}
      {bio && (
        <button className="btn secondary" onClick={fingerprint} disabled={busy}>
          <Icon name="fingerprint" size={22} />
          Use fingerprint
        </button>
      )}
      <button className="link" onClick={erase}>
        Forgot it? Erase and start again
      </button>
      <span className="muted small">Ledgerly {__APP_VERSION__}</span>
    </main>
  );
}

function Setup({ onOpen, onRestored }: { onOpen: (s: Session, d: AppData) => void; onRestored: () => void }) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('Rs');
  const [kind, setKind] = useState<'pin' | 'password'>('pin');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [sample, setSample] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === 'pin' && !/^\d{4,6}$/.test(pin)) return setError('PIN must be 4 to 6 digits');
    if (kind === 'password' && pin.length < 6) return setError('Password must be at least 6 characters');
    if (pin !== pin2) return setError(kind === 'pin' ? 'PINs do not match' : 'Passwords do not match');
    setBusy(true);
    try {
      const n = name.trim() || 'there';
      const data = sample ? sampleData(n, currency) : emptyData(n, currency);
      const session = await createVault(pin, data, kind);
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

  const numeric = kind === 'pin';
  const clean = (v: string) => (numeric ? v.replace(/\D/g, '') : v);

  return (
    <main className="lock" style={{ justifyContent: 'flex-start', paddingTop: 48 }}>
      <Logo />
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Welcome to Ledgerly</h1>
        <span className="muted" style={{ fontSize: 14 }}>
          Track spending, budgets and accounts. Your data is encrypted with your PIN or password.
        </span>
      </div>
      <button type="button" className="btn primary block" onClick={() => fileRef.current?.click()}>
        <Icon name="upload" size={18} />
        Restore from a backup file
      </button>
      <input ref={fileRef} type="file" hidden onChange={(e) => restore(e.target.files?.[0])} />
      <div className="muted small" style={{ textAlign: 'center' }}>
        Reinstalled the app? Restore your latest backup — look in <strong>Documents → Ledgerly</strong> or wherever you shared it.
      </div>
      <div className="muted small" style={{ fontWeight: 600 }}>
        or start fresh
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
        <Segmented<'pin' | 'password'>
          label="Lock type"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setPin('');
            setPin2('');
          }}
          options={[
            { value: 'pin', label: 'PIN' },
            { value: 'password', label: 'Password' },
          ]}
        />
        <div className="grid2">
          <label className="field">
            <span>{numeric ? 'Create PIN (4–6 digits)' : 'Create password (6+)'}</span>
            <input className="input" type="password" inputMode={numeric ? 'numeric' : 'text'} autoComplete="new-password" maxLength={numeric ? 6 : 64} value={pin} onChange={(e) => setPin(clean(e.target.value))} />
          </label>
          <label className="field">
            <span>Confirm</span>
            <input className="input" type="password" inputMode={numeric ? 'numeric' : 'text'} autoComplete="new-password" maxLength={numeric ? 6 : 64} value={pin2} onChange={(e) => setPin2(clean(e.target.value))} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} />
          Fill with sample data so I can try things out
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="btn secondary block" disabled={busy}>
          {busy ? 'Setting up…' : 'Get started'}
        </button>
      </form>
      <div className="note">
        <Icon name="lock" size={18} />
        <span>There is no recovery if you forget it. Keep a backup file from Settings somewhere safe.</span>
      </div>
    </main>
  );
}
