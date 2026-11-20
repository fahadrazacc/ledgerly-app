import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../icons';
import { useStore } from '../store';
import { go, href } from '../router';
import { accountColor, accountIcon, CatTile, IconTile, Keypad, Segmented, Sheet } from '../ui';
import type { RecordType, Txn } from '../types';
import { balanceOf, money, toLocalInput, uid } from '../utils';

const COLORS: Record<RecordType, string> = { expense: '#C2410C', income: '#087F5B', transfer: '#3B5BDB' };

export function AddRecord({ id, from, presetType }: { id: string | null; from: string; presetType: RecordType | null }) {
  const { data, update, cur } = useStore();
  const existing = id ? data.txns.find((t) => t.id === id) : undefined;
  const accounts = data.accounts.filter((a) => !a.archived || a.id === existing?.accountId || a.id === existing?.toAccountId);
  const lastUsedAccount = useMemo(() => [...data.txns].sort((a, b) => b.createdAt - a.createdAt)[0]?.accountId, [data.txns]);

  const [type, setType] = useState<RecordType>(existing?.type ?? presetType ?? 'expense');
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '0');
  const [categoryId, setCategoryId] = useState<string | undefined>(existing?.categoryId);
  const [accountId, setAccountId] = useState(existing?.accountId ?? lastUsedAccount ?? accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(existing?.toAccountId ?? accounts.find((a) => a.id !== (existing?.accountId ?? accounts[0]?.id))?.id ?? '');
  const [date, setDate] = useState(toLocalInput(existing ? new Date(existing.date) : new Date()));
  const [note, setNote] = useState(existing?.note ?? '');
  const [sheet, setSheet] = useState<null | 'cat' | 'acc' | 'to'>(null);
  const [error, setError] = useState('');

  const cats = data.categories.filter((c) => c.type === (type === 'income' ? 'income' : 'expense'));
  const cat = data.categories.find((c) => c.id === categoryId);
  const acc = data.accounts.find((a) => a.id === accountId);
  const to = data.accounts.find((a) => a.id === toAccountId);
  const color = COLORS[type];

  // keep the category valid for the chosen type
  useEffect(() => {
    if (type === 'transfer') return;
    if (!cat || cat.type !== type) setCategoryId(undefined);
  }, [type, cat]);

  const press = (k: string) => {
    setError('');
    setAmount((a) => {
      if (k === 'back') return a.length > 1 ? a.slice(0, -1) : '0';
      if (k === '.') return a.includes('.') ? a : a + '.';
      const dec = a.split('.')[1];
      if (dec !== undefined && dec.length >= 2) return a;
      if (a.replace('.', '').length >= 10) return a;
      return a === '0' ? k : a + k;
    });
  };

  useEffect(() => {
    if (sheet) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      if (/^\d$/.test(e.key) || e.key === '.') press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') save();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const value = Number(amount);
  const parts = amount.split('.');
  const display = Number(parts[0]).toLocaleString('en-US') + (parts.length > 1 ? '.' + parts[1] : '');

  function save() {
    if (!(value > 0)) return setError('Enter an amount');
    if (!accountId) return setError('Add an account first');
    if (type !== 'transfer' && !categoryId) {
      setSheet('cat');
      return setError('Choose a category');
    }
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) return setError('Pick two different accounts');
    const txn: Txn = {
      id: existing?.id ?? uid(),
      type,
      amount: Math.round(value * 100) / 100,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      categoryId: type === 'transfer' ? undefined : categoryId,
      date: new Date(date).toISOString(),
      note: note.trim() || undefined,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    update((d) => ({ ...d, txns: existing ? d.txns.map((t) => (t.id === txn.id ? txn : t)) : [...d.txns, txn] }));
    go(from);
  }

  const remove = () => {
    if (!existing || !confirm('Delete this record?')) return;
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

  return (
    <main className="screen no-nav narrow" style={{ gap: 14 }}>
      <header className="head">
        <a className="btn-icon" href={href(from)} aria-label="Close">
          <Icon name="close" />
        </a>
        <h1 className="h-small">{existing ? 'Edit record' : 'New record'}</h1>
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

      <div className="amount-wrap">
        <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
          Amount
        </span>
        <div className="amount" aria-live="polite">
          <span className="cur">{cur}</span>
          <span className="val" style={{ color }}>
            {display}
          </span>
        </div>
      </div>

      <div className="grid2" style={{ gap: 8 }}>
        {type === 'transfer' ? (
          <button className="pick-btn" onClick={() => setSheet('to')}>
            <IconTile icon={to ? accountIcon[to.kind] : 'transfer'} color={to ? accountColor[to.kind] : '#3B5BDB'} size={34} />
            <span className="row-main">
              <span className="pick-label">To account</span>
              <span className="pick-value">{to?.name ?? 'Choose'}</span>
            </span>
          </button>
        ) : (
          <button className="pick-btn" onClick={() => setSheet('cat')}>
            <CatTile cat={cat} size={34} />
            <span className="row-main">
              <span className="pick-label">Category</span>
              <span className="pick-value">{cat?.name ?? 'Choose'}</span>
            </span>
          </button>
        )}
        <button className="pick-btn" onClick={() => setSheet('acc')}>
          <IconTile icon={acc ? accountIcon[acc.kind] : 'bank'} color={acc ? accountColor[acc.kind] : '#3B5BDB'} size={34} />
          <span className="row-main">
            <span className="pick-label">{type === 'transfer' ? 'From account' : 'Account'}</span>
            <span className="pick-value">{acc?.name ?? 'Choose'}</span>
          </span>
        </button>
        <label className="pick-btn">
          <IconTile icon="calendar" color="#7048E8" size={34} />
          <span className="row-main">
            <span className="pick-label">Date &amp; time</span>
            <input type="datetime-local" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </span>
        </label>
        <label className="pick-btn">
          <IconTile icon="note" color="#495057" size={34} />
          <span className="row-main">
            <span className="pick-label">Note</span>
            <input type="text" placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} />
          </span>
        </label>
      </div>

      {error && (
        <div className="error" role="alert" style={{ textAlign: 'center' }}>
          {error}
        </div>
      )}

      <Keypad onKey={press} extra="." />

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
          </div>
        </Sheet>
      )}

      {(sheet === 'acc' || sheet === 'to') && (
        <Sheet title={sheet === 'to' ? 'Transfer to' : 'Choose account'} onClose={() => setSheet(null)}>
          <div className="card list">
            {accounts
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
                  <IconTile icon={accountIcon[a.kind]} color={accountColor[a.kind]} />
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
