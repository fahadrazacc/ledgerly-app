import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { useStore } from '../store';
import { BackLink, Header, IconTile, Segmented, Sheet } from '../ui';
import { changePasscode, checkPasscode, getMeta } from '../vault';
import { biometricAvailable, biometricEnabled, disableBiometric, enableBiometric, isNativeApp, refreshBiometric } from '../biometric';
import { initials } from '../utils';

/** Shrinks a picked photo to a 256px square JPEG so it stays small inside the encrypted vault. */
async function toAvatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Could not read that image'));
      i.src = url;
    });
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const side = Math.min(img.width, img.height);
    c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Avatar({ size = 44, radius = 14 }: { size?: number; radius?: number }) {
  const { data } = useStore();
  const photo = data.settings.photo;
  return photo ? (
    <img src={photo} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <span className="tile" style={{ width: size, height: size, borderRadius: radius, background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: Math.round(size * 0.38) }}>
      {initials(data.settings.name)}
    </span>
  );
}

export function Profile() {
  const { data, update, setSession } = useStore();
  const s = data.settings;
  const [name, setName] = useState(s.name);
  const [email, setEmail] = useState(s.email ?? '');
  const [phone, setPhone] = useState(s.phone ?? '');
  const [toast, setToast] = useState('');
  const [sheet, setSheet] = useState<null | 'pass' | 'bio'>(null);
  const [bioOn, setBioOn] = useState(biometricEnabled);
  const [bioOk, setBioOk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = getMeta();
  const kindLabel = meta.kind === 'pin' ? 'PIN' : 'password';

  useEffect(() => {
    biometricAvailable().then(setBioOk);
  }, []);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 2500);
  };

  const dirty = name !== s.name || email !== (s.email ?? '') || phone !== (s.phone ?? '');
  const emailBad = email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || emailBad) return;
    update((d) => ({ ...d, settings: { ...d.settings, name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined } }));
    flash('Profile saved');
  };

  const pickPhoto = async (f?: File) => {
    if (!f) return;
    try {
      const photo = await toAvatar(f);
      update((d) => ({ ...d, settings: { ...d.settings, photo } }));
      flash('Photo updated');
    } catch (err) {
      flash((err as Error).message);
    }
  };

  return (
    <main className="screen narrow">
      <Header title="Profile" left={<BackLink to="home" />} />

      <section className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24 }}>
        <div style={{ position: 'relative' }}>
          <Avatar size={96} radius={32} />
          <button className="btn-icon solid" aria-label="Change photo" onClick={() => fileRef.current?.click()} style={{ position: 'absolute', right: -6, bottom: -6, width: 40, height: 40, borderRadius: 13, border: '3px solid #fff' }}>
            <Icon name="camera" size={18} />
          </button>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{s.name}</div>
          {s.email && <div className="muted small">{s.email}</div>}
        </div>
        {s.photo && (
          <button className="link" onClick={() => update((d) => ({ ...d, settings: { ...d.settings, photo: undefined } }))}>
            Remove photo
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      </section>

      <section className="section">
        <h2 className="h2">Details</h2>
        <form className="card form" onSubmit={save}>
          <label className="field">
            <span>Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            {emailBad && <span className="error">That email doesn't look right</span>}
          </label>
          <label className="field">
            <span>Phone</span>
            <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 300 1234567" autoComplete="tel" />
          </label>
          <button className="btn primary block" disabled={!dirty || !name.trim() || emailBad}>
            Save details
          </button>
        </form>
      </section>

      <section className="section">
        <h2 className="h2">Security</h2>
        <div className="card list">
          <button className="row" onClick={() => setSheet('pass')}>
            <IconTile icon="lock" color="#3B5BDB" />
            <span className="row-main">
              <span className="row-title">Change PIN or password</span>
              <span className="row-sub">You're using a {kindLabel}</span>
            </span>
            <Icon name="chevR" />
          </button>
          <div className="row">
            <IconTile icon="fingerprint" color="#087F5B" />
            <span className="row-main">
              <span className="row-title">Unlock with fingerprint</span>
              <span className="row-sub">
                {!isNativeApp() ? 'Available in the Android app' : bioOk ? (bioOn ? 'On' : 'Off') : 'No fingerprint set up on this phone'}
              </span>
            </span>
            <label className="switch">
              <input
                type="checkbox"
                aria-label="Unlock with fingerprint"
                checked={bioOn}
                disabled={!bioOk}
                onChange={async (e) => {
                  if (e.target.checked) setSheet('bio');
                  else {
                    await disableBiometric();
                    setBioOn(false);
                    flash('Fingerprint unlock turned off');
                  }
                }}
              />
              <span />
            </label>
          </div>
        </div>
      </section>

      {sheet === 'pass' && (
        <PasscodeSheet
          onClose={() => setSheet(null)}
          onDone={async (pass, kind) => {
            setSession(await changePasscode(pass, kind, data));
            await refreshBiometric(pass);
            setSheet(null);
            flash(kind === 'pin' ? 'PIN changed' : 'Password changed');
          }}
        />
      )}
      {sheet === 'bio' && (
        <ConfirmPasscode
          title="Turn on fingerprint"
          note={`Enter your ${kindLabel} once. It's then kept in your phone's secure storage and only released after a fingerprint scan.`}
          onClose={() => setSheet(null)}
          onOk={async (pass) => {
            await enableBiometric(pass);
            setBioOn(true);
            setSheet(null);
            flash('Fingerprint unlock is on');
          }}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function ConfirmPasscode(props: { title: string; note: string; onClose: () => void; onOk: (pass: string) => Promise<void> }) {
  const meta = getMeta();
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={props.title} onClose={props.onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          if (!(await checkPasscode(pass))) {
            setBusy(false);
            return setError(`That ${meta.kind === 'pin' ? 'PIN' : 'password'} isn't right`);
          }
          try {
            await props.onOk(pass);
          } catch (err) {
            setError(/cancel/i.test(String((err as Error).message)) ? 'Cancelled' : (err as Error).message || 'Could not turn on fingerprint');
            setBusy(false);
          }
        }}
      >
        <p className="muted small" style={{ margin: 0 }}>
          {props.note}
        </p>
        <label className="field">
          <span>Current {meta.kind === 'pin' ? 'PIN' : 'password'}</span>
          <input className="input" type="password" inputMode={meta.kind === 'pin' ? 'numeric' : 'text'} value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn primary block" disabled={busy || !pass}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </Sheet>
  );
}

function PasscodeSheet({ onClose, onDone }: { onClose: () => void; onDone: (pass: string, kind: 'pin' | 'password') => Promise<void> }) {
  const meta = getMeta();
  const [current, setCurrent] = useState('');
  const [kind, setKind] = useState<'pin' | 'password'>(meta.kind);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const numeric = kind === 'pin';
  const clean = (v: string) => (numeric ? v.replace(/\D/g, '') : v);
  return (
    <Sheet title="Change PIN or password" onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          if (numeric && !/^\d{4,6}$/.test(pass)) return setError('PIN must be 4 to 6 digits');
          if (!numeric && pass.length < 6) return setError('Password must be at least 6 characters');
          if (pass !== pass2) return setError("The new ones don't match");
          setBusy(true);
          if (!(await checkPasscode(current))) {
            setBusy(false);
            return setError(`Current ${meta.kind === 'pin' ? 'PIN' : 'password'} isn't right`);
          }
          await onDone(pass, kind).catch((err: Error) => {
            setError(err.message);
            setBusy(false);
          });
        }}
      >
        <label className="field">
          <span>Current {meta.kind === 'pin' ? 'PIN' : 'password'}</span>
          <input className="input" type="password" inputMode={meta.kind === 'pin' ? 'numeric' : 'text'} value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
        </label>
        <Segmented<'pin' | 'password'>
          label="New lock type"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setPass('');
            setPass2('');
          }}
          options={[
            { value: 'pin', label: 'PIN' },
            { value: 'password', label: 'Password' },
          ]}
        />
        <label className="field">
          <span>{numeric ? 'New PIN (4–6 digits)' : 'New password (6+ characters)'}</span>
          <input className="input" type="password" inputMode={numeric ? 'numeric' : 'text'} maxLength={numeric ? 6 : 64} value={pass} onChange={(e) => setPass(clean(e.target.value))} autoComplete="new-password" />
        </label>
        <label className="field">
          <span>Confirm new {numeric ? 'PIN' : 'password'}</span>
          <input className="input" type="password" inputMode={numeric ? 'numeric' : 'text'} maxLength={numeric ? 6 : 64} value={pass2} onChange={(e) => setPass2(clean(e.target.value))} autoComplete="new-password" />
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Sheet>
  );
}
