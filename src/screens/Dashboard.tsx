// Wide-screen (web) home: KPIs and charts.
import { Icon } from '../icons';
import { useStore } from '../store';
import { SyncBanner } from './Cloud';
import { href } from '../router';
import { CatTile, Empty, Progress } from '../ui';
import { CumulativeLine, Donut, HBars, PairBars } from '../charts';
import { RecordRow } from './RecordRow';
import { dueLabel } from './Reminders';
import { upcoming } from '../notify';
import { addMonths, balanceOf, byCategory, money, monthLabel, monthShort, spentInCategory, startOfMonth, sums, totalBalance, byNewest } from '../utils';
import type { AppData } from '../types';

function dailyCumulative(data: AppData, start: Date) {
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const arr = new Array(days).fill(0);
  for (const t of data.txns) {
    if (t.type !== 'expense') continue;
    const d = new Date(t.date);
    if (d.getFullYear() === start.getFullYear() && d.getMonth() === start.getMonth()) arr[d.getDate() - 1] += t.amount;
  }
  for (let i = 1; i < days; i++) arr[i] += arr[i - 1];
  return arr;
}

function Change({ now, before, goodWhenUp }: { now: number; before: number; goodWhenUp: boolean }) {
  if (!before) return <span className="muted small">No data last month</span>;
  const pct = ((now - before) / before) * 100;
  const good = goodWhenUp ? pct >= 0 : pct <= 0;
  return (
    <span className="small" style={{ fontWeight: 700, color: good ? 'var(--inc)' : 'var(--exp)' }}>
      {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% <span className="muted" style={{ fontWeight: 500 }}>vs {monthShort(addMonths(startOfMonth(new Date()), -1))} so far</span>
    </span>
  );
}

export function Dashboard() {
  const { data, cur, hidden, toggleHidden } = useStore();
  const now = new Date();
  const start = startOfMonth(now);
  const end = addMonths(start, 1);
  const prevStart = addMonths(start, -1);
  const dayOfMonth = now.getDate();
  // compare with the same number of days last month, so the change is fair mid-month
  const prevSameEnd = new Date(prevStart.getFullYear(), prevStart.getMonth(), Math.min(dayOfMonth, new Date(prevStart.getFullYear(), prevStart.getMonth() + 1, 0).getDate()) + 1);
  const m = sums(data.txns, start, end);
  const p = sums(data.txns, prevStart, prevSameEnd);
  const saved = m.income - m.expense;
  const rate = m.income ? (saved / m.income) * 100 : 0;
  const accounts = data.accounts.filter((a) => !a.archived);

  const cats = byCategory(data, start, end, 'expense');
  const top = cats.slice(0, 6);
  const otherTotal = cats.slice(6).reduce((s, c) => s + c.amount, 0);
  const slices = [...top.map((c) => ({ label: c.category.name, value: c.amount, color: c.category.color })), ...(otherTotal ? [{ label: 'Other', value: otherTotal, color: '#ADB5BD' }] : [])];

  const trend = Array.from({ length: 6 }, (_, i) => {
    const s = addMonths(start, i - 5);
    const v = sums(data.txns, s, addMonths(s, 1));
    return { label: monthShort(s), a: v.income, b: v.expense };
  });

  const cumNow = dailyCumulative(data, start);
  const cumPrev = dailyCumulative(data, prevStart);
  const days = Math.max(cumNow.length, cumPrev.length);

  const overall = data.budgets.find((b) => b.categoryId === null);
  const catBudgets = data.budgets
    .filter((b) => b.categoryId)
    .map((b) => ({ b, cat: data.categories.find((c) => c.id === b.categoryId), spent: spentInCategory(data, b.categoryId, start, end) }))
    .filter((x) => x.cat)
    .sort((a, b) => b.spent / b.b.limit - a.spent / a.b.limit)
    .slice(0, 4);
  const oSpent = spentInCategory(data, null, start, end);

  const recent = [...data.txns].sort(byNewest).slice(0, 8);
  const soon = upcoming(data, 14).slice(0, 4);
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <main className="screen dash-screen">
      <header className="head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="muted" style={{ fontSize: 14 }}>
            {greeting}, {data.settings.name}
          </span>
          <h1 className="h-big" style={{ fontSize: 28 }}>
            {monthLabel(now)} overview
          </h1>
        </div>
        <div className="head-actions">
          <a className="btn-icon" aria-label="Analysis" title="Analysis" href={href('analysis')}>
            <Icon name="trend" />
          </a>
          <button className="btn secondary small" onClick={toggleHidden} aria-pressed={hidden}>
            <Icon name={hidden ? 'eyeOff' : 'eye'} size={18} />
            {hidden ? 'Show amounts' : 'Hide amounts'}
          </button>
          <a className="btn primary small" href={href('add?from=home')}>
            <Icon name="plus" size={18} stroke={2.2} />
            Add record
          </a>
        </div>
      </header>

      <SyncBanner />
      <div className="kpis">
        <div className="kpi dark-card">
          <span className="dark-muted">Total balance</span>
          <span className="kpi-value">{money(totalBalance(data), cur)}</span>
          <span className="small" style={{ color: '#b4bccb' }}>
            {accounts.length} active account{accounts.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="kpi card">
          <span className="muted small" style={{ fontWeight: 600 }}>
            Income this month
          </span>
          <span className="kpi-value inc">{money(m.income, cur)}</span>
          <Change now={m.income} before={p.income} goodWhenUp />
        </div>
        <div className="kpi card">
          <span className="muted small" style={{ fontWeight: 600 }}>
            Spending this month
          </span>
          <span className="kpi-value exp">{money(m.expense, cur)}</span>
          <Change now={m.expense} before={p.expense} goodWhenUp={false} />
        </div>
        <div className="kpi card">
          <span className="muted small" style={{ fontWeight: 600 }}>
            Saved this month
          </span>
          <span className="kpi-value" style={{ color: saved >= 0 ? 'var(--ink)' : 'var(--exp)' }}>
            {money(saved, cur, true)}
          </span>
          <span className="small" style={{ fontWeight: 700, color: rate >= 20 ? 'var(--inc)' : rate >= 0 ? 'var(--muted)' : 'var(--exp)' }}>
            {m.income ? `${rate.toFixed(0)}% of income saved` : 'No income yet this month'}
          </span>
        </div>
      </div>

      <div className="dash">
        <section className="card w2 panel spend-panel">
          <div className="panel-head">
            <div>
              <h2 className="h2">Spending so far</h2>
              <span className="muted small">
                {money(cumNow[dayOfMonth - 1] ?? 0, cur)} by day {dayOfMonth} · last month {money(cumPrev[Math.min(dayOfMonth, cumPrev.length) - 1] ?? 0, cur)} by the same day
              </span>
            </div>
            <div className="legend">
              <span>
                <i style={{ background: 'var(--accent)' }} />
                {monthShort(start)}
              </span>
              <span>
                <i style={{ background: 'var(--muted)' }} />
                {monthShort(prevStart)}
              </span>
            </div>
          </div>
          <CumulativeLine current={cumNow} previous={cumPrev} days={days} today={dayOfMonth} cur={cur} />
        </section>

        <section className="card panel">
          <div className="panel-head">
            <h2 className="h2">Where it went</h2>
            <a className="link" href={href('reports')}>
              Reports
            </a>
          </div>
          {slices.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <Donut slices={slices} total={m.expense} label="Spent" cur={cur} size={170} />
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {slices.map((s) => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                    <span className="muted">{m.expense ? Math.round((s.value / m.expense) * 100) : 0}%</span>
                    <strong style={{ minWidth: 86, textAlign: 'right' }}>{money(s.value, cur)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty icon="pie" title="No spending yet" text="Your categories will show here." />
          )}
        </section>

        <section className="card w2 panel">
          <div className="panel-head">
            <h2 className="h2">Income vs expense · last 6 months</h2>
            <div className="legend">
              <span>
                <i style={{ background: 'var(--inc)' }} />
                Income
              </span>
              <span>
                <i style={{ background: '#FF922B' }} />
                Expense
              </span>
            </div>
          </div>
          <PairBars data={trend} cur={cur} />
        </section>

        <section className="card panel">
          <div className="panel-head">
            <h2 className="h2">Budgets</h2>
            <a className="link" href={href('budgets')}>
              Manage
            </a>
          </div>
          {!overall && !catBudgets.length ? (
            <Empty icon="target" title="No budgets yet" text="Set a monthly limit to track it here." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {overall && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <strong>Whole month</strong>
                    <span className="muted">
                      {money(oSpent, cur)} / {money(overall.limit, cur)}
                    </span>
                  </div>
                  <Progress pct={(oSpent / overall.limit) * 100} color={oSpent > overall.limit ? '#E8590C' : 'var(--accent)'} />
                </div>
              )}
              {catBudgets.map(({ b, cat, spent }) => (
                <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{cat!.name}</span>
                    <span className={spent > b.limit ? 'exp' : 'muted'} style={{ whiteSpace: 'nowrap' }}>
                      {money(spent, cur)} / {money(b.limit, cur)}
                    </span>
                  </div>
                  <Progress pct={(spent / b.limit) * 100} color={spent > b.limit ? '#E8590C' : cat!.color} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card w2 panel">
          <div className="panel-head">
            <h2 className="h2">Recent records</h2>
            <a className="link" href={href('records')}>
              See all
            </a>
          </div>
          {recent.length ? (
            <div className="list" style={{ display: 'flex', flexDirection: 'column' }}>
              {recent.map((t) => (
                <RecordRow key={t.id} t={t} from="home" />
              ))}
            </div>
          ) : (
            <Empty icon="list" title="No records yet" text="Use Add record to log your first expense or income." />
          )}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="card panel">
            <div className="panel-head">
              <h2 className="h2">Accounts</h2>
              <a className="link" href={href('accounts')}>
                Manage
              </a>
            </div>
            <HBars rows={accounts.map((a) => ({ label: a.name, value: balanceOf(data, a.id), color: a.color ?? 'var(--accent)' }))} cur={cur} />
          </section>
          <section className="card panel">
            <div className="panel-head">
              <h2 className="h2">Upcoming payments</h2>
              <a className="link" href={href('reminders')}>
                All
              </a>
            </div>
            {soon.length ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {soon.map((r) => {
                  const due = dueLabel(r.due);
                  return (
                    <div key={r.id} className="acc-row">
                      <a className="row" href={href('reminders')}>
                        <CatTile cat={data.categories.find((c) => c.id === r.categoryId)} size={34} />
                        <span className="row-main">
                          <span className="row-title">{r.title}</span>
                          <span className="row-sub" style={{ fontWeight: 700, color: due.late ? 'var(--exp)' : 'var(--accent)' }}>
                            {due.text}
                            {r.amount ? ` · ${money(r.amount, cur)}` : ''}
                          </span>
                        </span>
                      </a>
                      <a className="btn small primary" style={{ height: 34, padding: '0 12px' }} href={href(`add?reminder=${r.id}&from=home`)}>
                        Pay
                      </a>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                Nothing due in the next 2 weeks.
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
