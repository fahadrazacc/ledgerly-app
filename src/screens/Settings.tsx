import { ask } from '../confirm';
import { useRef, useState } from 'react';
import { Icon } from '../icons';
import { useStore } from '../store';
import { BackLink, Header, IconTile, Sheet } from '../ui';
import { CURRENCIES } from '../seed';
import { changePin, exportBackup, importBackup, wipeVault } from '../vault';
import { download, toCsv } from '../utils';

export function Settings() {
  const { data, update, lock, setSession } = useStore();
  const [pinSheet, setPinSheet] = useState(false);
  const [toast, setToast] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 2500);
  };
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <main className="screen narrow">
      <Header title="Settings" left={<BackLink to="home" />} />

      <section className="section">
        <h2 className="h2">Profile</h2>
        <div className="card form">
          <label className="field">
            <span>Name</span>
            <input className="input" value={data.settings.name} onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, name: e.target.value } }))} />
          </label>
          <label className="field">
            <span>Currency symbol</span>
            <select className="input" value={data.settings.currency} onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, currency: e.target.value } }))}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="section">
        <h2 className="h2">Security</h2>
        <div className="card list">
          <button className="row" onClick={() => setPinSheet(true)}>
            <IconTile icon="lock" color="#3B5BDB" />
            <span className="row-main">
              <span className="row-title">Change PIN</span>
              <span className="row-sub">Re-encrypts your data with the new PIN</span>
            </span>
            <Icon name="chevR" />
          </button>
          <button className="row" onClick={lock}>
            <IconTile icon="lock" color="#495057" />
            <span className="row-main">
              <span className="row-title">Lock now</span>
              <span className="row-sub">The app also locks after 5 minutes in the background</span>
            </span>
            <Icon name="chevR" />
          </button>
        </div>
      </section>

      <section className="section">
        <h2 className="h2">Your data</h2>
        <div className="card list">
          <button
            className="row"
            onClick={() => {
              const b = exportBackup();
              if (b) download(`ledgerly-backup-${stamp}.json`, b, 'application/json').then(() => flash('Backup ready')).catch((e: Error) => flash(e.message));
            }}
          >
            <IconTile icon="download" color="#087F5B" />
            <span className="row-main">
              <span className="row-title">Download encrypted backup</span>
              <span className="row-sub">Restore it on any device with your PIN</span>
            </span>
            <Icon name="chevR" />
          </button>
          <button className="row" onClick={() => fileRef.current?.click()}>
            <IconTile icon="upload" color="#7048E8" />
            <span className="row-main">
              <span className="row-title">Restore from backup</span>
              <span className="row-sub">Replaces the data on this device</span>
            </span>
            <Icon name="chevR" />
          </button>
          <button
            className="row"
            onClick={() => {
              download(`ledgerly-records-${stamp}.csv`, toCsv(data), 'text/csv').then(() => flash('CSV exported')).catch((e: Error) => flash(e.message));
            }}
          >
            <IconTile icon="list" color="#0C8599" />
            <span className="row-main">
              <span className="row-title">Export records as CSV</span>
              <span className="row-sub">Open in Excel or Google Sheets (not encrypted)</span>
            </span>
            <Icon name="chevR" />
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            e.target.value = '';
            if (!(await ask('Replace all data on this device with this backup? You will need the PIN that was used for the backup.', { ok: 'Restore' }))) return;
            try {
              importBackup(await f.text());
              lock();
            } catch (err) {
              flash((err as Error).message);
            }
          }}
        />
      </section>

      <section className="section">
        <h2 className="h2">Danger zone</h2>
        <button
          className="btn danger block"
          onClick={async () => {
            if ((await ask('Erase ALL data on this device? This cannot be undone.', { ok: 'Continue' })) && (await ask('Last check: download a backup first if you might need it. Erase everything now?', { ok: 'Erase' }))) {
              wipeVault();
              lock();
            }
          }}
        >
          <Icon name="trash" size={18} />
          Erase all data
        </button>
      </section>

      <p className="muted small" style={{ textAlign: 'center' }}>
        Ledgerly 0.1 · {data.txns.length} records · data encrypted on this device (AES-256-GCM)
      </p>

      {pinSheet && (
        <PinSheet
          onClose={() => setPinSheet(false)}
          onDone={async (pin) => {
            setSession(await changePin(pin, data));
            setPinSheet(false);
            flash('PIN changed');
          }}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function PinSheet({ onClose, onDone }: { onClose: () => void; onDone: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState('');
  return (
    <Sheet title="Change PIN" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!/^\d{4,6}$/.test(pin)) return setError('PIN must be 4 to 6 digits');
          if (pin !== pin2) return setError('PINs do not match');
          onDone(pin).catch((err: Error) => setError(err.message));
        }}
      >
        <label className="field">
          <span>New PIN</span>
          <input className="input" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus />
        </label>
        <label className="field">
          <span>Confirm new PIN</span>
          <input className="input" type="password" inputMode="numeric" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn primary block">Change PIN</button>
      </form>
    </Sheet>
  );
}
