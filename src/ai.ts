// AI summaries and questions using Google Gemini with the user's own API key.
// Only a compact summary of totals is sent (record notes only if the user allows it).
import type { AppData } from './types';
import { addMonths, balanceOf, byCategory, monthLabel, spentInCategory, startOfMonth, sums } from './utils';
import { forecast } from './insights';

const MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

export async function askGemini(key: string, system: string, prompt: string): Promise<string> {
  let last = '';
  for (const m of MODELS) {
    let r: Response;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key.trim() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
        }),
      });
    } catch {
      throw new Error("Can't reach Google AI. Check your internet connection.");
    }
    const j = await r.json().catch(() => ({}));
    if (r.status === 404) {
      last = 'model not found';
      continue;
    }
    if (!r.ok) {
      const msg: string = j?.error?.message ?? '';
      if (r.status === 400 && /api key/i.test(msg)) throw new Error("That Gemini API key isn't valid. Check it in Profile & settings → AI assistant.");
      if (r.status === 429) throw new Error('The free AI limit was reached for now. Try again in a minute.');
      if (r.status === 403) throw new Error('Google refused this key. Make sure the Gemini API is allowed for it.');
      throw new Error(msg || `AI error (${r.status})`);
    }
    const text = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim();
    if (!text) throw new Error('The AI returned no answer. Try again.');
    return text;
  }
  throw new Error('No Gemini model was available' + (last ? ` (${last})` : ''));
}

/** A compact, numbers-only picture of the user's finances. */
export function financeContext(data: AppData, now = new Date()) {
  const cur = data.settings.currency;
  const start = startOfMonth(now);
  const end = addMonths(start, 1);
  const r = (n: number) => Math.round(n);
  const lines: string[] = [];
  lines.push(`Currency: ${cur}. Today: ${now.toDateString()}.`);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(start, i - 5)).map((m) => {
    const s = sums(data.txns, m, addMonths(m, 1));
    return `${monthLabel(m)}: income ${r(s.income)}, spending ${r(s.expense)}`;
  });
  lines.push('Last 6 months:\n' + months.join('\n'));
  const f = forecast(data, now);
  lines.push(`This month so far: spent ${r(f.spent)} in ${now.getDate()} of ${f.daysInMonth} days; projected month total ${r(f.projected)}; last month total ${r(f.lastTotal)}.`);
  const cats = byCategory(data, start, end, 'expense').slice(0, 12);
  const prevCats = byCategory(data, addMonths(start, -1), start, 'expense');
  lines.push('This month by category (last month in brackets):\n' + cats.map((c) => `${c.category.name}: ${r(c.amount)} (${r(prevCats.find((p) => p.category.id === c.category.id)?.amount ?? 0)})`).join('\n'));
  const inc = byCategory(data, start, end, 'income');
  if (inc.length) lines.push('Income this month: ' + inc.map((c) => `${c.category.name} ${r(c.amount)}`).join(', '));
  if (data.budgets.length)
    lines.push(
      'Budgets this month: ' +
        data.budgets
          .map((b) => `${b.categoryId ? data.categories.find((c) => c.id === b.categoryId)?.name : 'Whole month'} ${r(spentInCategory(data, b.categoryId, start, end))} of ${r(b.limit)}`)
          .join('; '),
    );
  const accts = data.accounts.filter((a) => !a.archived);
  lines.push('Account balances: ' + accts.map((a) => `${a.name} ${r(balanceOf(data, a.id))}`).join('; '));
  const events = (data.events ?? []).filter((e) => !e.archived);
  if (events.length)
    lines.push(
      'Events: ' +
        events
          .map((e) => {
            const spent = data.txns.filter((t) => t.eventId === e.id && t.type === 'expense').reduce((s, t) => s + t.amount, 0);
            return `${e.name} (${e.start}${e.end ? ' to ' + e.end : ''}) spent ${r(spent)}${e.budget ? ' of budget ' + r(e.budget) : ''}`;
          })
          .join('; '),
    );
  const due = (data.reminders ?? []).filter((x) => x.active).slice(0, 8);
  if (due.length) lines.push('Upcoming bills: ' + due.map((x) => `${x.title} ${x.amount ? r(x.amount) : ''} due ${x.due.slice(0, 10)}`).join('; '));
  const open = data.debts.filter((d) => !d.settled);
  if (open.length) lines.push(`Debts: owed to user ${r(open.filter((d) => d.kind === 'lent').reduce((s, d) => s + d.amount, 0))}, user owes ${r(open.filter((d) => d.kind === 'borrowed').reduce((s, d) => s + d.amount, 0))}.`);
  const biggest = data.txns
    .filter((t) => t.type === 'expense' && new Date(t.date) >= start)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8)
    .map((t) => `${t.date.slice(0, 10)} ${data.categories.find((c) => c.id === t.categoryId)?.name ?? ''} ${r(t.amount)}${data.settings.ai?.includeNotes && t.note ? ` "${t.note}"` : ''}`);
  if (biggest.length) lines.push('Largest expenses this month:\n' + biggest.join('\n'));
  return lines.join('\n\n');
}

const SYSTEM = `You are Ledgerly's friendly money assistant. You get a summary of one person's own finances.
Rules: use ONLY the numbers given; never invent amounts or facts; write amounts with the given currency symbol and thousands separators; be concise, warm and practical; no generic disclaimers.
Format: plain text. Use "- " for bullet points and **bold** sparingly. No tables.`;

export function summaryPrompt(data: AppData) {
  return {
    system: SYSTEM,
    prompt: `Here is my financial data:\n\n${financeContext(data)}\n\nWrite my monthly summary: start with 2–3 sentences on how this month is going compared with recent months. Then "**What stands out**" with 3 bullets, and "**Tips**" with 3 specific, practical bullets based on my numbers. Under 200 words.`,
  };
}

export function questionPrompt(data: AppData, question: string) {
  return {
    system: SYSTEM,
    prompt: `My financial data:\n\n${financeContext(data)}\n\nMy question: ${question}\n\nAnswer in under 120 words. If the data can't answer it, say what is missing.`,
  };
}
