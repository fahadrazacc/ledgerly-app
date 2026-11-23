// Analysis: how the month and budgets are going, worked out on the device from the records.
import { useMemo, useState } from 'react';
import { Icon, type IconName } from '../icons';
import { useStore } from '../store';
import { href } from '../router';
import { BackLink, Header, IconTile } from '../ui';
import { computeInsights, type Insight } from '../insights';
import { PairBars, useWide } from '../charts';
import { addDays, addMonths, byCategory, inRange, monthLabel, monthShort, money, spentInCategory, startOfMonth, sums } from '../utils';
import type { AppData } from '../types';

type Tone = 'good' | 'warn' | 'bad' | 'info';
const TONE: Record<Tone, string> = { good: 'var(--inc)', warn: '#E8590C', bad: 'var(--exp)', info: 'var(--accent)' };
const DAY = 86_400_000;

/** The point in the month to measure at: now for the current month, the last moment for a past one. */
function measureAt(start: Date) {
  const end = addMonths(start, 1);
  const now = new Date();
  return now < end ? now : new Date(end.getTime() - 1);
}

function paceStatus(spent: number, limit: number, projected: number, complete = false): { tone: Tone; label: string } {
  if (spent > limit) return { tone: 'bad', label: 'Over budget' };
  if (complete) return { tone: 'good', label: 'Within budget' };
  if (projected > limit * 1.02) return { tone: 'warn', label: 'Spending too fast' };
  if (spent > limit * 0.9) return { tone: 'warn', label: 'Almost used' };
  return { tone: 'good', label: 'On track' };
}

/** A budget bar with a marker for where spending "should" be by today. */
function PaceBar({ spent, limit, expected, tone }: { spent: number; limit: number; expected: number; tone: Tone }) {
  const pct = limit > 0 ? (spent / limit) * 100 : 0;
  return (
    <div className="pace" role="img" aria-label={`${Math.round(pct)}% used, ${Math.round(expected * 100)}% of the month gone`}>
      <div className="pace-fill" style={{ width: `${Math.min(100, pct)}%`, background: TONE[tone] }} />
      {expected < 1 && <span className="pace-mark" style={{ left: `${expected * 100}%` }} />}
    </div>
  );
}

function Delta({ now, before, cur, goodWhenDown }: { now: number; before: number; cur: string; goodWhenDown: boolean }) {
  if (!before && !now) return <span className="muted small">No records</span>;
  if (!before) return <span className="muted small">Nothing last month</span>;
  const diff = now - before;
  const pct = Math.round((diff / before) * 100);
  const good = goodWhenDown ? diff <= 0 : diff >= 0;
  return (
    <span className="small" style={{ color: diff === 0 ? 'var(--muted)' : good ? 'var(--inc)' : 'var(--exp)', fontWeight: 700 }}>
      {diff === 0 ? 'Same as' : `${diff > 0 ? '▲' : '▼'} ${money(Math.abs(diff), cur)} (${Math.abs(pct)}%)`} {diff === 0 ? 'last month' : ''}
    </span>
  );
}

function Finding({ i }: { i: Insight }) {
  const color = i.tone === 'warn' ? TONE.warn : i.tone === 'good' ? TONE.good : TONE.info;
  const body = (
    <>
      <IconTile icon={i.icon} color={color} size={40} />
      <span className="row-main">
        <span className="row-title wrap-title">{i.title}</span>
        <span className="row-sub wrap">{i.text}</span>
      </span>
      {i.link && <Icon name="chevR" />}
    </>
  );
  return i.link ? (
    <a className="row" href={href(i.link)} style={{ alignItems: 'flex-start' }}>
      {body}
    </a>
  ) : (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      {body}
    </div>
  );
}

