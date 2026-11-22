import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Segmented } from '../ui';
import { addDays, addMonths, money, short, startOfDay, startOfMonth, startOfWeek, sums } from '../utils';

type Unit = 'day' | 'week' | 'month' | 'year';
const LABEL: Record<Unit, string> = { day: 'a day', week: 'a week', month: 'a month', year: 'a year' };

function units(unit: Unit, now: Date, first: Date) {
  const out: { start: Date; end: Date; label: string; partial: boolean }[] = [];
  if (unit === 'day') {
    for (let i = 29; i >= 0; i--) {
      const s = addDays(startOfDay(now), -i);
      out.push({ start: s, end: addDays(s, 1), label: String(s.getDate()), partial: i === 0 });
    }
  } else if (unit === 'week') {
    const cur = startOfWeek(now);
    for (let i = 12; i >= 0; i--) {
      const s = addDays(cur, -7 * i);
      out.push({ start: s, end: addDays(s, 7), label: s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), partial: i === 0 });
    }
  } else if (unit === 'month') {
    const cur = startOfMonth(now);
    for (let i = 12; i >= 0; i--) {
      const s = addMonths(cur, -i);
      out.push({ start: s, end: addMonths(s, 1), label: s.toLocaleDateString('en-GB', { month: 'short' }), partial: i === 0 });
    }
  } else {
    for (let y = Math.max(first.getFullYear(), now.getFullYear() - 5); y <= now.getFullYear(); y++)
      out.push({ start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1), label: String(y), partial: y === now.getFullYear() });
  }
  // ignore periods before the first record
  return out.filter((u) => u.end > first);
}

export function AverageCard() {
  const { data, cur } = useStore();
  const [unit, setUnit] = useState<Unit>('month');
  const now = new Date();
  const first = useMemo(() => {
    const t = data.txns.reduce((m, t) => (t.date < m ? t.date : m), new Date().toISOString());
    return startOfDay(new Date(t));
  }, [data.txns]);

  const list = units(unit, now, first).map((u) => ({ ...u, ...sums(data.txns, u.start, u.end) }));
  // average over complete periods (days include today); fall back to the current one if there are none yet
  const complete = unit === 'day' ? list : list.filter((u) => !u.partial);
  const basis = complete.length ? complete : list;
  const avg = basis.length ? basis.reduce((s, u) => s + u.expense, 0) / basis.length : 0;
  const avgIn = basis.length ? basis.reduce((s, u) => s + u.income, 0) / basis.length : 0;
  const max = Math.max(1, ...list.map((u) => u.expense));
  const hi = basis.reduce((m, u) => (u.expense > m.expense ? u : m), basis[0] ?? { expense: 0, label: '' });
  const lo = basis.reduce((m, u) => (u.expense < m.expense ? u : m), basis[0] ?? { expense: 0, label: '' });
  const basisText =
    unit === 'day' ? `the last ${basis.length} days` : complete.length ? `${basis.length} complete ${unit}${basis.length === 1 ? '' : 's'}` : `this ${unit} so far (no complete ${unit} yet)`;

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 className="h2">Average spending</h2>
      <Segmented<Unit>
        label="Average per"
        value={unit}
        onChange={setUnit}
        options={[
          { value: 'day', label: 'Daily' },
          { value: 'week', label: 'Weekly' },
          { value: 'month', label: 'Monthly' },
          { value: 'year', label: 'Yearly' },
        ]}
      />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 28, fontWeight: 800 }} className="exp">
          {money(Math.round(avg), cur)}
        </span>
        <span className="muted">{LABEL[unit]}</span>
      </div>
      <span className="muted small" style={{ marginTop: -8 }}>
        Based on {basisText}. Average income {money(Math.round(avgIn), cur)} {LABEL[unit]}.
      </span>
      <div
        role="img"
        aria-label={list.map((u) => `${u.label}: ${money(u.expense, cur)}`).join('; ')}
        style={{ display: 'grid', gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))`, gap: list.length > 15 ? 2 : 5, alignItems: 'end', height: 110, position: 'relative', borderBottom: '1px solid var(--line)' }}
      >
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(avg / max) * 100}%`, borderTop: '2px dashed var(--muted)', opacity: 0.6 }} title="Average" />
        {list.map((u, i) => (
          <span key={i} title={`${u.label}: ${money(u.expense, cur)}`} style={{ height: `${(u.expense / max) * 100}%`, minHeight: u.expense ? 2 : 0, background: u.partial && unit !== 'day' ? 'var(--line)' : u.expense > avg ? '#FF922B' : 'var(--accent)', borderRadius: '3px 3px 0 0', opacity: u.partial && unit !== 'day' ? 1 : 0.9 }} />
        ))}
      </div>
      <div className="muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, marginTop: -8 }}>
        <span>{list[0]?.label}</span>
        <span>dashed line = average · orange = above average</span>
        <span>{list[list.length - 1]?.label}</span>
      </div>
      {basis.length > 1 && (
        <div className="grid2">
          <div className="stat">
            <span className="label">Highest</span>
            <span className="value">{money(hi.expense, cur)}</span>
            <span className="muted small">{hi.label}</span>
          </div>
          <div className="stat">
            <span className="label">Lowest</span>
            <span className="value">{money(lo.expense, cur)}</span>
            <span className="muted small">{lo.label}</span>
          </div>
        </div>
      )}
      <span className="muted" style={{ fontSize: 11 }}>
        Scale up to {short(max)}. Transfers between your accounts are not counted.
      </span>
    </section>
  );
}
