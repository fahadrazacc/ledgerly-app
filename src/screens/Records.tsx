import { useMemo, useState } from 'react';
import { Icon } from '../icons';
import { useStore } from '../store';
import { go, href } from '../router';
import { AccountTile, BackLink, Empty, Header, Segmented, Sheet } from '../ui';
import { AccountSheet } from './Accounts';
import { RecordRow } from './RecordRow';
import { addDays, addMonths, dayKey, dayLabel, inRange, money, monthLabel, startOfDay, startOfMonth, startOfWeek, toDateInput, byNewest, balanceOf } from '../utils';
import type { Txn } from '../types';

type Filter = 'all' | 'expense' | 'income' | 'transfer';
export type Period = 'all' | 'day' | 'week' | 'month' | 'year' | 'custom';

const fmt = (d: Date, year = false) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });

export function periodRange(period: Period, anchor: Date, custom: { from: Date; to: Date }) {
  switch (period) {
    case 'all':
      return { start: new Date(0), end: new Date(8.64e15) };
    case 'day': {
      const s = startOfDay(anchor);
      return { start: s, end: addDays(s, 1) };
    }
    case 'week': {
      const s = startOfWeek(anchor);
      return { start: s, end: addDays(s, 7) };
    }
    case 'month': {
      const s = startOfMonth(anchor);
      return { start: s, end: addMonths(s, 1) };
    }
    case 'year':
      return { start: new Date(anchor.getFullYear(), 0, 1), end: new Date(anchor.getFullYear() + 1, 0, 1) };
    default:
      return { start: startOfDay(custom.from), end: addDays(startOfDay(custom.to), 1) };
  }
}

export function shiftAnchor(period: Period, anchor: Date, n: number) {
  if (period === 'day') return addDays(anchor, n);
  if (period === 'week') return addDays(anchor, 7 * n);
  if (period === 'month') return addMonths(anchor, n);
  return new Date(anchor.getFullYear() + n, 0, 1);
}

