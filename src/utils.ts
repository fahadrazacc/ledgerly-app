import { Capacitor } from '@capacitor/core';
import type { AppData, Category, Txn, Budget } from './types';

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "Hide amounts" privacy mode: every amount shown through money() becomes dots.
let masked = false;
export const setMasked = (m: boolean) => {
  masked = m;
};

export function money(n: number, cur: string, sign = false) {
  if (masked) return `${cur} ••••`;
  const v = Math.abs(n);
  // Whole amounts stay short; cents always show two digits (12.5 → 12.50).
  const s = Number.isInteger(Math.round(v * 100) / 100) ? nf.format(v) : nf2.format(v);
  const prefix = n < 0 ? '−' : sign && n > 0 ? '+' : '';
  return `${prefix}${cur} ${s}`;
}

export function short(n: number) {
  const a = Math.abs(n);
  if (a >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1_000) return (n / 1_000).toFixed(a >= 100_000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
}

// ---------- dates ----------
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const startOfWeek = (d: Date) => {
  const day = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(startOfDay(d), -day);
};

export const monthLabel = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
export const monthShort = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short' });

/** Newest first: by date and time (to the millisecond), then by when it was added. */
export const byNewest = (a: { date: string; createdAt: number }, b: { date: string; createdAt: number }) =>
  b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0);

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Budgets that apply in the month starting at `start`. A one-month budget replaces the repeating one for the same category. */
export function budgetsFor(data: AppData, start: Date): Budget[] {
  const key = monthKey(start);
  const active = data.budgets.filter((b) => !b.month || b.month === key);
  return active.filter((b) => b.month || !active.some((o) => o.month && o.categoryId === b.categoryId));
}

export function inRange(iso: string, start: Date, end: Date) {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function dayLabel(key: string) {
  const [y, m, dd] = key.split('-').map(Number);
  const d = new Date(y, m - 1, dd);
  const today = startOfDay(new Date());
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  const base = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (diff === 0) return `Today, ${base}`;
  if (diff === 1) return `Yesterday, ${base}`;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const toDateInput = (d: Date) => toLocalInput(d).slice(0, 10);

// ---------- money maths ----------
export function balanceOf(data: AppData, accountId: string) {
  const acc = data.accounts.find((a) => a.id === accountId);
  let b = acc?.initial ?? 0;
  for (const t of data.txns) {
    if (t.type === 'income' && t.accountId === accountId) b += t.amount;
    else if (t.type === 'expense' && t.accountId === accountId) b -= t.amount;
    else if (t.type === 'transfer') {
      if (t.accountId === accountId) b -= t.amount;
      if (t.toAccountId === accountId) b += t.amount;
    }
  }
  return b;
}

export function totalBalance(data: AppData) {
  return data.accounts.filter((a) => !a.archived).reduce((s, a) => s + balanceOf(data, a.id), 0);
}

export function sums(txns: Txn[], start: Date, end: Date) {
  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (!inRange(t.date, start, end)) continue;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { income, expense };
}

export function byCategory(data: AppData, start: Date, end: Date, type: 'expense' | 'income') {
  const map = new Map<string, number>();
  for (const t of data.txns) {
    if (t.type !== type || !inRange(t.date, start, end)) continue;
    const k = t.categoryId ?? 'none';
    map.set(k, (map.get(k) ?? 0) + t.amount);
  }
  return [...map.entries()]
    .map(([id, amount]) => ({ category: data.categories.find((c) => c.id === id), amount }))
    .filter((x): x is { category: Category; amount: number } => !!x.category)
    .sort((a, b) => b.amount - a.amount);
}

export function spentInCategory(data: AppData, categoryId: string | null, start: Date, end: Date) {
  return data.txns
    .filter((t) => t.type === 'expense' && inRange(t.date, start, end) && (categoryId === null || t.categoryId === categoryId))
    .reduce((s, t) => s + t.amount, 0);
}

export function tint(hex: string, alpha = document.documentElement.dataset.theme === 'dark' ? 0.22 : 0.13) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '•'
  );
}

export async function download(filename: string, text: string, mime: string) {
  // Inside the Android app: write to the app cache, then open the share sheet (Save to Files, Drive, WhatsApp...).
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const res = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: filename, files: [res.uri] });
    return;
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(data: AppData) {
  const cat = (id?: string) => data.categories.find((c) => c.id === id)?.name ?? '';
  const acc = (id?: string) => data.accounts.find((a) => a.id === id)?.name ?? '';
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const ev = (id?: string) => (data.events ?? []).find((e) => e.id === id)?.name ?? '';
  const rows = [['Date', 'Type', 'Amount', 'Category', 'Account', 'To account', 'Event', 'Note']];
  [...data.txns]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((t) =>
      rows.push([
        toLocalInput(new Date(t.date)).replace('T', ' '),
        t.type,
        String(t.amount),
        cat(t.categoryId),
        acc(t.accountId),
        acc(t.toAccountId),
        ev(t.eventId),
        t.note ?? '',
      ]),
    );
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}

/** Shrinks a picked image to a square JPEG data URL (kept small inside the encrypted vault). */
export async function resizeImage(file: File, size = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Could not read that image'));
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const side = Math.min(img.width, img.height);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Fills in fields added in later versions so older saved data keeps working. */
export function normalize(d: AppData): AppData {
  return { ...d, reminders: d.reminders ?? [], budgets: d.budgets ?? [], debts: d.debts ?? [], events: d.events ?? [] };
}
