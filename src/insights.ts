// Smart insights computed on the device: no AI service needed.
import type { AppData } from './types';
import type { IconName } from './icons';
import { addDays, addMonths, byCategory, inRange, money, spentInCategory, startOfDay, startOfMonth, sums, budgetsFor } from './utils';

export interface Insight {
  id: string;
  icon: IconName;
  tone: 'good' | 'warn' | 'info';
  title: string;
  text: string;
  link?: string;
}

export function forecast(data: AppData, now = new Date()) {
  const start = startOfMonth(now);
  const end = addMonths(start, 1);
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const day = now.getDate();
  const spent = spentInCategory(data, null, start, end);
  // project using the median-ish daily pace: ignore single expenses over 25% of the month so far
  const big = data.txns.filter((t) => t.type === 'expense' && inRange(t.date, start, end) && t.amount > spent * 0.25).reduce((s, t) => s + t.amount, 0);
  const pace = (spent - big) / Math.max(1, day);
  const projected = Math.round(spent + pace * (daysInMonth - day));
  const lastStart = addMonths(start, -1);
  const lastTotal = spentInCategory(data, null, lastStart, start);
  const budget = budgetsFor(data, start).find((b) => b.categoryId === null)?.limit;
  return { spent, projected, pace, daysLeft: daysInMonth - day, daysInMonth, lastTotal, budget };
}