function analyse(data: AppData, start: Date) {
  const end = addMonths(start, 1);
  const at = measureAt(start);
  const days = Math.round((end.getTime() - start.getTime()) / DAY);
  const dayNo = Math.min(days, Math.max(1, Math.ceil((at.getTime() - start.getTime()) / DAY)));
  const done = dayNo / days; // share of the month gone
  const daysLeft = days - dayNo;
  const complete = at.getTime() >= end.getTime() - 1;

  const spent = spentInCategory(data, null, start, end);
  const pace = spent / dayNo;
  const projected = complete ? spent : Math.round(spent + pace * daysLeft);
  const month = sums(data.txns, start, end);

  // Same point last month, so a half-finished month compares fairly.
  const prevStart = addMonths(start, -1);
  const prevSame = complete ? start : addDays(prevStart, dayNo);
  const prev = sums(data.txns, prevStart, prevSame);

  const overall = data.budgets.find((b) => b.categoryId === null);
  const catBudgets = data.budgets
    .filter((b) => b.categoryId)
    .map((b) => {
      const cat = data.categories.find((c) => c.id === b.categoryId);
      const s = spentInCategory(data, b.categoryId, start, end);
      const proj = complete ? s : (s / dayNo) * days;
      return { b, cat, spent: s, projected: proj, status: paceStatus(s, b.limit, proj, complete) };
    })
    .filter((x) => x.cat)
    .sort((a, b) => b.spent / b.b.limit - a.spent / a.b.limit);
  const limit = overall?.limit ?? catBudgets.reduce((s, x) => s + x.b.limit, 0);
  const budgetSpent = overall ? spent : catBudgets.reduce((s, x) => s + x.spent, 0);
  const budgetProjected = overall ? projected : catBudgets.reduce((s, x) => s + x.projected, 0);

  // Categories vs their 3-month average for the whole month (or to the same day).
  const cats = byCategory(data, start, end, 'expense').slice(0, 6).map((c) => {
    let total = 0;
    for (let m = 1; m <= 3; m++) {
      const ms = addMonths(start, -m);
      total += byCategory(data, ms, complete ? addMonths(ms, 1) : addDays(ms, dayNo), 'expense').find((x) => x.category.id === c.category.id)?.amount ?? 0;
    }
    return { ...c, usual: total / 3 };
  });

  // Last 6 months, ending with this one.
  const trend = Array.from({ length: 6 }, (_, i) => {
    const ms = addMonths(start, i - 5);
    const s = sums(data.txns, ms, addMonths(ms, 1));
    return { label: monthShort(ms), a: s.income, b: s.expense };
  });
  const fullMonths = trend.slice(0, 5).filter((t) => t.a || t.b);
  const avgSpend = fullMonths.length ? fullMonths.reduce((s, t) => s + t.b, 0) / fullMonths.length : 0;

  // Spending by weekday over the 90 days up to the measuring point.
  const since = addDays(at, -90);
  const wd = new Array(7).fill(0);
  const wdCount = new Array(7).fill(0);
  for (let d = new Date(since); d < at; d = addDays(d, 1)) wdCount[d.getDay()]++;
  data.txns.filter((t) => t.type === 'expense' && inRange(t.date, since, at)).forEach((t) => (wd[new Date(t.date).getDay()] += t.amount));
  const weekday = wd.map((v, i) => v / Math.max(1, wdCount[i]));

  const findings = computeInsights(data, at).filter((i) => !i.id.startsWith('risk-') && i.id !== 'forecast');
  const count = data.txns.filter((t) => inRange(t.date, start, end)).length;
  return { at, days, dayNo, done, daysLeft, complete, spent, pace, projected, month, prev, overall, catBudgets, limit, budgetSpent, budgetProjected, cats, trend, avgSpend, weekday, findings, count };
}

