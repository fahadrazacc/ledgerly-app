import { useEffect, useRef, useState } from 'react';
import { ask } from '../confirm';
import { Icon } from '../icons';
import { useStore } from '../store';
import { href } from '../router';
import { toast } from '../toast';
import { BackLink, Header, IconTile, Segmented, Sheet } from '../ui';
import { CURRENCIES, defaultCategories } from '../seed';
import type { AppData, NotifySettings } from '../types';
import { changePasscode, checkPasscode, exportBackup, getMeta, importBackup, setMeta, wipeVault } from '../vault';
import { biometricAvailable, biometricEnabled, BioName, bioName, disableBiometric, enableBiometric, isIOS, isNativeApp, refreshBiometric } from '../biometric';
import { autoBackupNow, canSaveToPhone, FOLDER, saveBackupToPhone } from '../backup';
import { askNotificationPermission, canNotify, notificationPermission, notifyOf } from '../notify';
import { download, initials, resizeImage, toCsv, uid } from '../utils';
import { CloudSection, DriveRows } from './Cloud';
import { afterPasscodeChange, beforePasscodeChange } from '../cloud/sync';

export const APP_VERSION = __APP_VERSION__;

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

function Switch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="switch">
      <input type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

const when = (t?: number) => (t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'never');

export function Profile() {
  const { data, update, setSession, lock, hidden, toggleHidden } = useStore();
  const s = data.settings;
  const n = notifyOf(data);
  const meta = getMeta();
  const kindLabel = meta.kind === 'pin' ? 'PIN' : 'password';
  const native = isNativeApp();

  const [sheet, setSheet] = useState<null | 'edit' | 'pass' | 'bio' | 'clear'>(null);
  const [bioOn, setBioOn] = useState(biometricEnabled);
  const [bioOk, setBioOk] = useState(false);
  const [perm, setPerm] = useState<'granted' | 'denied' | 'prompt'>('denied');
  const [auto, setAuto] = useState(() => getMeta().autoBackup);
  const [lastAt, setLastAt] = useState(() => getMeta().lastBackupAt);
  const [busy, setBusy] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const stamp = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    biometricAvailable().then(setBioOk);
    notificationPermission().then(setPerm);
  }, []);

  const setSettings = (patch: Partial<AppData['settings']>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const setNotify = async (patch: Partial<NotifySettings>) => {
    const turningOn = Object.values(patch).some((v) => v === true);
    if (turningOn && canNotify() && perm !== 'granted') {
      const ok = await askNotificationPermission();
      setPerm(ok ? 'granted' : 'denied');
      if (!ok) toast('Notifications are blocked. Allow them in Android Settings → Apps → Ledgerly.');
    }
    setSettings({ notify: { ...n, ...patch } });
  };

  const pickPhoto = async (f?: File) => {
    if (!f) return;
    try {
      const photo = await resizeImage(f, 256);
      setSettings({ photo });
      toast('Photo updated');
    } catch (err) {
      toast((err as Error).message);
    }
  };

  return (
    <main className="screen narrow">
      <Header title="Profile & settings" left={<BackLink to="home" />} />

      {/* ---------- profile ---------- */}
      <section className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 24 }}>
        <div style={{ position: 'relative' }}>
          <Avatar size={96} radius={32} />
          <button className="btn-icon solid" aria-label="Change photo" onClick={() => photoRef.current?.click()} style={{ position: 'absolute', right: -6, bottom: -6, width: 40, height: 40, borderRadius: 13, border: '3px solid var(--card)' }}>
            <Icon name="camera" size={18} />
          </button>
        </div>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{s.name}</div>
          {s.email && <div className="muted small">{s.email}</div>}
          {s.phone && <div className="muted small">{s.phone}</div>}
        </div>
        <div className="chips" style={{ justifyContent: 'center' }}>
          <button className="chip" onClick={() => setSheet('edit')}>
            <Icon name="edit" size={14} /> Edit profile
          </button>
          {s.photo && (
            <button className="chip" onClick={() => setSettings({ photo: undefined })}>
              Remove photo
            </button>
          )}
        </div>
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            pickPhoto(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </section>

      <CloudSection />

      {/* ---------- appearance ---------- */}
      <section className="section">
        <h2 className="h2">Appearance</h2>
        <div className="card list">
          <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <IconTile icon="moon" color="#5C7CFA" />
              <span className="row-main">
                <span className="row-title">Theme</span>
                <span className="row-sub wrap">"System" follows your phone's dark mode</span>
              </span>
            </span>
            <Segmented<'system' | 'light' | 'dark'>
              label="Theme"
              value={s.theme ?? 'system'}
              onChange={(theme) => setSettings({ theme })}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>
          <div className="row">
            <IconTile icon={hidden ? 'eyeOff' : 'eye'} color="#7048E8" />
            <span className="row-main">
              <span className="row-title">Hide amounts</span>
              <span className="row-sub wrap">Show •••• instead of numbers. Also on the Home balance card.</span>
            </span>
            <Switch label="Hide amounts" checked={hidden} onChange={toggleHidden} />
          </div>
          <label className="row">
            <IconTile icon="cash" color="#087F5B" />
            <span className="row-main">
              <span className="row-title">Currency symbol</span>
            </span>
            <select className="input" style={{ width: 96, height: 42 }} value={s.currency} onChange={(e) => setSettings({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* ---------- money setup ---------- */}
      <section className="section">
        <h2 className="h2">Accounts &amp; categories</h2>
        <div className="card list">
          <a className="row" href={href('accounts')}>
            <IconTile icon="bank" color="#3B5BDB" />
            <span className="row-main">
              <span className="row-title">Accounts</span>
              <span className="row-sub wrap">Add accounts, icons and pictures; activate or deactivate</span>
            </span>
            <Icon name="chevR" />
          </a>
          <a className="row" href={href('categories')}>
            <IconTile icon="tag" color="#E67700" />
            <span className="row-main">
              <span className="row-title">Categories</span>
              <span className="row-sub wrap">Create, edit or hide categories</span>
            </span>
            <Icon name="chevR" />
          </a>
          <a className="row" href={href('reminders')}>
            <IconTile icon="bell" color="#C2410C" />
            <span className="row-main">
              <span className="row-title">Payment reminders</span>
              <span className="row-sub wrap">{(data.reminders ?? []).filter((r) => r.active).length} active · bills, rent, fees</span>
            </span>
            <Icon name="chevR" />
          </a>
        </div>
      </section>

      {/* ---------- notifications ---------- */}
      <section className="section">
        <h2 className="h2">Notifications</h2>
        <div className="card list">
          {!canNotify() && (
            <div className="row">
              <IconTile icon="phone" color="#495057" />
              <span className="row-main">
                <span className="row-title">Phone notifications</span>
                <span className="row-sub wrap">Work in the Android app. On the web, due payments and budget alerts show inside the app.</span>
              </span>
            </div>
          )}
          {canNotify() && perm !== 'granted' && (
            <div className="row">
              <IconTile icon="bell" color="#C2410C" />
              <span className="row-main">
                <span className="row-title">Notifications are off</span>
                <span className="row-sub wrap">Allow them so reminders can reach you</span>
              </span>
              <button className="btn primary small" onClick={async () => setPerm((await askNotificationPermission()) ? 'granted' : 'denied')}>
                Allow
              </button>
            </div>
          )}
          <div className="row">
            <IconTile icon="clock" color="#3B5BDB" />
            <span className="row-main">
              <span className="row-title">Daily reminder</span>
              <span className="row-sub wrap">{n.daily ? 'A nudge to add the day’s spending, every day at:' : 'A daily nudge to add your spending'}</span>
              {n.daily && <input type="time" className="input" aria-label="Daily reminder time" style={{ width: 130, height: 40, marginTop: 6 }} value={n.dailyTime} onChange={(e) => e.target.value && setNotify({ dailyTime: e.target.value })} />}
            </span>
            <Switch label="Daily reminder" checked={n.daily} onChange={(v) => setNotify({ daily: v })} />
          </div>
          <div className="row">
            <IconTile icon="bell" color="#C2410C" />
            <span className="row-main">
              <span className="row-title">Payment reminders</span>
              <span className="row-sub wrap">When a bill is due, and before if you chose</span>
            </span>
            <Switch label="Payment reminder notifications" checked={n.payments} onChange={(v) => setNotify({ payments: v })} />
          </div>
          <div className="row">
            <IconTile icon="target" color="#E67700" />
            <span className="row-main">
              <span className="row-title">Budget alerts</span>
              <span className="row-sub wrap">When a budget reaches 80% and when it's over</span>
            </span>
            <Switch label="Budget alerts" checked={n.budgets} onChange={(v) => setNotify({ budgets: v })} />
          </div>
          <div className="row">
            <IconTile icon="users" color="#AE3EC9" />
            <span className="row-main">
              <span className="row-title">Debt due dates</span>
              <span className="row-sub wrap">On the day money is due to or from someone</span>
            </span>
            <Switch label="Debt due date notifications" checked={n.debts} onChange={(v) => setNotify({ debts: v })} />
          </div>
        </div>
      </section>

      {/* ---------- security ---------- */}
      <section className="section">
        <h2 className="h2">Security</h2>
        <div className="card list">
          <button className="row" onClick={() => setSheet('pass')}>
            <IconTile icon="lock" color="#3B5BDB" />
            <span className="row-main">
              <span className="row-title">Change PIN or password</span>
              <span className="row-sub wrap">You're using a {kindLabel}</span>
            </span>
            <Icon name="chevR" />
          </button>
          <div className="row">
            <IconTile icon="fingerprint" color="#087F5B" />
            <span className="row-main">
              <span className="row-title">Unlock with {bioName()}</span>
              <span className="row-sub wrap">{!native ? 'Available in the phone apps' : bioOk ? (bioOn ? 'On' : 'Off') : `No ${bioName()} set up on this phone`}</span>
            </span>
            <Switch
              label={`Unlock with ${bioName()}`}
              checked={bioOn}
              disabled={!bioOk}
              onChange={async (v) => {
                if (v) setSheet('bio');
                else {
                  await disableBiometric();
                  setBioOn(false);
                  toast(`${BioName()} unlock turned off`);
                }
              }}
            />
          </div>
          <label className="row">
            <IconTile icon="clock" color="#495057" />
            <span className="row-main">
              <span className="row-title">Auto-lock</span>
              <span className="row-sub wrap">After leaving the app</span>
            </span>
            <select className="input" style={{ width: 132, height: 42 }} value={s.autoLockMin ?? 5} onChange={(e) => setSettings({ autoLockMin: Number(e.target.value) })}>
              <option value={0}>Immediately</option>
              <option value={1}>1 minute</option>
              <option value={5}>5 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
            </select>
          </label>
          <button className="row" onClick={lock}>
            <IconTile icon="lock" color="#495057" />
            <span className="row-main">
              <span className="row-title">Lock now</span>
            </span>
            <Icon name="chevR" />
          </button>
        </div>
      </section>

      {/* ---------- backup ---------- */}
      <section className="section">
        <h2 className="h2">Backup &amp; restore</h2>
        <div className="card list">
          {canSaveToPhone() && (
            <>
              <button
                className="row"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const where = await saveBackupToPhone();
                    setLastAt(getMeta().lastBackupAt);
                    toast(`Saved to ${where}`);
                  } catch (e) {
                    toast('Could not save: ' + ((e as Error).message || 'storage not available'));
                  }
                  setBusy(false);
                }}
              >
                <IconTile icon="download" color="#087F5B" />
                <span className="row-main">
                  <span className="row-title">Save backup to phone</span>
                  <span className="row-sub wrap">{isIOS() ? `To the Files app (On My iPhone › Ledgerly). Removed if you delete the app, so also use Share or Google Drive` : `To Documents/${FOLDER} · kept if you uninstall the app`}</span>
                </span>
                <Icon name="chevR" />
              </button>
              <div className="row">
                <IconTile icon="savings" color="#0C8599" />
                <span className="row-main">
                  <span className="row-title">Automatic backup</span>
                  <span className="row-sub wrap">{auto ? `Updates after every change · last ${when(lastAt)}` : `Keep a backup in Documents/${FOLDER} up to date`}</span>
                </span>
                <Switch
                  label="Automatic backup"
                  checked={auto}
                  onChange={async (on) => {
                    setMeta({ autoBackup: on });
                    setAuto(on);
                    if (!on) return;
                    try {
                      const where = await autoBackupNow();
                      setLastAt(getMeta().lastBackupAt);
                      toast(`Automatic backup on · ${where}`);
                    } catch (err) {
                      setMeta({ autoBackup: false });
                      setAuto(false);
                      toast('Could not save: ' + ((err as Error).message || 'storage not available'));
                    }
                  }}
                />
              </div>
            </>
          )}
          <button
            className="row"
            onClick={() => {
              const b = exportBackup();
              if (b) download(`ledgerly-backup-${stamp}.json`, b, 'application/json').then(() => toast(native ? 'Backup ready to share' : 'Backup downloaded')).catch((e: Error) => toast(e.message));
            }}
          >
            <IconTile icon={native ? 'upload' : 'download'} color="#3B5BDB" />
            <span className="row-main">
              <span className="row-title">{native ? 'Share backup' : 'Download encrypted backup'}</span>
              <span className="row-sub wrap">{native ? 'Send to Google Drive, email or WhatsApp' : 'Restore it on any device with your PIN or password'}</span>
            </span>
            <Icon name="chevR" />
          </button>
          <DriveRows onRestored={lock} />
          <button className="row" onClick={() => restoreRef.current?.click()}>
            <IconTile icon="upload" color="#7048E8" />
            <span className="row-main">
              <span className="row-title">Restore from backup</span>
              <span className="row-sub wrap">{native ? `Pick a file, e.g. from Documents/${FOLDER}. Replaces current data` : 'Replaces the data on this device'}</span>
            </span>
            <Icon name="chevR" />
          </button>
          <button className="row" onClick={() => download(`ledgerly-records-${stamp}.csv`, toCsv(data), 'text/csv').then(() => toast('CSV exported')).catch((e: Error) => toast(e.message))}>
            <IconTile icon="list" color="#0C8599" />
            <span className="row-main">
              <span className="row-title">Export records as CSV</span>
              <span className="row-sub wrap">Open in Excel or Google Sheets (not encrypted)</span>
            </span>
            <Icon name="chevR" />
          </button>
        </div>
        <input
          ref={restoreRef}
          type="file"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (!(await ask('Replace all data on this device with this backup? You will need the PIN or password that was used for the backup.', { ok: 'Restore' }))) return;
            try {
              importBackup(await f.text());
              lock();
            } catch (err) {
              toast((err as Error).message);
            }
          }}
        />
      </section>

      {/* ---------- clear data ---------- */}
      <section className="section">
        <h2 className="h2">Clear data</h2>
        <div className="card list">
          <button className="row" onClick={() => setSheet('clear')}>
            <IconTile icon="eraser" color="#C2410C" />
            <span className="row-main">
              <span className="row-title">Clear data…</span>
              <span className="row-sub wrap">Remove records, budgets, debts or reminders and keep the rest</span>
            </span>
            <Icon name="chevR" />
          </button>
          <button
            className="row"
            onClick={async () => {
              if ((await ask('Erase ALL data on this device and start over? This cannot be undone.', { ok: 'Continue' })) && (await ask('Last check: save a backup first if you might need it. Erase everything now?', { ok: 'Erase' }))) {
                wipeVault();
                await disableBiometric();
                lock();
              }
            }}
          >
            <IconTile icon="trash" color="#C2410C" />
            <span className="row-main">
              <span className="row-title exp">Erase everything and start over</span>
              <span className="row-sub wrap">Removes all data, your PIN and settings from this device</span>
            </span>
            <Icon name="chevR" />
          </button>
        </div>
      </section>

      <p className="muted small" style={{ textAlign: 'center' }}>
        Ledgerly {APP_VERSION} · {data.txns.length} records · encrypted on this device (AES-256-GCM)
      </p>

      {sheet === 'edit' && <EditProfileSheet onClose={() => setSheet(null)} />}
      {sheet === 'clear' && <ClearDataSheet onClose={() => setSheet(null)} />}
      {sheet === 'pass' && (
        <PasscodeSheet
          onClose={() => setSheet(null)}
          onDone={async (pass, kind) => {
            await beforePasscodeChange();
            setSession(await changePasscode(pass, kind, data));
            await refreshBiometric(pass);
            setTimeout(() => afterPasscodeChange(), 300);
            setSheet(null);
            toast(kind === 'pin' ? 'PIN changed' : 'Password changed');
          }}
        />
      )}
      {sheet === 'bio' && (
        <ConfirmPasscode
          title={`Turn on ${bioName()}`}
          note={`Enter your ${kindLabel} once. It's then kept in your phone's secure storage and only released after a ${isIOS() ? 'Face ID' : 'fingerprint'} scan.`}
          onClose={() => setSheet(null)}
          onOk={async (pass) => {
            await enableBiometric(pass);
            setBioOn(true);
            setSheet(null);
            toast(`${BioName()} unlock is on`);
          }}
        />
      )}
    </main>
  );
}