export function computeInsights(data: AppData, now = new Date()): Insight[] {
  const cur = data.settings.currency;
  const out: Insight[] = [];
  const start = startOfMonth(now);
  const end = addMonths(start, 1);
  const day = now.getDate();
  const f = forecast(data, now);

  // 1. month-end forecast
  if (f.spent > 0) {
    const vsBudget = f.budget ? f.projected - f.budget : null;
    out.push({
      id: 'forecast',
      icon: 'trend',
      tone: vsBudget !== null && vsBudget > 0 ? 'warn' : 'info',
      title: `On track to spend ${money(f.projected, cur)} this month`,
      text:
        vsBudget !== null
          ? vsBudget > 0
            ? `That's ${money(vsBudget, cur)} over your ${money(f.budget!, cur)} budget. Spending about ${money(Math.max(0, Math.floor((f.budget! - f.spent) / Math.max(1, f.daysLeft))), cur)} a day from now on keeps you within it.`
            : `That's within your ${money(f.budget!, cur)} budget, with about ${money(-vsBudget, cur)} to spare.`
          : f.lastTotal
            ? `Last month you spent ${money(f.lastTotal, cur)} in total.`
            : `Based on ${money(Math.round(f.pace), cur)} a day so far.`,
    });
  }

  // 2. categories running higher than usual (same point in the month, last 3 months)
  const nowCats = byCategory(data, start, now, 'expense');
  const totalNow = nowCats.reduce((s, c) => s + c.amount, 0);
  for (const c of nowCats.slice(0, 8)) {
    let prev = 0;
    let n = 0;
    for (let m = 1; m <= 3; m++) {
      const ms = addMonths(start, -m);
      const sameDay = addDays(ms, day);
      const v = byCategory(data, ms, sameDay, 'expense').find((x) => x.category.id === c.category.id)?.amount ?? 0;
      prev += v;
      n++;
    }
    const avg = prev / n;
    if (avg > 0 && c.amount > avg * 1.3 && c.amount > totalNow * 0.05) {
      out.push({ id: 'up-' + c.category.id, icon: c.category.icon, tone: 'warn', title: `${c.category.name} is ${Math.round((c.amount / avg - 1) * 100)}% higher than usual`, text: `${money(c.amount, cur)} so far vs about ${money(Math.round(avg), cur)} by this day in recent months.` });
    } else if (avg > 0 && c.amount < avg * 0.7 && avg > totalNow * 0.05) {
      out.push({ id: 'down-' + c.category.id, icon: c.category.icon, tone: 'good', title: `${c.category.name} is down ${Math.round((1 - c.amount / avg) * 100)}%`, text: `${money(c.amount, cur)} so far vs about ${money(Math.round(avg), cur)} usually. Nice.` });
    }
  }

  // 3. savings rate
  const m = sums(data.txns, start, end);
  if (m.income > 0) {
    const rate = Math.round(((m.income - m.expense) / m.income) * 100);
    out.push({ id: 'save', icon: 'savings', tone: rate >= 20 ? 'good' : rate >= 0 ? 'info' : 'warn', title: `You've kept ${rate}% of this month's income`, text: rate >= 20 ? 'A healthy savings rate. Keep it up.' : rate >= 0 ? 'Aiming for 20% or more builds a cushion quickly.' : 'Spending is above income this month.' });
  }

  // 4. budgets at risk
  for (const b of budgetsFor(data, start).filter((x) => x.categoryId)) {
    const spent = spentInCategory(data, b.categoryId, start, end);
    const proj = (spent / Math.max(1, day)) * f.daysInMonth;
    const cat = data.categories.find((c) => c.id === b.categoryId);
    if (cat && spent < b.limit && proj > b.limit * 1.05)
      out.push({ id: 'risk-' + b.id, icon: 'target', tone: 'warn', title: `${cat.name} budget may run out`, text: `At this pace you'll reach about ${money(Math.round(proj), cur)} against ${money(b.limit, cur)}.`, link: 'budgets' });
  }

  // 5. biggest expense this month
  const biggest = data.txns.filter((t) => t.type === 'expense' && inRange(t.date, start, end)).sort((a, b) => b.amount - a.amount)[0];
  if (biggest && totalNow > 0) {
    const cat = data.categories.find((c) => c.id === biggest.categoryId);
    out.push({ id: 'big', icon: 'arrowUR', tone: 'info', title: `Biggest expense: ${money(biggest.amount, cur)}`, text: `${biggest.note || cat?.name || 'An expense'} on ${new Date(biggest.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${Math.round((biggest.amount / totalNow) * 100)}% of this month's spending.` });
  }

  // 6. repeating payments without a reminder
  const reminded = new Set((data.reminders ?? []).filter((r) => r.active).map((r) => r.title.toLowerCase()));
  const groups = new Map<string, Set<string>>();
  const amounts = new Map<string, number[]>();
  for (const t of data.txns) {
    if (t.type !== 'expense' || !t.note) continue;
    const d = new Date(t.date);
    if (d < addMonths(start, -4)) continue;
    const k = t.note.trim().toLowerCase();
    if (!groups.has(k)) groups.set(k, new Set());
    groups.get(k)!.add(`${d.getFullYear()}-${d.getMonth()}`);
    amounts.set(k, [...(amounts.get(k) ?? []), t.amount]);
  }
  for (const [k, months] of groups) {
    const a = amounts.get(k)!;
    const avg = a.reduce((s, x) => s + x, 0) / a.length;
    const steady = a.every((x) => Math.abs(x - avg) <= avg * 0.35);
    if (months.size >= 3 && a.length <= months.size + 1 && steady && !reminded.has(k)) {
      out.push({ id: 'rec-' + k, icon: 'bell', tone: 'info', title: `“${k[0].toUpperCase() + k.slice(1)}” looks monthly`, text: `About ${money(Math.round(avg), cur)} each month. Add a payment reminder so it's never missed.`, link: 'reminders' });
      if (out.filter((x) => x.id.startsWith('rec-')).length >= 2) break;
    }
  }

  // 7. spending by weekday (last 90 days)
  const since = addDays(startOfDay(now), -90);
  const wd = new Array(7).fill(0);
  const wdDays = new Array(7).fill(0);
  for (let d = new Date(since); d < now; d = addDays(d, 1)) wdDays[d.getDay()]++;
  data.txns.filter((t) => t.type === 'expense' && new Date(t.date) >= since).forEach((t) => (wd[new Date(t.date).getDay()] += t.amount));
  const avgs = wd.map((v, i) => v / Math.max(1, wdDays[i]));
  const top = avgs.indexOf(Math.max(...avgs));
  const overall = avgs.reduce((s, v) => s + v, 0) / 7;
  if (overall > 0 && avgs[top] > overall * 1.4)
    out.push({ id: 'weekday', icon: 'calendar', tone: 'info', title: `${['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][top]} cost you the most`, text: `About ${money(Math.round(avgs[top]), cur)} on average vs ${money(Math.round(overall), cur)} on a typical day (last 90 days).` });

  // 8. no-spend days
  const spendDays = new Set(data.txns.filter((t) => t.type === 'expense' && inRange(t.date, start, end)).map((t) => new Date(t.date).getDate()));
  const none = Math.max(0, day - spendDays.size);
  if (day >= 5) out.push({ id: 'nospend', icon: 'check', tone: none >= 5 ? 'good' : 'info', title: `${none} no-spend day${none === 1 ? '' : 's'} this month`, text: none >= 5 ? 'Every one of those adds up.' : 'Try a few no-spend days a week to cut small purchases.' });

  const order = { warn: 0, good: 1, info: 2 } as const;
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}
