import { ask } from '../confirm';
import { useRef, useState } from 'react';
import { Icon } from '../icons';
import { useStore } from '../store';
import { BackLink, Header, IconTile } from '../ui';
import { href } from '../router';
import { Avatar } from './Profile';
import { disableBiometric } from '../biometric';
import { CURRENCIES } from '../seed';
import { exportBackup, getMeta, importBackup, setMeta, wipeVault } from '../vault';
import { autoBackupNow, canSaveToPhone, FOLDER, saveBackupToPhone } from '../backup';
import { download, toCsv } from '../utils';

export function Settings() {
  const { data, update, lock, hidden, toggleHidden } = useStore();
  const [toast, setToast] = useState('');
  const [auto, setAuto] = useState(() => getMeta().autoBackup);
  const [lastAt, setLastAt] = useState(() => getMeta().lastBackupAt);
  const [busy, setBusy] = useState(false);
  const native = canSaveToPhone();
  const when = (t?: number) => (t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'never');
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 3500);
  };
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <main className="screen narrow">
      <Header title="Settings" left={<BackLink to="home" />} />

      <a className="card" href={href('profile')} style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: 'var(--ink)' }}>
        <Avatar size={56} radius={18} />
        <span className="row-main">
          <span style={{ fontSize: 17, fontWeight: 800 }}>{data.settings.name}</span>
          <span className="row-sub wrap">{data.settings.email || 'Photo, email, PIN and fingerprint'}</span>
        </span>
        <Icon name="chevR" />
      </a>

      <section className="section">
        <h2 className="h2">Preferences</h2>
        <div className="card list">
          <div className="row">
            <IconTile icon={hidden ? 'eyeOff' : 'eye'} color="#7048E8" />
            <span className="row-main">
              <span className="row-title">Hide amounts</span>
              <span className="row-sub wrap">Show •••• instead of numbers, e.g. in public</span>
            </span>
            <label className="switch">
              <input type="checkbox" aria-label="Hide amounts" checked={hidden} onChange={toggleHidden} />
              <span />
            </label>
          </div>
          <label className="row">
            <IconTile icon="cash" color="#087F5B" />
            <span className="row-main">
              <span className="row-title">Currency symbol</span>
            </span>
            <select className="input" style={{ width: 96, height: 42 }} value={data.settings.currency} onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, currency: e.target.value } }))}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <a className="row" href={href('categories')}>
            <IconTile icon="tag" color="#E67700" />
            <span className="row-main">
              <span className="row-title">Categories</span>
              <span className="row-sub wrap">Create, edit or hide categories</span>
            </span>
            <Icon name="chevR" />
          </a>
          <a className="row" href={href('accounts')}>
            <IconTile icon="bank" color="#3B5BDB" />
            <span className="row-main">
              <span className="row-title">Accounts</span>
              <span className="row-sub wrap">Add accounts, make them active or inactive</span>
            </span>
            <Icon name="chevR" />
          </a>
          <button className="row" onClick={lock}>
            <IconTile icon="lock" color="#495057" />
            <span className="row-main">
              <span className="row-title">Lock now</span>
              <span className="row-sub wrap">Also locks after 5 minutes in the background</span>
            </span>
            <Icon name="chevR" />
          </button>
        </div>
      </section>

      <section className="section">
        <h2 className="h2">Backup &amp; restore</h2>
        <div className="card list">
          {native && (
            <>
              <button
                className="row"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const where = await saveBackupToPhone();
                    setLastAt(getMeta().lastBackupAt);
                    flash(`Saved to ${where}`);
                  } catch (e) {
                    flash('Could not save: ' + ((e as Error).message || 'storage not available'));
                  }
                  setBusy(false);
                }}
              >
                <IconTile icon="download" color="#087F5B" />
                <span className="row-main">
                  <span className="row-title">Save backup to phone</span>
                  <span className="row-sub wrap">To Documents/{FOLDER} · kept if you uninstall the app</span>
                </span>
                <Icon name="chevR" />
              </button>
              <div className="row">
                <IconTile icon="savings" color="#0C8599" />
                <span className="row-main">
                  <span className="row-title">Automatic backup</span>
                  <span className="row-sub wrap">{auto ? `Updates after every change · last ${when(lastAt)}` : `Keep a backup in Documents/${FOLDER} up to date`}</span>
                </span>
                <label className="switch">
                  <input
                    type="checkbox"
                    aria-label="Automatic backup"
                    checked={auto}
                    onChange={async (e) => {
                      const on = e.target.checked;
                      setMeta({ autoBackup: on });
                      setAuto(on);
                      if (on) {
                        try {
                          const where = await autoBackupNow();
                          setLastAt(getMeta().lastBackupAt);
                          flash(`Automatic backup on · ${where}`);
                        } catch (err) {
                          setMeta({ autoBackup: false });
                          setAuto(false);
                          flash('Could not save: ' + ((err as Error).message || 'storage not available'));
                        }
                      }
                    }}
                  />
                  <span />
                </label>
              </div>
            </>
          )}
          <button
            className="row"
            onClick={() => {
              const b = exportBackup();
              if (b) download(`ledgerly-backup-${stamp}.json`, b, 'application/json').then(() => flash(native ? 'Backup ready to share' : 'Backup downloaded')).catch((e: Error) => flash(e.message));
            }}
          >
            <IconTile icon={native ? 'upload' : 'download'} color="#3B5BDB" />
            <span className="row-main">
              <span className="row-title">{native ? 'Share backup' : 'Download encrypted backup'}</span>
              <span className="row-sub wrap">{native ? 'Send to Google Drive, email or WhatsApp' : 'Restore it on any device with your PIN or password'}</span>
            </span>
            <Icon name="chevR" />
          </button>
          <button className="row" onClick={() => fileRef.current?.click()}>
            <IconTile icon="upload" color="#7048E8" />
            <span className="row-main">
              <span className="row-title">Restore from backup</span>
              <span className="row-sub wrap">{native ? `Pick a file, e.g. from Documents/${FOLDER}. Replaces current data` : 'Replaces the data on this device'}</span>
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
              <span className="row-sub wrap">Open in Excel or Google Sheets (not encrypted)</span>
            </span>
            <Icon name="chevR" />
          </button>
        </div>
        {native && (
          <p className="muted small" style={{ margin: 0 }}>
            Backups are encrypted with your PIN or password, so they're safe to keep in Documents or Google Drive. After reinstalling, tap <strong>Restore from a backup file</strong> on the first screen and open Documents → {FOLDER}.
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            e.target.value = '';
            if (!(await ask('Replace all data on this device with this backup? You will need the PIN or password that was used for the backup.', { ok: 'Restore' }))) return;
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
              await disableBiometric();
              lock();
            }
          }}
        >
          <Icon name="trash" size={18} />
          Erase all data
        </button>
      </section>

      <p className="muted small" style={{ textAlign: 'center' }}>
        Ledgerly 0.2 · {data.txns.length} records · data encrypted on this device (AES-256-GCM)
      </p>

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
