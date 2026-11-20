// Backups saved on the phone itself, in the shared Documents/Ledgerly folder.
// That folder is not removed when the app is uninstalled, so a backup there can be restored
// after a reinstall (via "Restore from a backup file", which opens the phone's file picker).
// The file is the encrypted vault, so it is unreadable without the PIN or password.
import { Capacitor } from '@capacitor/core';
import { exportBackup, getMeta, setMeta } from './vault';

export const FOLDER = 'Ledgerly';
export const canSaveToPhone = () => Capacitor.isNativePlatform();

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

async function write(name: string, text: string) {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  try {
    const perm = await Filesystem.checkPermissions();
    if (perm.publicStorage !== 'granted') await Filesystem.requestPermissions();
  } catch {
    /* not needed on newer Android */
  }
  await Filesystem.writeFile({ path: `${FOLDER}/${name}`, data: text, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
}

/** Saves a dated backup file. Returns where it went, for showing to the user. */
export async function saveBackupToPhone(): Promise<string> {
  const text = exportBackup();
  if (!text) throw new Error('Nothing to back up yet');
  const name = `ledgerly-backup-${stamp()}.json`;
  await write(name, text);
  setMeta({ lastBackupAt: Date.now() });
  return `Documents/${FOLDER}/${name}`;
}

/** Keeps one automatic backup file up to date. */
export async function autoBackupNow(): Promise<string> {
  const text = exportBackup();
  if (!text) throw new Error('Nothing to back up yet');
  let name = getMeta().autoFile ?? 'ledgerly-auto-backup.json';
  try {
    await write(name, text);
  } catch {
    // A file left by an earlier install can't be overwritten on newer Android: start a new one.
    name = `ledgerly-auto-backup-${stamp()}.json`;
    await write(name, text);
  }
  setMeta({ autoFile: name, lastBackupAt: Date.now() });
  return `Documents/${FOLDER}/${name}`;
}

let timer: ReturnType<typeof setTimeout> | undefined;
/** Called after every save: waits for a quiet moment, then refreshes the automatic backup. */
export function scheduleAutoBackup() {
  if (!canSaveToPhone() || !getMeta().autoBackup) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    autoBackupNow().catch((e) => console.warn('Auto backup failed', e));
  }, 4000);
}
