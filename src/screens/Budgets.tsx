import { ask } from '../confirm';
import { href } from '../router';
import { useState } from 'react';
import { Icon } from '../icons';
import { useStore } from '../store';
import { CatTile, Empty, Progress, Sheet } from '../ui';
import type { Budget } from '../types';
import { addMonths, budgetsFor, money, monthKey, monthLabel, spentInCategory, startOfMonth, uid } from '../utils';

export function Budgets() {
  const { data, cur, update } = useStore();
  const [editing, setEditing] = useState<Budget | 'new' | null>(null);

  const now = new Date();
  const start = startOfMonth(now);
  const end = addMonths(start, 1);
  const daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));

  const overall = budgetsFor(data, start).find((b) => b.categoryId === null);
  const catBudgets = budgetsFor(data, start)
    .filter((b) => b.categoryId !== null)
    .map((b) => ({ b, cat: data.categories.find((c) => c.id === b.categoryId), spent: spentInCategory(data, b.categoryId, start, end) }))
    .filter((x) => x.cat)
    .sort((a, b) => b.spent / b.b.limit - a.spent / a.b.limit);

  const oSpent = spentInCategory(data, null, start, end);
  const oPct = overall ? (oSpent / overall.limit) * 100 : 0;
  const oLeft = overall ? overall.limit - oSpent : 0;

  return (
    <main className="screen">
      <header className="head">
        <h1 className="h-big">Budgets</h1>
        <button className="btn primary small" onClick={() => setEditing('new')}>
          <Icon name="plus" size={18} stroke={2.2} />
          New budget
        </button>
      </header>

      {overall ? (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ position: 'relative', width: 104, height: 104, flexShrink: 0 }}>
            <svg role="img" aria-label={`${Math.round(oPct)}% of monthly budget used`} width="104" height="104" viewBox="0 0 104 104" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="52" cy="52" r="44" fill="none" stroke="var(--line)" strokeWidth="12" />
              <circle cx="52" cy="52" r="44" fill="none" stroke={oPct > 100 ? '#E8590C' : '#3B5BDB'} strokeWidth="12" strokeLinecap="round" pathLength={100} strokeDasharray={`${Math.min(100, oPct)} 100`} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 22, fontWeight: 800 }}>{Math.round(oPct)}%</span>
              <span className="muted" style={{ fontSize: 11, fontWeight: 600 }}>
                used
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
              {monthLabel(start)} · from your income
            </span>
            {oLeft >= 0 ? (
              <span style={{ fontSize: 22, fontWeight: 800 }}>
                {money(oLeft, cur)}{' '}
                <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>
                  left
                </span>
              </span>
            ) : (
              <span className="exp" style={{ fontSize: 22, fontWeight: 800 }}>
                {money(-oLeft, cur)} over
              </span>
            )}
            <span className="muted small">
              {money(oSpent, cur)} spent of {money(overall.limit, cur)} income
            </span>
            {oLeft > 0 && (
              <span className="small inc" style={{ fontWeight: 600 }}>
                ≈ {money(Math.floor(oLeft / daysLeft), cur)} a day for {daysLeft} days
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          <Empty
            icon="target"
            title="No income this month yet"
            text={`Your monthly budget is the income you add for ${monthLabel(start)}. Add your salary or other income to see how much you can spend.`}
            action={
              <a className="btn primary small" href={href('add?type=income&from=budgets')}>
                Add income
              </a>
            }
          />
        </div>
      )}

      <section className="section">
        <h2 className="h2">By category</h2>
        {catBudgets.length === 0 ? (
          <div className="card">
            <Empty icon="tag" title="No category budgets" text="Add a limit for food, shopping or anything else." />
          </div>
        ) : (
          <div className="card list">
            {catBudgets.map(({ b, cat, spent }) => {
              const left = b.limit - spent;
              const over = left < 0;
              return (
                <button key={b.id} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: '14px 0' }} onClick={() => setEditing(b)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <CatTile cat={cat} size={38} />
                    <span className="row-main">
                      <span className="row-title" style={{ fontWeight: 700 }}>
                        {cat!.name}
                      </span>
                      <span className={`row-sub ${over ? 'exp' : ''}`} style={over ? { fontWeight: 600 } : undefined}>
                        {over ? `Over by ${money(-left, cur)}` : `${money(left, cur)} left`}
                        {b.month ? ' · this month only' : ''}
                      </span>
                    </span>
                    <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      <strong style={{ color: 'var(--ink)' }}>{money(spent, cur)}</strong> / {money(b.limit, cur).replace(cur + ' ', '')}
                    </span>
                  </div>
                  <Progress pct={(spent / b.limit) * 100} color={over ? '#E8590C' : cat!.color} />
                </button>
              );
            })}
          </div>
        )}
      </section>

      {editing && (
        <BudgetSheet
          budget={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(b) => {
            update((d) => ({ ...d, budgets: d.budgets.some((x) => x.id === b.id) ? d.budgets.map((x) => (x.id === b.id ? b : x)) : [...d.budgets, b] }));
            setEditing(null);
          }}
          onDelete={(id) => {
            update((d) => ({ ...d, budgets: d.budgets.filter((x) => x.id !== id) }));
            setEditing(null);
          }}
        />
      )}
    </main>
  );
}

