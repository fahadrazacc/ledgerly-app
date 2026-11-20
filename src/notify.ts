// Local notifications (Android app only): daily "add your spending" nudge, payment reminders,
// debt due dates and budget alerts. Everything is scheduled on the phone; nothing is sent anywhere.
import { Capacitor } from '@capacitor/core';
import type { AppData, NotifySettings, Reminder, Repeat } from './types';
import { addMonths, money, spentInCategory, startOfMonth } from './utils';
import { go } from './router';

export const DEFAULT_NOTIFY: NotifySettings = { daily: false, dailyTime: '21:00', payments: true, budgets: true, debts: true };
export const notifyOf = (d: AppData) => ({ ...DEFAULT_NOTIFY, ...(d.settings.notify ?? {}) });
export const canNotify = () => Capacitor.isNativePlatform();

const plugin = () => import('@capacitor/local-notifications');
const CHANNEL = 'ledgerly-reminders';

export async function notificationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (!canNotify()) return 'denied';
  const { LocalNotifications } = await plugin();
  const p = await LocalNotifications.checkPermissions();
  return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
}

export async function askNotificationPermission() {
  if (!canNotify()) return false;
  const { LocalNotifications } = await plugin();
  const p = await LocalNotifications.requestPermissions();
  return p.display === 'granted';
}

/** Next occurrence after `iso` for a repeating reminder. */
export function nextDue(iso: string, repeat: Repeat): string {
  const d = new Date(iso);
  if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'monthly') {
    const day = d.getDate();
    const n = addMonths(d, 1);
    const last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
    n.setDate(Math.min(day, last));
    n.setHours(d.getHours(), d.getMinutes());
    return n.toISOString();
  } else if (repeat === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

// Stable positive 31-bit id from a string, so the same item keeps the same notification id.
function nid(key: string) {
  let h = 7;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (Math.abs(h) % 2_000_000_000) + 1000;
}

let listening = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Re-plans every scheduled notification from the current data (debounced). */
export function syncNotifications(data: AppData) {
  if (!canNotify()) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    resync(data).catch((e) => console.warn('Notification sync failed', e));
  }, 1500);
}

async function resync(data: AppData) {
  const { LocalNotifications } = await plugin();
  if (!listening) {
    listening = true;
    await LocalNotifications.createChannel({ id: CHANNEL, name: 'Reminders', description: 'Payment and spending reminders', importance: 4 }).catch(() => undefined);
    LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
      const route = a.notification.extra?.route;
      if (typeof route === 'string') go(route);
    });
  }
  if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });

  const n = notifyOf(data);
  const hide = !!data.settings.hideAmounts;
  const cur = data.settings.currency;
  const now = Date.now();
  const list: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = [];
  const base = { channelId: CHANNEL, smallIcon: 'ic_stat_ledgerly', iconColor: '#3B5BDB' };

  if (n.daily) {
    const [hour, minute] = n.dailyTime.split(':').map(Number);
    list.push({ ...base, id: 1, title: 'Anything to add today?', body: 'Log today’s spending in a few seconds to keep your budget accurate.', schedule: { on: { hour, minute }, allowWhileIdle: true }, extra: { route: 'add?from=home' } });
  }

  if (n.payments) {
    for (const r of data.reminders ?? []) {
      if (!r.active) continue;
      const due = new Date(r.due);
      const amount = r.amount && !hide ? ` · ${money(r.amount, cur)}` : '';
      const route = `add?reminder=${r.id}&from=reminders`;
      if (due.getTime() > now)
        list.push({ ...base, id: nid(r.id + ':due'), title: `${r.title} is due today`, body: `Tap to record it${amount}`, schedule: { at: due, allowWhileIdle: true }, extra: { route } });
      if (r.daysBefore > 0) {
        const early = new Date(due.getTime() - r.daysBefore * 86_400_000);
        if (early.getTime() > now)
          list.push({ ...base, id: nid(r.id + ':early'), title: `${r.title} due ${r.daysBefore === 1 ? 'tomorrow' : `in ${r.daysBefore} days`}`, body: `Coming up${amount}`, schedule: { at: early, allowWhileIdle: true }, extra: { route: 'reminders' } });
      }
    }
  }

  if (n.debts) {
    for (const d of data.debts) {
      if (d.settled || !d.due) continue;
      const at = new Date(d.due);
      at.setHours(10, 0, 0, 0);
      if (at.getTime() <= now) continue;
      const amount = hide ? '' : ` ${money(d.amount, cur)}`;
      list.push({ ...base, id: nid(d.id + ':debt'), title: d.kind === 'lent' ? `${d.person} owes you${amount}` : `You owe ${d.person}${amount}`, body: 'Due today', schedule: { at, allowWhileIdle: true }, extra: { route: 'accounts' } });
    }
  }

  for (let i = 0; i < list.length; i += 50) await LocalNotifications.schedule({ notifications: list.slice(i, i + 50) });
}

/** After a new expense: warn when a budget passes 80% or 100% this month. Returns a message, if any. */
export function budgetAlert(before: AppData, after: AppData, categoryId?: string): string | null {
  if (!notifyOf(after).budgets) return null;
  const start = startOfMonth(new Date());
  const end = addMonths(start, 1);
  const msgs: string[] = [];
  for (const b of after.budgets) {
    if (b.categoryId !== null && b.categoryId !== categoryId) continue;
    const was = spentInCategory(before, b.categoryId, start, end) / b.limit;
    const now = spentInCategory(after, b.categoryId, start, end) / b.limit;
    const name = b.categoryId === null ? 'Monthly budget' : after.categories.find((c) => c.id === b.categoryId)?.name ?? 'Budget';
    if (was < 1 && now >= 1) msgs.push(`${name}: over budget`);
    else if (was < 0.8 && now >= 0.8) msgs.push(`${name}: ${Math.round(now * 100)}% used`);
  }
  return msgs.length ? msgs.join(' · ') : null;
}

export async function notifyNow(title: string, body: string) {
  if (!canNotify() || (await notificationPermission()) !== 'granted') return;
  const { LocalNotifications } = await plugin();
  await LocalNotifications.schedule({ notifications: [{ id: nid(title + Date.now()), title, body, channelId: CHANNEL, smallIcon: 'ic_stat_ledgerly', iconColor: '#3B5BDB', schedule: { at: new Date(Date.now() + 1000) } }] });
}

export const upcoming = (data: AppData, days = 7): Reminder[] => {
  const limit = Date.now() + days * 86_400_000;
  return (data.reminders ?? []).filter((r) => r.active && new Date(r.due).getTime() <= limit).sort((a, b) => a.due.localeCompare(b.due));
};
