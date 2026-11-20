import { useRef, useState } from 'react';
import { ask } from '../confirm';
import { Icon, type IconName } from '../icons';
import { useStore } from '../store';
import { href } from '../router';
import { toast } from '../toast';
import { AccountTile, BackLink, accountColor, accountIcon, accountKindLabel, Empty, Header, Segmented, Sheet } from '../ui';
import type { Account, AccountKind, Debt } from '../types';
import { balanceOf, initials, money, resizeImage, shortDate, toDateInput, totalBalance, uid } from '../utils';
import { CATEGORY_COLORS } from './Categories';

const ACCOUNT_ICONS: IconName[] = ['bank', 'cash', 'wallet', 'card', 'savings', 'phoneDevice', 'briefcase', 'store', 'house', 'trend', 'gift', 'percent', 'users', 'laptop', 'car', 'plane', 'heart', 'tag'];

export function Accounts() {
  const { data, cur, update } = useStore();
  const [acc, setAcc] = useState<Account | 'new' | null>(null);
  const [debt, setDebt] = useState<Debt | 'new' | null>(null);
  const [showSettled, setShowSettled] = useState(false);

  const active = data.accounts.filter((a) => !a.archived);
  const inactive = data.accounts.filter((a) => a.archived);
  const open = data.debts.filter((d) => !d.settled);
  const receive = open.filter((d) => d.kind === 'lent').reduce((s, d) => s + d.amount, 0);
  const owe = open.filter((d) => d.kind === 'borrowed').reduce((s, d) => s + d.amount, 0);
  const balance = totalBalance(data);
  const debts = data.debts.filter((d) => showSettled || !d.settled).sort((a, b) => Number(a.settled) - Number(b.settled) || (a.due ?? a.date).localeCompare(b.due ?? b.date));

  const setActive = (a: Account, on: boolean) => {
    if (!on && active.length <= 1) return toast('Keep at least one account active');
    update((d) => ({ ...d, accounts: d.accounts.map((x) => (x.id === a.id ? { ...x, archived: on ? undefined : true } : x)) }));
    toast(on ? `${a.name} is active` : `${a.name} is now inactive`);
  };

  const accountRow = (a: Account) => (
    <div key={a.id} className="acc-row" style={a.archived ? { opacity: 0.6 } : undefined}>
      <button className="row" onClick={() => setAcc(a)}>
        <AccountTile account={a} size={42} />
        <span className="row-main">
          <span className="row-title" style={{ fontWeight: 700 }}>
            {a.name}
          </span>
          <span className="row-sub">
            {money(balanceOf(data, a.id), cur)} · {a.archived ? 'Inactive' : accountKindLabel[a.kind]}
          </span>
        </span>
      </button>
      <label className="switch" title={a.archived ? 'Activate' : 'Deactivate'}>
        <input type="checkbox" aria-label={`${a.name} active`} checked={!a.archived} onChange={(e) => setActive(a, e.target.checked)} />
        <span />
      </label>
    </div>
  );

  return (
    <main className="screen">
      <Header
        title="Accounts"
        left={<BackLink to="home" />}
        right={
          <button className="btn-icon solid" aria-label="Add account" onClick={() => setAcc('new')}>
            <Icon name="plus" stroke={2.2} />
          </button>
        }
      />

      <section className="dark-card" style={{ gap: 6 }}>
        <span className="dark-muted">Net worth</span>
        <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.4 }}>{money(balance + receive - owe, cur)}</span>
        <span style={{ fontSize: 12, color: '#b4bccb' }}>
          Active accounts {money(balance, cur)} + to receive {money(receive, cur)} − you owe {money(owe, cur)}
        </span>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="h2">My accounts</h2>
          <span className="muted small">Switch = active</span>
        </div>
        <div className="card list">
          {active.length === 0 && <Empty icon="bank" title="No active accounts" text="Add cash, a bank account or a wallet to start." />}
          {active.map(accountRow)}
        </div>
        <button className="btn secondary" onClick={() => setAcc('new')}>
          <Icon name="plus" size={18} stroke={2.2} />
          Add another account
        </button>
      </section>

      {inactive.length > 0 && (
        <section className="section">
          <h2 className="h2">Inactive accounts</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Not counted in your balance and hidden when adding records. Their history stays in Records. Turn the switch on to activate again.
          </p>
          <div className="card list">{inactive.map(accountRow)}</div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="h2">Debts &amp; loans</h2>
          <button className="link" onClick={() => setDebt('new')}>
            Add
          </button>
        </div>
        <div className="grid2">
          <div className="stat" style={{ padding: 14 }}>
            <span className="label" style={{ fontSize: 12 }}>
              You'll receive
            </span>
            <span className="value inc" style={{ fontSize: 18 }}>
              {money(receive, cur)}
            </span>
          </div>
          <div className="stat" style={{ padding: 14 }}>
            <span className="label" style={{ fontSize: 12 }}>
              You owe
            </span>
            <span className="value exp" style={{ fontSize: 18 }}>
              {money(owe, cur)}
            </span>
          </div>
        </div>
        <div className="card list">
          {debts.length === 0 && <Empty icon="users" title="No open debts" text="Track money you lend to or borrow from people." />}
          {debts.map((d) => (
            <button key={d.id} className="row" onClick={() => setDebt(d)} style={d.settled ? { opacity: 0.55 } : undefined}>
              <span className="tile" style={{ width: 42, height: 42, borderRadius: 21, fontWeight: 800, fontSize: 14, background: d.kind === 'lent' ? 'var(--inc-soft)' : 'var(--exp-soft)', color: d.kind === 'lent' ? 'var(--inc)' : 'var(--exp)' }}>
                {initials(d.person)}
              </span>
              <span className="row-main">
                <span className="row-title" style={{ fontWeight: 700 }}>
                  {d.person}
                </span>
                <span className="row-sub">
                  {d.settled ? 'Settled' : d.kind === 'lent' ? 'Lent' : 'Borrowed'}
                  {d.due && !d.settled ? ` · due ${shortDate(d.due)}` : ''}
                </span>
              </span>
              <span className={`amt ${d.kind === 'lent' ? 'inc' : 'exp'}`}>{money(d.kind === 'lent' ? d.amount : -d.amount, cur, true)}</span>
            </button>
          ))}
        </div>
        {data.debts.some((d) => d.settled) && (
          <button className="link" style={{ alignSelf: 'center' }} onClick={() => setShowSettled((s) => !s)}>
            {showSettled ? 'Hide settled' : 'Show settled'}
          </button>
        )}
      </section>

      {acc && (
        <AccountSheet
          account={acc === 'new' ? null : acc}
          onClose={() => setAcc(null)}
          onSave={(a) => {
            update((d) => ({ ...d, accounts: d.accounts.some((x) => x.id === a.id) ? d.accounts.map((x) => (x.id === a.id ? a : x)) : [...d.accounts, a] }));
            setAcc(null);
          }}
          onDelete={(id) => {
            update((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== id) }));
            setAcc(null);
          }}
        />
      )}
      {debt && (
        <DebtSheet
          debt={debt === 'new' ? null : debt}
          onClose={() => setDebt(null)}
          onSave={(x) => {
            update((d) => ({ ...d, debts: d.debts.some((y) => y.id === x.id) ? d.debts.map((y) => (y.id === x.id ? x : y)) : [...d.debts, x] }));
            setDebt(null);
          }}
          onDelete={(id) => {
            update((d) => ({ ...d, debts: d.debts.filter((y) => y.id !== id) }));
            setDebt(null);
          }}
        />
      )}
    </main>
  );
}

