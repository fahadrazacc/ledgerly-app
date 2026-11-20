import { useEffect, useMemo, useState } from 'react';
import { ask } from '../confirm';
import { Icon } from '../icons';
import { CategorySheet } from './Categories';
import { useStore } from '../store';
import { go, href } from '../router';
import { AccountTile, CatTile, IconTile, Segmented, Sheet } from '../ui';
import type { AppData, RecordType, Txn } from '../types';
import { addDays, balanceOf, money, toDateInput, uid } from '../utils';
import { evaluate, hasOp, press as calcPress } from '../calc';
import { budgetAlert, nextDue, notifyNow } from '../notify';
import { toast } from '../toast';

const COLORS: Record<RecordType, string> = { expense: 'var(--exp)', income: 'var(--inc)', transfer: 'var(--accent)' };
const pad = (n: number) => String(n).padStart(2, '0');
const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '.', '0', 'back', '+', 'C', '='];

export function AddRecord({ id, reminderId, from, presetType }: { id: string | null; reminderId: string | null; from: string; presetType: RecordType | null }) {
  const { data, update, cur } = useStore();
  const existing = id ? data.txns.find((t) => t.id === id) : undefined;
  const reminder = reminderId ? data.reminders?.find((r) => r.id === reminderId) : undefined;
  // Only active accounts can be picked; an inactive one stays only on a record that already uses it.
  const accounts = data.accounts.filter((a) => !a.archived);
  const lastUsedAccount = useMemo(() => [...data.txns].sort((a, b) => b.createdAt - a.createdAt)[0]?.accountId, [data.txns]);

  const startAccount =
    existing?.accountId ??
    (reminder?.accountId && accounts.some((a) => a.id === reminder.accountId) ? reminder.accountId : undefined) ??
    (accounts.some((a) => a.id === lastUsedAccount) ? lastUsedAccount : undefined) ??
    accounts[0]?.id ??
    '';
  const startDate = existing ? new Date(existing.date) : new Date();

  const [type, setType] = useState<RecordType>(existing?.type ?? reminder?.type ?? presetType ?? 'expense');
  const [expr, setExpr] = useState(existing ? String(existing.amount) : reminder?.amount ? String(reminder.amount) : '0');
  const [categoryId, setCategoryId] = useState<string | undefined>(existing?.categoryId ?? reminder?.categoryId);
  const [accountId, setAccountId] = useState(startAccount);
  const [toAccountId, setToAccountId] = useState(existing?.toAccountId ?? accounts.find((a) => a.id !== startAccount)?.id ?? '');
  const [day, setDay] = useState(toDateInput(startDate));
  const [time, setTime] = useState(timeOf(startDate));
  const [note, setNote] = useState(existing?.note ?? reminder?.title ?? '');
  const [sheet, setSheet] = useState<null | 'cat' | 'acc' | 'to' | 'newcat'>(null);
  const [error, setError] = useState('');

  const cats = data.categories.filter((c) => c.type === (type === 'income' ? 'income' : 'expense') && (!c.archived || c.id === categoryId));
  const cat = data.categories.find((c) => c.id === categoryId);
  const acc = data.accounts.find((a) => a.id === accountId);
  const to = data.accounts.find((a) => a.id === toAccountId);
  const color = COLORS[type];

  useEffect(() => {
    if (type === 'transfer') return;
    if (!cat || cat.type !== type) setCategoryId(undefined);
  }, [type, cat]);

  const key = (k: string) => {
    setError('');
    setExpr((e) => calcPress(e, k));
  };

  useEffect(() => {
    if (sheet) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      const map: Record<string, string> = { '+': '+', '-': '−', '*': '×', x: '×', '/': '÷', '=': '=', Backspace: 'back', Escape: 'C', '.': '.' };
      if (/^\d$/.test(e.key)) key(e.key);
      else if (e.key === 'Enter') save();
      else if (map[e.key]) {
        e.preventDefault();
        key(map[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const value = evaluate(expr) ?? 0;
  const showExpr = hasOp(expr);
  const display = (() => {
    if (showExpr) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    const parts = expr.split('.');
    return Number(parts[0]).toLocaleString('en-US') + (parts.length > 1 ? '.' + parts[1] : '');
  })();

  const todayStr = toDateInput(new Date());
  const yesterdayStr = toDateInput(addDays(new Date(), -1));

  function save() {
    if (!(value > 0)) return setError(evaluate(expr) === null ? 'Check the calculation' : 'Enter an amount');
    if (!accountId) return setError('Add an account first');
    if (type !== 'transfer' && !categoryId) {
      setSheet('cat');
      return setError('Choose a category');
    }
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) return setError('Pick two different accounts');
    const when = new Date(`${day}T${time || '12:00'}`);
    if (isNaN(when.getTime())) return setError('Check the date and time');
    const txn: Txn = {
      id: existing?.id ?? uid(),
      type,
      amount: Math.round(value * 100) / 100,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      categoryId: type === 'transfer' ? undefined : categoryId,
      date: when.toISOString(),
      note: note.trim() || undefined,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    const next0: AppData = { ...data, txns: existing ? data.txns.map((t) => (t.id === txn.id ? txn : t)) : [...data.txns, txn] };
    const alert = !existing && txn.type === 'expense' ? budgetAlert(data, next0, txn.categoryId) : null;
    update((d) => {
      let next: AppData = { ...d, txns: existing ? d.txns.map((t) => (t.id === txn.id ? txn : t)) : [...d.txns, txn] };
      if (reminder) {
        // Paying a reminder moves it to its next date, or finishes it.
        next = {
          ...next,
          reminders: (next.reminders ?? []).map((r) => (r.id !== reminder.id ? r : r.repeat === 'none' ? { ...r, active: false } : { ...r, due: nextDue(r.due, r.repeat) })),
        };
      }
      return next;
    });
    if (alert) {
      toast(alert);
      notifyNow('Budget alert', alert);
    } else if (reminder) toast(reminder.repeat === 'none' ? 'Paid · reminder done' : 'Paid · next reminder scheduled');
    go(from);
  }

  const remove = async () => {
    if (!existing || !(await ask('Delete this record?'))) return;
    update((d) => ({ ...d, txns: d.txns.filter((t) => t.id !== existing.id) }));
    go(from);
  };

  if (id && !existing)
    return (
      <main className="screen no-nav narrow">
        <p>This record no longer exists.</p>
        <a className="btn primary" href={href(from)}>
          Go back
        </a>
      </main>
    );

  const accountButton = (label: string) => (
    <button className="pick-btn" onClick={() => setSheet('acc')}>
      <AccountTile account={acc} size={34} />
      <span className="row-main">
        <span className="pick-label">{label}</span>
        <span className="pick-value">{acc?.name ?? 'Choose'}</span>
      </span>
    </button>
  );

  return (
    <main className="screen no-nav narrow" style={{ gap: 12 }}>
      <header className="head">
        <a className="btn-icon" href={href(from)} aria-label="Close">
          <Icon name="close" />
        </a>
        <h1 className="h-small">{existing ? 'Edit record' : reminder ? `Pay: ${reminder.title}` : 'New record'}</h1>
        {existing ? (
          <button className="btn-icon" aria-label="Delete record" onClick={remove} style={{ color: 'var(--exp)' }}>
            <Icon name="trash" />
          </button>
        ) : (
          <span style={{ width: 44 }} />
        )}
      </header>

      <Segmented<RecordType>
        label="Record type"
        value={type}
        onChange={setType}
        options={[
          { value: 'expense', label: 'Expense', color: COLORS.expense },
          { value: 'income', label: 'Income', color: COLORS.income },
          { value: 'transfer', label: 'Transfer', color: COLORS.transfer },
        ]}
      />

      <div className="amount-wrap" style={{ padding: 0 }}>
        <span className="expr">{showExpr ? expr : 'Amount'}</span>
        <div className="amount" aria-live="polite">
          <span className="cur">{cur}</span>
          <span className="val" style={{ color }}>
            {display}
          </span>
        </div>
      </div>

      <div className="grid2" style={{ gap: 8 }}>
        {type === 'transfer' ? (
          <>
            {accountButton('From account')}
            <button className="pick-btn" onClick={() => setSheet('to')}>
              {to ? <AccountTile account={to} size={34} /> : <IconTile icon="transfer" color="#3B5BDB" size={34} />}
              <span className="row-main">
                <span className="pick-label">To account</span>
                <span className="pick-value">{to?.name ?? 'Choose'}</span>
              </span>
            </button>
          </>
        ) : (
          <>
            <button className="pick-btn" onClick={() => setSheet('cat')}>
              <CatTile cat={cat} size={34} />
              <span className="row-main">
                <span className="pick-label">Category</span>
                <span className="pick-value">{cat?.name ?? 'Choose'}</span>
              </span>
            </button>
            {accountButton('Account')}
          </>
        )}
      </div>

      <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="pick-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="calendar" size={16} /> Date &amp; time
          </span>
          <div className="chips">
            <button className={`chip ${day === todayStr ? 'on' : ''}`} onClick={() => setDay(todayStr)}>
              Today
            </button>
            <button className={`chip ${day === yesterdayStr ? 'on' : ''}`} onClick={() => setDay(yesterdayStr)}>
              Yesterday
            </button>
          </div>
        </div>
        <div className="dt">
          <input type="date" aria-label="Date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          <input type="time" aria-label="Time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
        </div>
      </div>

      <label className="pick-btn" style={{ minHeight: 52 }}>
        <IconTile icon="note" color="#495057" size={34} />
        <span className="row-main">
          <span className="pick-label">Note</span>
          <input type="text" placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} style={{ color: 'var(--ink)' }} />
        </span>
      </label>

      {error && (
        <div className="error" role="alert" style={{ textAlign: 'center' }}>
          {error}
        </div>
      )}

      <div className="keypad calc">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => key(k)}
            className={k === '=' ? 'eq' : k === 'C' ? 'clear' : /[+−×÷]/.test(k) ? 'op' : ''}
            style={k === '=' ? { gridColumn: 'span 3' } : undefined}
            aria-label={({ back: 'Delete', '.': 'Decimal point', '÷': 'Divide', '×': 'Multiply', '−': 'Minus', '+': 'Plus', C: 'Clear', '=': 'Equals' } as Record<string, string>)[k] ?? k}
          >
            {k === 'back' ? <Icon name="backspace" size={24} /> : k}
          </button>
        ))}
      </div>

      <button className="btn block" style={{ background: color, color: '#fff', height: 56, fontSize: 16 }} onClick={save}>
        <Icon name="check" size={20} stroke={2.2} />
        {existing ? 'Save changes' : 'Save record'}
      </button>

      {sheet === 'cat' && (
        <Sheet title="Choose category" onClose={() => setSheet(null)}>
          <div className="cat-grid">
            {cats.map((c) => (
              <button
                key={c.id}
                className={`cat-opt ${c.id === categoryId ? 'on' : ''}`}
                onClick={() => {
                  setCategoryId(c.id);
                  setError('');
                  setSheet(null);
                }}
              >
                <CatTile cat={c} size={40} />
                {c.name}
              </button>
            ))}
            <button className="cat-opt" onClick={() => setSheet('newcat')}>
              <span className="tile" style={{ width: 40, height: 40, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <Icon name="plus" size={20} stroke={2.2} />
              </span>
              New
            </button>
          </div>
          <a className="btn secondary" href={href('categories')}>
            Manage categories
          </a>
        </Sheet>
      )}

      {sheet === 'newcat' && (
        <CategorySheet
          category={null}
          type={type === 'income' ? 'income' : 'expense'}
          onClose={() => setSheet('cat')}
          onSaved={(c) => {
            setCategoryId(c.id);
            setError('');
            setSheet(null);
          }}
        />
      )}

      {(sheet === 'acc' || sheet === 'to') && (
        <Sheet title={sheet === 'to' ? 'Transfer to' : 'Choose account'} onClose={() => setSheet(null)}>
          <div className="card list">
            {data.accounts
              .filter((a) => !a.archived)
              .filter((a) => (sheet === 'to' ? a.id !== accountId : true))
              .map((a) => (
                <button
                  key={a.id}
                  className="row"
                  onClick={() => {
                    if (sheet === 'to') setToAccountId(a.id);
                    else {
                      setAccountId(a.id);
                      if (a.id === toAccountId) setToAccountId(accounts.find((x) => x.id !== a.id)?.id ?? '');
                    }
                    setSheet(null);
                  }}
                >
                  <AccountTile account={a} />
                  <span className="row-main">
                    <span className="row-title">{a.name}</span>
                    <span className="row-sub">{money(balanceOf(data, a.id), cur)}</span>
                  </span>
                  {(sheet === 'to' ? toAccountId : accountId) === a.id && (
                    <span style={{ color: 'var(--accent)' }}>
                      <Icon name="check" />
                    </span>
                  )}
                </button>
              ))}
          </div>
          <a className="btn secondary" href={href('accounts')}>
            Manage accounts
          </a>
        </Sheet>
      )}
    </main>
  );
}