export function periodLabel(period: Period, start: Date, end: Date) {
  const last = addDays(end, -1);
  const today = startOfDay(new Date());
  if (period === 'day') {
    const diff = Math.round((today.getTime() - start.getTime()) / 86_400_000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (period === 'month') return monthLabel(start);
  if (period === 'year') return String(start.getFullYear());
  const sameYear = start.getFullYear() === last.getFullYear();
  return `${fmt(start, !sameYear)} – ${fmt(last, true)}`;
}

/** Records list. With `accountView`, it becomes that account's page: its balance, money in and out, and an Edit button. */
export function Records({ account: initialAccount, accountView, back = 'home' }: { account: string | null; accountView?: string; back?: string }) {
  const { data, cur, update } = useStore();
  const [period, setPeriod] = useState<Period>(accountView ? 'all' : 'month');
  const [editing, setEditing] = useState(false);
  const [anchor, setAnchor] = useState(() => new Date());
  const [custom, setCustom] = useState(() => ({ from: addDays(new Date(), -29), to: new Date() }));
  const [customOpen, setCustomOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [accountId, setAccountId] = useState<string>(accountView ?? initialAccount ?? 'all');
  const account = accountView ? data.accounts.find((a) => a.id === accountView) : undefined;
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const { start, end } = periodRange(period, anchor, custom);
  const isCurrent = end.getTime() > Date.now();

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.txns
      .filter((t) => inRange(t.date, start, end))
      .filter((t) => filter === 'all' || t.type === filter)
      .filter((t) => accountId === 'all' || t.accountId === accountId || t.toAccountId === accountId)
      .filter((t) => {
        if (!q) return true;
        const cat = data.categories.find((c) => c.id === t.categoryId)?.name ?? '';
        const acc = data.accounts.find((a) => a.id === t.accountId)?.name ?? '';
        return [t.note ?? '', cat, acc, String(t.amount)].some((s) => s.toLowerCase().includes(q));
      })
      .sort(byNewest);
  }, [data, start, end, filter, query, accountId]);

  // Income/expense for the list; transfers count only when looking at one account.
  let income = 0;
  let expense = 0;
  for (const t of list) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
    else if (accountId !== 'all') {
      if (t.toAccountId === accountId) income += t.amount;
      if (t.accountId === accountId) expense += t.amount;
    }
  }

  /** What a record does to the list's total: transfers count only when viewing one account. */
  const effect = (t: Txn) =>
    t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : accountId === 'all' ? 0 : (t.toAccountId === accountId ? t.amount : 0) - (t.accountId === accountId ? t.amount : 0);

  const groups = useMemo(() => {
    const m = new Map<string, Txn[]>();
    for (const t of list) {
      const k = dayKey(t.date);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return [...m.entries()];
  }, [list]);

  const accountsForFilter = data.accounts.filter((a) => !a.archived || a.id === accountId || data.txns.some((t) => t.accountId === a.id));

  if (accountView && !account)
    return (
      <main className="screen">
        <Header title="Account" left={<BackLink to={back} />} />
        <div className="card">
          <Empty icon="bank" title="This account no longer exists" text="It may have been deleted on another device." />
        </div>
      </main>
    );

  return (
    <main className="screen">
      <header className="head">
        {account ? (
          <>
            <BackLink to={back} />
            <h1 className="h-small" style={{ flex: 1, textAlign: 'center', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {account.name}
            </h1>
          </>
        ) : (
          <h1 className="h-big">Records</h1>
        )}
        <div className="head-actions">
          <button
            className="btn-icon"
            aria-label="Search records"
            aria-pressed={searching}
            onClick={() => {
              setSearching((s) => !s);
              setQuery('');
            }}
          >
            <Icon name={searching ? 'close' : 'search'} />
          </button>
          {account && (
            <button className="btn-icon" aria-label="Edit account" title="Edit account" onClick={() => setEditing(true)}>
              <Icon name="edit" />
            </button>
          )}
        </div>
      </header>

      {account && (
        <section className="dark-card" aria-label={`${account.name} balance`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AccountTile account={account} size={36} />
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span className="dark-muted">Balance{account.archived ? ' · inactive' : ''}</span>
            </span>
          </div>
          <div className="big-num">{money(balanceOf(data, account.id), cur)}</div>
          <div className="grid2">
            <div className="mini-pill">
              <span className="tile" style={{ width: 34, height: 34, borderRadius: 11, background: '#12352d', color: '#63e6be' }}>
                <Icon name="arrowDL" size={18} stroke={2} />
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 11, color: '#b4bccb' }}>Incoming</span>
                <span className="acc-in" style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: '#63e6be' }}>{money(income, cur)}</span>
              </div>
            </div>
            <div className="mini-pill">
              <span className="tile" style={{ width: 34, height: 34, borderRadius: 11, background: '#3b2516', color: '#ffa94d' }}>
                <Icon name="arrowUR" size={18} stroke={2} />
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 11, color: '#b4bccb' }}>Outgoing</span>
                <span className="acc-out" style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: '#ffa94d' }}>{money(expense, cur)}</span>
              </div>
            </div>
          </div>
          <span className="dark-muted" style={{ fontSize: 12 }}>
            {period === 'all' ? 'Totals for all time, including transfers' : `Totals for ${periodLabel(period, start, end)}, including transfers`}
          </span>
        </section>
      )}

      {searching && (
        <label className="search">
          <Icon name="search" size={18} />
          <input autoFocus placeholder="Search notes, categories, amounts" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
        </label>
      )}

      <Segmented<Period>
        label="View by"
        value={period}
        onChange={(p) => {
          setPeriod(p);
          setAnchor(new Date());
          if (p === 'custom') setCustomOpen(true);
        }}
        options={[
          ...(account ? [{ value: 'all' as Period, label: 'All' }] : [{ value: 'day' as Period, label: 'Day' }]),
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
          { value: 'custom', label: 'Custom' },
        ]}
      />

      {period === 'all' ? null : period === 'custom' ? (
        <button className="month-nav" style={{ border: 0, justifyContent: 'center', gap: 10, height: 52 }} onClick={() => setCustomOpen(true)}>
          <Icon name="calendar" size={18} />
          <span>{periodLabel(period, start, end)}</span>
          <Icon name="chevD" size={18} />
        </button>
      ) : (
        <div className="month-nav">
          <button aria-label="Previous" onClick={() => setAnchor(shiftAnchor(period, anchor, -1))}>
            <Icon name="chevL" />
          </button>
          <span>{periodLabel(period, start, end)}</span>
          <button aria-label="Next" disabled={isCurrent} onClick={() => setAnchor(shiftAnchor(period, anchor, 1))}>
            <Icon name="chevR" />
          </button>
        </div>
      )}

      <div className="grid2" style={{ gridTemplateColumns: account ? 'minmax(0, 1fr)' : 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 8 }}>
        <select className="input" aria-label="Type" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} style={{ height: 46 }}>
          <option value="all">All types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="transfer">Transfers</option>
        </select>
        {!account && (
        <select className="input" aria-label="Account" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ height: 46 }}>
          <option value="all">All accounts</option>
          {accountsForFilter.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.archived ? ' (inactive)' : ''}
            </option>
          ))}
        </select>
        )}
      </div>

      {!account && (
      <div className="grid3">
        <div className="stat">
          <span className="label">{accountId === 'all' ? 'Income' : 'Money in'}</span>
          <span className="value inc">{money(income, cur)}</span>
        </div>
        <div className="stat">
          <span className="label">{accountId === 'all' ? 'Expense' : 'Money out'}</span>
          <span className="value exp">{money(expense, cur)}</span>
        </div>
        <div className="stat">
          <span className="label">Net</span>
          <span className="value">{money(income - expense, cur, true)}</span>
        </div>
      </div>
      )}

      {list.length > 0 && (
        <p className="list-count" aria-live="polite">
          <strong>{list.length.toLocaleString()}</strong> {list.length === 1 ? 'transaction' : 'transactions'}
          {filter === 'all' && (
            <span className="muted">
              {[
                ['expense', 'expense', 'expenses'],
                ['income', 'income', 'income'],
                ['transfer', 'transfer', 'transfers'],
              ]
                .map(([k, one, many]) => [list.filter((t) => t.type === k).length, one, many] as const)
                .filter(([n]) => n > 0)
                .map(([n, one, many]) => ` · ${n} ${n === 1 ? one : many}`)
                .join('')}
            </span>
          )}
        </p>
      )}

      {groups.length === 0 && (
        <div className="card">
          <Empty
            icon="list"
            title={query ? 'Nothing matches' : 'No records in this period'}
            text={query ? 'Try a different word or amount.' : 'Records you add will show up here, grouped by day.'}
            action={
              !query && (
                <a className="btn primary small" href={href(account ? `add?account=${account.id}&from=${encodeURIComponent(`account?id=${account.id}&back=${back}`)}` : 'add?from=records')}>
                  Add record
                </a>
              )
            }
          />
        </div>
      )}

      {groups.map(([day, txns]) => {
        const net = txns.reduce((s, t) => s + effect(t), 0);
        return (
          <section key={day} className="section" style={{ gap: 8 }}>
            <div className="day-head">
              <span>{dayLabel(day)}</span>
              <span>{net !== 0 ? money(net, cur, true) : ''}</span>
            </div>
            <div className="card list">
              {txns.map((t) => (
                <RecordRow key={t.id} t={t} from={account ? `account?id=${account.id}&back=${back}` : 'records'} />
              ))}
            </div>
          </section>
        );
      })}

      {editing && account && (
        <AccountSheet
          account={account}
          onClose={() => setEditing(false)}
          onSave={(a) => {
            update((d) => ({ ...d, accounts: d.accounts.map((x) => (x.id === a.id ? a : x)) }));
            setEditing(false);
          }}
          onDelete={(id) => {
            update((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== id) }));
            setEditing(false);
            go(back);
          }}
        />
      )}

      {customOpen && (
        <CustomRange
          value={custom}
          onClose={() => setCustomOpen(false)}
          onApply={(v) => {
            setCustom(v);
            setPeriod('custom');
            setCustomOpen(false);
          }}
        />
      )}
    </main>
  );
}

