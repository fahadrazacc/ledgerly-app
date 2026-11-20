import { useMemo, useState } from 'react';
import { Icon } from '../icons';
import { useStore } from '../store';
import { href } from '../router';
import { Empty, Segmented } from '../ui';
import { RecordRow } from './RecordRow';
import { addMonths, dayKey, dayLabel, inRange, money, monthLabel, startOfMonth } from '../utils';
import type { Txn } from '../types';

type Filter = 'all' | 'expense' | 'income' | 'transfer';

export function Records() {
  const { data, cur } = useStore();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const end = addMonths(month, 1);
  const isCurrent = month.getTime() === startOfMonth(new Date()).getTime();

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.txns
      .filter((t) => inRange(t.date, month, end))
      .filter((t) => filter === 'all' || t.type === filter)
      .filter((t) => {
        if (!q) return true;
        const cat = data.categories.find((c) => c.id === t.categoryId)?.name ?? '';
        const acc = data.accounts.find((a) => a.id === t.accountId)?.name ?? '';
        return [t.note ?? '', cat, acc, String(t.amount)].some((s) => s.toLowerCase().includes(q));
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, month, end, filter, query]);

  const income = list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const groups = useMemo(() => {
    const m = new Map<string, Txn[]>();
    for (const t of list) {
      const k = dayKey(t.date);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return [...m.entries()];
  }, [list]);

  return (
    <main className="screen">
      <header className="head">
        <h1 className="h-big">Records</h1>
        <div className="head-actions">
          <button className="btn-icon" aria-label="Search records" aria-pressed={searching} onClick={() => { setSearching((s) => !s); setQuery(''); }}>
            <Icon name={searching ? 'close' : 'search'} />
          </button>
        </div>
      </header>

      {searching && (
        <label className="search">
          <Icon name="search" size={18} />
          <input autoFocus placeholder="Search notes, categories, amounts" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
        </label>
      )}

      <div className="month-nav">
        <button aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
          <Icon name="chevL" />
        </button>
        <span>{monthLabel(month)}</span>
        <button aria-label="Next month" disabled={isCurrent} onClick={() => setMonth(addMonths(month, 1))}>
          <Icon name="chevR" />
        </button>
      </div>

      <Segmented<Filter>
        label="Record type"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
          { value: 'transfer', label: 'Transfer' },
        ]}
      />

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
          <span className="label">Net</span>
          <span className="value">{money(income - expense, cur, true)}</span>
        </div>
      </div>

      {groups.length === 0 && (
        <div className="card">
          <Empty
            icon="list"
            title={query ? 'Nothing matches' : 'No records this month'}
            text={query ? 'Try a different word or amount.' : 'Records you add will show up here, grouped by day.'}
            action={
              !query && (
                <a className="btn primary small" href={href('add?from=records')}>
                  Add record
                </a>
              )
            }
          />
        </div>
      )}

      {groups.map(([day, txns]) => {
        const net = txns.reduce((s, t) => s + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0);
        return (
          <section key={day} className="section" style={{ gap: 8 }}>
            <div className="day-head">
              <span>{dayLabel(day)}</span>
              <span>{net !== 0 ? money(net, cur, true) : ''}</span>
            </div>
            <div className="card list">
              {txns.map((t) => (
                <RecordRow key={t.id} t={t} from="records" />
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