function EditProfileSheet({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore();
  const s = data.settings;
  const [name, setName] = useState(s.name);
  const [email, setEmail] = useState(s.email ?? '');
  const [phone, setPhone] = useState(s.phone ?? '');
  const emailBad = email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return (
    <Sheet title="Edit profile" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || emailBad) return;
          update((d) => ({ ...d, settings: { ...d.settings, name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined } }));
          toast('Profile saved');
          onClose();
        }}
      >
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
        <button className="btn primary block" disabled={!name.trim() || emailBad}>
          Save profile
        </button>
      </form>
    </Sheet>
  );
}

function ClearDataSheet({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore();
  const [pick, setPick] = useState({ records: false, budgets: false, debts: false, reminders: false, setup: false });
  const forced = pick.setup; // resetting accounts/categories also clears what points at them
  const eff = forced ? { ...pick, records: true, budgets: true, reminders: true } : pick;
  const counts = { records: data.txns.length, budgets: data.budgets.length, debts: data.debts.length, reminders: (data.reminders ?? []).length, setup: data.accounts.length };
  const items: { key: keyof typeof pick; label: string; sub: string }[] = [
    { key: 'records', label: 'All records', sub: `${counts.records} income, expense and transfer records` },
    { key: 'budgets', label: 'Budgets', sub: `${counts.budgets} budgets` },
    { key: 'debts', label: 'Debts & loans', sub: `${counts.debts} entries` },
    { key: 'reminders', label: 'Payment reminders', sub: `${counts.reminders} reminders` },
    { key: 'setup', label: 'Accounts & categories', sub: 'Back to the default Cash and Bank accounts and standard categories' },
  ];
  const any = Object.values(eff).some(Boolean);
  return (
    <Sheet title="Clear data" onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>
        Choose what to remove. Your profile, PIN and settings stay. Consider saving a backup first.
      </p>
      <div className="card list">
        {items.map((it) => (
          <label key={it.key} className="row" style={{ cursor: 'pointer' }}>
            <span className="row-main">
              <span className="row-title">{it.label}</span>
              <span className="row-sub wrap">{it.sub}</span>
            </span>
            <input
              type="checkbox"
              style={{ width: 22, height: 22, accentColor: 'var(--exp)' }}
              checked={eff[it.key]}
              disabled={forced && it.key !== 'setup' && it.key !== 'debts'}
              onChange={(e) => setPick((p) => ({ ...p, [it.key]: e.target.checked }))}
            />
          </label>
        ))}
      </div>
      <button
        className="btn block"
        style={{ background: 'var(--exp)', color: '#fff' }}
        disabled={!any}
        onClick={async () => {
          if (!(await ask('Clear the selected data? This cannot be undone.', { ok: 'Clear' }))) return;
          update((d) => {
            let next: AppData = { ...d };
            if (eff.records) next.txns = [];
            if (eff.budgets) next.budgets = [];
            if (eff.debts) next.debts = [];
            if (eff.reminders) next.reminders = [];
            if (eff.setup)
              next = {
                ...next,
                accounts: [
                  { id: uid(), name: 'Cash', kind: 'cash', initial: 0 },
                  { id: uid(), name: 'Bank account', kind: 'bank', initial: 0 },
                ],
                categories: defaultCategories(),
              };
            return next;
          });
          toast('Data cleared');
          onClose();
        }}
      >
        <Icon name="eraser" size={18} />
        Clear selected
      </button>
    </Sheet>
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
            setError(/cancel/i.test(String((err as Error).message)) ? 'Cancelled' : (err as Error).message || `Could not turn on ${bioName()}`);
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