export function Analysis() {
  const { data } = useStore();
  const wide = useWide();
  const cur = data.settings.currency;
  const [start, setStart] = useState(() => startOfMonth(new Date()));
  const isCurrent = start.getTime() === startOfMonth(new Date()).getTime();
  const a = useMemo(() => analyse(data, start), [data, start]);

  const hasBudget = a.limit > 0;
  const status = hasBudget ? paceStatus(a.budgetSpent, a.limit, a.budgetProjected, a.complete) : null;
  const left = a.limit - a.budgetSpent;
  const perDay = a.daysLeft > 0 ? Math.floor(Math.max(0, left) / a.daysLeft) : 0;
  const savedNow = a.month.income - a.month.expense;
  const rate = a.month.income > 0 ? Math.round((savedNow / a.month.income) * 100) : null;
  const wkMax = Math.max(...a.weekday);
  const wkNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let headline: string;
  let detail: string;
  if (hasBudget && status) {
    if (status.tone === 'bad') {
      headline = `${money(-left, cur)} over budget`;
      detail = `You've spent ${money(a.budgetSpent, cur)} of ${money(a.limit, cur)}${a.complete ? '.' : ` with ${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} to go.`}`;
    } else if (a.complete) {
      headline = `${money(left, cur)} under budget`;
      detail = `You spent ${money(a.budgetSpent, cur)} of ${money(a.limit, cur)}.`;
    } else if (status.tone === 'warn' && a.budgetProjected > a.limit) {
      headline = `Heading ${money(a.budgetProjected - a.limit, cur)} over budget`;
      detail = `At this pace you'll spend about ${money(a.budgetProjected, cur)} of ${money(a.limit, cur)}. Keeping to ${money(perDay, cur)} a day stays within it.`;
    } else {
      headline = `${money(left, cur)} left to spend`;
      detail = `That's about ${money(perDay, cur)} a day for the ${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} left. Expected month-end spending: ${money(a.budgetProjected, cur)}.`;
    }
  } else {
    headline = a.complete ? `${money(a.spent, cur)} spent` : `${money(a.spent, cur)} spent so far`;
    detail = a.complete ? `${a.count} records this month.` : a.spent > 0 ? `At this pace the month ends around ${money(a.projected, cur)}. Set a budget to see if that's on plan.` : 'No expenses yet this month.';
  }

  return (
    <main className="screen analysis">
      <Header title="Analysis" left={wide ? undefined : <BackLink to="home" />} big={wide} />

      <div className="month-nav">
        <button aria-label="Previous month" onClick={() => setStart(addMonths(start, -1))}>
          <Icon name="chevL" />
        </button>
        <span>{monthLabel(start)}</span>
        <button aria-label="Next month" disabled={isCurrent} onClick={() => setStart(addMonths(start, 1))}>
          <Icon name="chevR" />
        </button>
      </div>

      {/* ---------- budget health ---------- */}
      <section className="card health" aria-labelledby="health-h">
        <div className="health-top">
          <span className="muted small">{hasBudget ? (a.overall ? 'Monthly budget' : 'All category budgets') : 'Spending'}</span>
          {status && (
            <span className="status-pill" style={{ color: TONE[status.tone], borderColor: TONE[status.tone] }}>
              {status.label}
            </span>
          )}
        </div>
        <h2 id="health-h" className="health-head">
          {headline}
        </h2>
        <p className="muted small" style={{ margin: 0 }}>
          {detail}
        </p>
        {hasBudget && status && (
          <>
            <PaceBar spent={a.budgetSpent} limit={a.limit} expected={a.done} tone={status.tone} />
            <div className="pace-legend muted">
              <span>{Math.round((a.budgetSpent / a.limit) * 100)}% used</span>
              {!a.complete && <span>{Math.round(a.done * 100)}% of the month gone</span>}
            </div>
          </>
        )}
        {!hasBudget && (
          <a className="btn secondary small" href={href('budgets')} style={{ alignSelf: 'flex-start' }}>
            <Icon name="target" size={16} />
            Set a budget
          </a>
        )}
      </section>

      <div className="analysis-grid">
        {/* ---------- vs last month ---------- */}
        <section className="card panel" aria-labelledby="cmp-h">
          <h2 id="cmp-h" className="h2">
            {a.complete ? 'Compared with the month before' : `Compared with last month, day ${a.dayNo}`}
          </h2>
          <div className="cmp">
            <div>
              <span className="muted small">Spent</span>
              <strong>{money(a.month.expense, cur)}</strong>
              <Delta now={a.month.expense} before={a.prev.expense} cur={cur} goodWhenDown />
            </div>
            <div>
              <span className="muted small">Income</span>
              <strong>{money(a.month.income, cur)}</strong>
              <Delta now={a.month.income} before={a.prev.income} cur={cur} goodWhenDown={false} />
            </div>
            <div>
              <span className="muted small">Saved</span>
              <strong style={{ color: savedNow < 0 ? 'var(--exp)' : undefined }}>{money(savedNow, cur, true)}</strong>
              <span className="small muted">{rate === null ? 'No income yet' : `${rate}% of income`}</span>
            </div>
          </div>
        </section>

        {/* ---------- budgets ---------- */}
        {a.catBudgets.length > 0 && (
          <section className="card panel" aria-labelledby="bud-h">
            <div className="panel-head">
              <h2 id="bud-h" className="h2">
                Budgets
              </h2>
              <a className="link" href={href('budgets')}>
                Edit
              </a>
            </div>
            <div className="bud-list">
              {a.catBudgets.map(({ b, cat, spent, projected, status: st }) => (
                <div key={b.id} className="bud">
                  <div className="bud-top">
                    <IconTile icon={cat!.icon as IconName} color={cat!.color} size={32} />
                    <span className="row-main">
                      <span className="row-title">{cat!.name}</span>
                      <span className="row-sub">
                        {money(spent, cur)} of {money(b.limit, cur)}
                        {!a.complete && spent <= b.limit && projected > b.limit ? ` · heading for ${money(projected, cur)}` : ''}
                      </span>
                    </span>
                    <span className="small" style={{ color: TONE[st.tone], fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {st.label}
                    </span>
                  </div>
                  <PaceBar spent={spent} limit={b.limit} expected={a.done} tone={st.tone} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---------- categories ---------- */}
        <section className="card panel" aria-labelledby="cat-h">
          <h2 id="cat-h" className="h2">
            Where the money went
          </h2>
          {a.cats.length === 0 ? (
            <p className="muted small">No expenses this month.</p>
          ) : (
            <div className="cat-rows">
              {a.cats.map((c) => {
                const share = a.month.expense ? (c.amount / a.month.expense) * 100 : 0;
                const ch = c.usual > 0 ? Math.round((c.amount / c.usual - 1) * 100) : null;
                return (
                  <div key={c.category.id} className="cat-row">
                    <IconTile icon={c.category.icon as IconName} color={c.category.color} size={32} />
                    <span className="row-main">
                      <span className="cat-line">
                        <span className="row-title">{c.category.name}</span>
                        <strong>{money(c.amount, cur)}</strong>
                      </span>
                      <span className="cat-bar">
                        <span style={{ width: `${share}%`, background: c.category.color }} />
                      </span>
                      <span className="row-sub">
                        {Math.round(share)}% of spending
                        {ch === null ? ' · new this month' : Math.abs(ch) < 10 ? ' · about usual' : ` · ${Math.abs(ch)}% ${ch > 0 ? 'more' : 'less'} than usual`}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------- trend ---------- */}
        <section className="card panel" aria-labelledby="trend-h">
          <h2 id="trend-h" className="h2">
            Last 6 months
          </h2>
          <PairBars data={a.trend} cur={cur} height={150} />
          <div className="legend muted small">
            <span>
              <i style={{ background: 'var(--inc)' }} /> Income
            </span>
            <span>
              <i style={{ background: '#FF922B' }} /> Expense
            </span>
          </div>
          {a.avgSpend > 0 && (
            <p className="muted small" style={{ margin: 0 }}>
              You usually spend about <strong style={{ color: 'var(--ink)' }}>{money(Math.round(a.avgSpend), cur)}</strong> a month.{' '}
              {a.complete
                ? a.spent > a.avgSpend * 1.1
                  ? 'This month was above that.'
                  : a.spent < a.avgSpend * 0.9
                    ? 'This month was below that.'
                    : 'This month was close to it.'
                : a.projected > a.avgSpend * 1.1
                  ? 'This month is heading above that.'
                  : a.projected < a.avgSpend * 0.9
                    ? 'This month is heading below that.'
                    : 'This month is close to it.'}
            </p>
          )}
        </section>

        {/* ---------- weekday ---------- */}
        {wkMax > 0 && (
          <section className="card panel" aria-labelledby="wk-h">
            <h2 id="wk-h" className="h2">
              Spending by day of the week
            </h2>
            <div className="wk" role="img" aria-label={a.weekday.map((v, i) => `${wkNames[i]} ${money(Math.round(v), cur)}`).join(', ')}>
              {a.weekday.map((v, i) => (
                <div key={i} className="wk-col">
                  <span className="wk-bar" style={{ height: `${(v / wkMax) * 100}%`, background: v === wkMax ? 'var(--exp)' : 'var(--accent)', opacity: v === wkMax ? 1 : 0.35 }} />
                  <span className="muted small">{wkNames[i]}</span>
                </div>
              ))}
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              Average spending per day over the last 90 days.
            </p>
          </section>
        )}

        {/* ---------- findings ---------- */}
        {a.findings.length > 0 && (
          <section className="card panel" aria-labelledby="find-h">
            <h2 id="find-h" className="h2">
              Worth knowing
            </h2>
            <div className="list">
              {a.findings.map((i) => (
                <Finding key={i.id} i={i} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
