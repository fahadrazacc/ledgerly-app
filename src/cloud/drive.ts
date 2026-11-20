// Backups to the user's Google Drive, in the hidden app folder (only Ledgerly can see it).
import { getBackend } from './backend';
import { exportBackup } from '../vault';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const KEEP = 10;
let token: { value: string; exp: number } | null = null;

async function getToken() {
  if (token && token.exp > Date.now()) return token.value;
  const value = await (await getBackend()).googleAccessToken([SCOPE]);
  token = { value, exp: Date.now() + 50 * 60_000 };
  return value;
}

async function api(path: string, init: RequestInit = {}) {
  const t = await getToken();
  const r = await fetch(`https://www.googleapis.com${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` } });
  if (r.status === 401) token = null;
  if (!r.ok) throw new Error(r.status === 403 ? 'Google Drive refused access. Make sure the Google Drive API is enabled for the Ledgerly project.' : `Google Drive error (${r.status})`);
  return r;
}

export interface DriveFile {
  id: string;
  name: string;
  createdTime: string;
  size?: string;
}

export async function listDriveBackups(): Promise<DriveFile[]> {
  const r = await api(`/drive/v3/files?spaces=appDataFolder&orderBy=createdTime%20desc&pageSize=50&fields=files(id,name,createdTime,size)`);
  return ((await r.json()).files ?? []) as DriveFile[];
}

export async function backupToDrive(): Promise<DriveFile> {
  const text = exportBackup();
  if (!text) throw new Error('Nothing to back up yet');
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  const meta = { name: `ledgerly-backup-${stamp}.json`, parents: ['appDataFolder'], mimeType: 'application/json' };
  const boundary = 'ledgerly' + Math.random().toString(36).slice(2);
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
  const r = await api(`/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,size`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  const file = (await r.json()) as DriveFile;
  // keep the newest few
  const all = await listDriveBackups();
  await Promise.all(all.slice(KEEP).map((f) => api(`/drive/v3/files/${f.id}`, { method: 'DELETE' }).catch(() => undefined)));
  return file;
}

export async function downloadDriveBackup(id: string): Promise<string> {
  const r = await api(`/drive/v3/files/${id}?alt=media`);
  return r.text();
}
