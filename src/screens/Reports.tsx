import { useState } from 'react';
import { Icon } from '../icons';
import { useStore } from '../store';
import { CatTile, Empty, Progress, Segmented } from '../ui';
import { addDays, addMonths, byCategory, money, monthLabel, monthShort, short, startOfMonth, startOfWeek, sums } from '../utils';

type Period = 'week' | 'month' | 'year';

function rangeFor(period: Period, anchor: Date) {
  if (period === 'week') {
    const s = startOfWeek(anchor);
    return { start: s, end: addDays(s, 7) };
  }
  if (period === 'month') {
    const s = startOfMonth(anchor);
    return { start: s, end: addMonths(s, 1) };
  }
  const s = new Date(anchor.getFullYear(), 0, 1);
  return { start: s, end: new Date(anchor.getFullYear() + 1, 0, 1) };
}

function shift(period: Period, anchor: Date, n: number) {
  if (period === 'week') return addDays(anchor, 7 * n);
  if (period === 'month') return addMonths(anchor, n);
  return new Date(anchor.getFullYear() + n, 0, 1);
}

function label(period: Period, start: Date, end: Date) {
  if (period === 'month') return monthLabel(start);
  if (period === 'year') return String(start.getFullYear());
  const e = addDays(end, -1);
  const f = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${f(start)} – ${f(e)}`;
}

export function Reports() {
  const { data, cur } = useStore();
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [kind, setKind] = useState<'expense' | 'income'>('expense');

  const { start, end } = rangeFor(period, anchor);
  const isCurrent = end.getTime() > Date.now();
  const cats = byCategory(data, start, end, kind);
  const total = cats.reduce((s, c) => s + c.amount, 0);
  const { income, expense } = sums(data.txns, start, end);

  const prev = rangeFor(period, shift(period, anchor, -1));
  const prevTotal = sums(data.txns, prev.start, prev.end)[kind];
  const change = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;

  const elapsedDays = Math.max(1, Math.ceil((Math.min(Date.now(), end.getTime()) - start.getTime()) / 86_400_000));

  // donut segments
  let acc = 0;
  const segs = cats.map((c) => {
    const pct = total ? (c.amount / total) * 100 : 0;
    const seg = { color: c.category.color, len: Math.max(0, pct - (cats.length > 1 ? 0.8 : 0)), offset: -acc };
    acc += pct;
    return seg;
  });

  // trend: 6 months ending at the selected period (12 for year view)
  const months = period === 'year' ? 12 : 6;
  const lastMonth = period === 'year' ? new Date(start.getFullYear(), 11, 1) : startOfMonth(addDays(end, -1));
  const trend = Array.from({ length: months }, (_, i) => {
    const m = addMonths(lastMonth, i - months + 1);
    return { m, ...sums(data.txns, m, addMonths(m, 1)) };
  });
  const max = Math.max(1, ...trend.map((t) => Math.max(t.income, t.expense)));

  return (
    <main className="screen">
      <header className="head">
        <h1 className="h-big">Reports</h1>
      </header>

      <Segmented<Period>
        label="Period"
        value={period}
        onChange={(p) => {
          setPeriod(p);
          setAnchor(new Date());
        }}
        options={[
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
        ]}
      />

      <div className="month-nav">
        <button aria-label="Previous period" onClick={() => setAnchor(shift(period, anchor, -1))}>
          <Icon name="chevL" />
        </button>
        <span>{label(period, start, end)}</span>
        <button aria-label="Next period" disabled={isCurrent} onClick={() => setAnchor(shift(period, anchor, 1))}>
          <Icon name="chevR" />
        </button>
      </div>

      <div className="grid3">
        <div className="stat">
          <span className="label">Income</span>
          <span className="value inc">{money(income, cur)}</span>
        </div>
        <div className="stat">
          <span className="label">Expense</span>
          <span className="value exp">{money(expense, cur)}</span>
        </div>
        <div className="stat">
          <span className="label">Avg / day</span>
          <span className="value">{money(Math.round(expense / elapsedDays), cur)}</span>
        </div>
      </div>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="section-head" style={{ gap: 8 }}>
          <h2 className="h2">By category</h2>
          {change !== null && (
            <span
              className="badge"
              style={{
                background: (kind === 'expense' ? change > 0 : change < 0) ? '#FFF0E6' : '#E7F5EF',
                color: (kind === 'expense' ? change > 0 : change < 0) ? 'var(--exp)' : 'var(--inc)',
              }}
            >
              {change > 0 ? '+' : ''}
              {change.toFixed(1)}% vs previous
            </span>
          )}
        </div>
        <Segmented<'expense' | 'income'>
          label="Category type"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'expense', label: 'Spending' },
            { value: 'income', label: 'Income' },
          ]}
        />
        {cats.length === 0 ? (
          <Empty icon="pie" title="Nothing to show" text={`No ${kind === 'expense' ? 'spending' : 'income'} in this period.`} />
        ) : (
          <>
            <div style={{ position: 'relative', width: 180, height: 180, alignSelf: 'center' }}>
              <svg role="img" aria-label={`${kind === 'expense' ? 'Spending' : 'Income'} by category, total ${money(total, cur)}`} width="180" height="180" viewBox="0 0 160 160" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="80" cy="80" r="62" fill="none" stroke="#ECEEF3" strokeWidth="18" />
                {segs.map((s, i) => (
                  <circle key={i} cx="80" cy="80" r="62" fill="none" stroke={s.color} strokeWidth="18" pathLength={100} strokeDasharray={`${s.len} ${100 - s.len}`} strokeDashoffset={s.offset} />
                ))}
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <span className="muted small" style={{ fontWeight: 600 }}>
                  {kind === 'expense' ? 'Spent' : 'Earned'}
                </span>
                <span style={{ fontSize: 18, fontWeight: 800 }}>{money(total, cur)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {cats.map((c) => (
                <div key={c.category.id} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <CatTile cat={c.category} size={36} />
                    <span className="row-main">
                      <span className="row-title">{c.category.name}</span>
                      <span className="row-sub">{((c.amount / total) * 100).toFixed(1)}%</span>
                    </span>
                    <span className="amt">{money(c.amount, cur)}</span>
                  </div>
                  <Progress pct={(c.amount / cats[0].amount) * 100} color={c.category.color} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="section-head">
          <h2 className="h2">Income vs expense</h2>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, fontWeight: 600 }} className="muted">
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#087F5B' }} />
              Income
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#FF922B' }} />
              Expense
            </span>
          </div>
        </div>
        <div
          role="img"
          aria-label={trend.map((t) => `${monthShort(t.m)}: income ${short(t.income)}, expense ${short(t.expense)}`).join('; ')}
          style={{ display: 'grid', gridTemplateColumns: `repeat(${months}, minmax(0, 1fr))`, gap: 4, alignItems: 'end', height: 160, borderBottom: '1px solid var(--line)' }}
        >
          {trend.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3, height: '100%' }} title={`${monthShort(t.m)} — income ${money(t.income, cur)}, expense ${money(t.expense, cur)}`}>
              <span style={{ width: months > 6 ? 8 : 12, height: `${(t.income / max) * 100}%`, background: '#087F5B', borderRadius: '4px 4px 0 0' }} />
              <span style={{ width: months > 6 ? 8 : 12, height: `${(t.expense / max) * 100}%`, background: '#FF922B', borderRadius: '4px 4px 0 0' }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${months}, minmax(0, 1fr))`, gap: 4, fontSize: 11, fontWeight: 600, textAlign: 'center', marginTop: -6 }} className="muted">
          {trend.map((t, i) => (
            <span key={i} style={i === months - 1 ? { color: 'var(--ink)' } : undefined}>
              {monthShort(t.m)}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