function AccountSheet(props: { account: Account | null; onClose: () => void; onSave: (a: Account) => void; onDelete: (id: string) => void }) {
  const { data, cur } = useStore();
  const a = props.account;
  const [name, setName] = useState(a?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(a?.kind ?? 'bank');
  const [initial, setInitial] = useState(a ? String(a.initial) : '');
  const [active, setActive] = useState(!a?.archived);
  const [icon, setIcon] = useState<IconName | undefined>(a?.icon);
  const [color, setColor] = useState<string | undefined>(a?.color);
  const [image, setImage] = useState<string | undefined>(a?.image);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const used = a ? data.txns.some((t) => t.accountId === a.id || t.toAccountId === a.id) : false;
  const activeCount = data.accounts.filter((x) => !x.archived).length;
  const shownIcon = icon ?? accountIcon[kind];
  const shownColor = color ?? accountColor[kind];
  const preview: Account = { id: '', name, kind, initial: 0, icon, color, image };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the account a name');
    if (data.accounts.some((x) => x.id !== a?.id && x.name.toLowerCase() === name.trim().toLowerCase())) return setError('You already have an account with that name');
    const n = Number(initial || 0);
    if (Number.isNaN(n)) return setError('Starting balance must be a number');
    if (!active && a && !a.archived && activeCount <= 1) return setError('Keep at least one account active');
    props.onSave({ id: a?.id ?? uid(), name: name.trim(), kind, initial: n, archived: active ? undefined : true, icon, color, image });
  };

  return (
    <Sheet title={a ? 'Edit account' : 'New account'} onClose={props.onClose}>
      <form className="form" onSubmit={save}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AccountTile account={preview} size={56} />
          <label className="field" style={{ flex: 1 }}>
            <span>Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meezan current" autoFocus={!a} />
          </label>
        </div>
        <div className="grid2">
          <label className="field">
            <span>Type</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
              {(Object.keys(accountKindLabel) as AccountKind[]).map((k) => (
                <option key={k} value={k}>
                  {accountKindLabel[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Starting balance ({cur})</span>
            <input className="input" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value.replace(/[^\d.-]/g, ''))} placeholder="0" />
          </label>
        </div>
        {a && (
          <span className="muted small">
            Current balance: <strong>{money(balanceOf(data, a.id), cur)}</strong>. Changing the starting balance shifts it by the same amount.
          </span>
        )}

        <div className="field">
          <span>Picture</span>
          <div className="chips">
            <button type="button" className="chip" onClick={() => fileRef.current?.click()}>
              <Icon name="camera" size={14} /> Upload image
            </button>
            {image && (
              <button type="button" className="chip" onClick={() => setImage(undefined)}>
                Remove image
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                setImage(await resizeImage(f, 160));
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
        </div>
        {!image && (
          <>
            <div className="field">
              <span>Icon</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 }}>
                {ACCOUNT_ICONS.map((ic) => (
                  <button key={ic} type="button" aria-label={`Icon ${ic}`} aria-pressed={ic === shownIcon} onClick={() => setIcon(ic)} className={`cat-opt ${ic === shownIcon ? 'on' : ''}`} style={{ padding: 0, height: 46, color: ic === shownIcon ? shownColor : 'var(--muted)', justifyContent: 'center' }}>
                    <Icon name={ic} size={22} />
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>Colour</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 }}>
                {CATEGORY_COLORS.map((col) => (
                  <button key={col} type="button" aria-label={`Colour ${col}`} aria-pressed={col === shownColor} onClick={() => setColor(col)} style={{ height: 40, borderRadius: 12, border: col === shownColor ? '3px solid var(--ink)' : '3px solid transparent', background: col }} />
                ))}
              </div>
            </div>
          </>
        )}

        <div className="row" style={{ borderBottom: 0, padding: '4px 0' }}>
          <span className="row-main">
            <span className="row-title">Active</span>
            <span className="row-sub">Inactive accounts are left out of your balance and new records</span>
          </span>
          <label className="switch">
            <input type="checkbox" aria-label="Account active" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span />
          </label>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn primary block">Save account</button>
        {a && used && (
          <a className="btn secondary block" href={href(`records?account=${a.id}`)}>
            <Icon name="list" size={18} />
            View this account's records
          </a>
        )}
        {a && !used && (
          <button type="button" className="btn danger block" onClick={async () => (await ask('Delete this account?')) && props.onDelete(a.id)}>
            <Icon name="trash" size={18} />
            Delete account
          </button>
        )}
        {a && used && <p className="muted small" style={{ margin: 0 }}>This account has records, so it can be made inactive but not deleted.</p>}
      </form>
    </Sheet>
  );
}

function DebtSheet(props: { debt: Debt | null; onClose: () => void; onSave: (d: Debt) => void; onDelete: (id: string) => void }) {
  const { cur } = useStore();
  const d = props.debt;
  const [person, setPerson] = useState(d?.person ?? '');
  const [kind, setKind] = useState<Debt['kind']>(d?.kind ?? 'lent');
  const [amount, setAmount] = useState(d ? String(d.amount) : '');
  const [due, setDue] = useState(d?.due ? toDateInput(new Date(d.due)) : '');
  const [note, setNote] = useState(d?.note ?? '');
  const [error, setError] = useState('');

  const build = (settled: boolean): Debt | null => {
    const n = Number(amount);
    if (!person.trim()) return setError('Who is it with?'), null;
    if (!(n > 0)) return setError('Enter an amount'), null;
    return {
      id: d?.id ?? uid(),
      person: person.trim(),
      kind,
      amount: n,
      date: d?.date ?? new Date().toISOString(),
      due: due ? new Date(due + 'T12:00').toISOString() : undefined,
      note: note.trim() || undefined,
      settled,
    };
  };

  return (
    <Sheet title={d ? 'Debt details' : 'New debt'} onClose={props.onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const x = build(d?.settled ?? false);
          if (x) props.onSave(x);
        }}
      >
        <Segmented<Debt['kind']>
          label="Direction"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'lent', label: 'I lent', color: 'var(--inc)' },
            { value: 'borrowed', label: 'I borrowed', color: 'var(--exp)' },
          ]}
        />
        <label className="field">
          <span>Person</span>
          <input className="input" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Name" autoFocus={!d} />
        </label>
        <div className="grid2">
          <label className="field">
            <span>Amount ({cur})</span>
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
          <label className="field">
            <span>Due date (optional)</span>
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Note</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn primary block">Save</button>
        {d && (
          <button
            type="button"
            className="btn secondary block"
            onClick={() => {
              const x = build(!d.settled);
              if (x) props.onSave(x);
            }}
          >
            <Icon name="check" size={18} />
            {d.settled ? 'Mark as open again' : 'Mark as settled'}
          </button>
        )}
        {d && (
          <button type="button" className="btn danger block" onClick={async () => (await ask('Delete this debt?')) && props.onDelete(d.id)}>
            <Icon name="trash" size={18} />
            Delete
          </button>
        )}
      </form>
    </Sheet>
  );
}