export function CustomRange({ value, onClose, onApply }: { value: { from: Date; to: Date }; onClose: () => void; onApply: (v: { from: Date; to: Date }) => void }) {
  const [from, setFrom] = useState(toDateInput(value.from));
  const [to, setTo] = useState(toDateInput(value.to));
  const [error, setError] = useState('');
  const quick = (days: number) => {
    setTo(toDateInput(new Date()));
    setFrom(toDateInput(addDays(new Date(), -(days - 1))));
  };
  return (
    <Sheet title="Custom dates" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new Date(from + 'T00:00');
          const t = new Date(to + 'T00:00');
          if (isNaN(f.getTime()) || isNaN(t.getTime())) return setError('Pick both dates');
          if (f > t) return setError('"From" must be before "To"');
          onApply({ from: f, to: t });
        }}
      >
        <div className="grid3">
          <button type="button" className="btn secondary small" onClick={() => quick(7)}>
            Last 7 days
          </button>
          <button type="button" className="btn secondary small" onClick={() => quick(30)}>
            Last 30 days
          </button>
          <button type="button" className="btn secondary small" onClick={() => quick(90)}>
            Last 90 days
          </button>
        </div>
        <div className="grid2">
          <label className="field">
            <span>From</span>
            <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn primary block">Show records</button>
      </form>
    </Sheet>
  );
}