function BudgetSheet(props: { budget: Budget | null; onClose: () => void; onSave: (b: Budget) => void; onDelete: (id: string) => void }) {
  const { data, cur } = useStore();
  const existing = props.budget && props.budget.id ? props.budget : null;
  const thisMonth = monthKey(new Date());
  const [once, setOnce] = useState(!!props.budget?.month);
  // A category can have one repeating budget and one for this month only.
  const used = new Set(data.budgets.filter((b) => b.id !== existing?.id && (once ? b.month === thisMonth : !b.month)).map((b) => b.categoryId ?? 'overall'));
  const options = [
    ...data.categories.filter((c) => c.type === 'expense' && !c.archived && !used.has(c.id)).map((c) => ({ value: c.id, label: c.name })),
  ];
  const [picked, setScope] = useState(props.budget ? props.budget.categoryId ?? 'overall' : options[0]?.value ?? '');
  const scope = existing || options.some((o) => o.value === picked) ? picked : options[0]?.value ?? '';
  const [limit, setLimit] = useState(props.budget?.limit ? String(props.budget.limit) : '');
  const [error, setError] = useState('');

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(limit);
    if (!(n > 0)) return setError('Enter a limit above zero');
    if (!scope) return setError(once ? 'Every category already has a budget for this month' : 'Every category already has a budget');
    if (existing && data.budgets.some((b) => b.id !== existing.id && b.categoryId === existing.categoryId && (once ? b.month === thisMonth : !b.month)))
      return setError(once ? 'This category already has a budget for this month' : 'This category already has a repeating budget');
    const b: Budget = { id: existing?.id ?? uid(), categoryId: scope === 'overall' ? null : scope, limit: n };
    if (once) b.month = existing?.month ?? thisMonth;
    props.onSave(b);
  };

  return (
    <Sheet title={existing ? 'Edit budget' : 'New budget'} onClose={props.onClose}>
      <form className="form" onSubmit={save}>
        <label className="field">
          <span>Budget for</span>
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value)} disabled={!!existing}>
            {existing && <option value={scope}>{scope === 'overall' ? 'Whole month (all spending)' : data.categories.find((c) => c.id === scope)?.name}</option>}
            {!existing && options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{once ? 'Limit' : 'Monthly limit'} ({cur})</span>
          <input className="input" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 25000" autoFocus />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={once} onChange={(e) => setOnce(e.target.checked)} />
          <span>
            <strong>Only for {monthLabel(existing?.month ? new Date(existing.month + '-01T00:00') : new Date())}</strong>
            <span className="muted">{once ? "It won't repeat next month." : 'Leave unticked to repeat this budget every month.'}</span>
          </span>
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn primary block">Save budget</button>
        {existing && (
          <button type="button" className="btn danger block" onClick={async () => (await ask('Delete this budget?')) && props.onDelete(existing.id)}>
            <Icon name="trash" size={18} />
            Delete budget
          </button>
        )}
      </form>
    </Sheet>
  );
}
