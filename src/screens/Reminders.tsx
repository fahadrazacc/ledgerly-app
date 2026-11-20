import { useEffect, useState } from 'react';
import { ask } from '../confirm';
import { Icon } from '../icons';
import { useStore } from '../store';
import { href } from '../router';
import { toast } from '../toast';
import { BackLink, CatTile, Empty, Header, Segmented, Sheet } from '../ui';
import type { Reminder, Repeat } from '../types';
import { money, toDateInput, uid } from '../utils';
import { askNotificationPermission, canNotify, nextDue, notificationPermission, notifyOf } from '../notify';

const REPEAT_LABEL: Record<Repeat, string> = { none: 'Once', weekly: 'Every week', monthly: 'Every month', yearly: 'Every year' };

export function dueLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diff < 0) return { text: diff === -1 ? 'Overdue · yesterday' : `Overdue · ${-diff} days`, late: true };
  if (diff === 0) return { text: `Due today, ${time}`, late: false, soon: true };
  if (diff === 1) return { text: `Due tomorrow, ${time}`, late: false, soon: true };
  return { text: `Due ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`, late: false };
}

export function NotificationBanner() {
  const { data } = useStore();
  const [perm, setPerm] = useState<'granted' | 'denied' | 'prompt' | null>(null);
  useEffect(() => {
    notificationPermission().then(setPerm);
  }, []);
  if (!canNotify())
    return (
      <div className="note">
        <Icon name="phone" size={18} />
        <span>Phone notifications work in the Android app. Here, due payments show on Home.</span>
      </div>
    );
  if (perm === 'granted' || perm === null || !notifyOf(data).payments) return null;
  return (
    <div className="note" style={{ justifyContent: 'space-between' }}>
      <span>Allow notifications so Ledgerly can remind you when payments are due.</span>
      <button className="btn primary small" onClick={async () => setPerm((await askNotificationPermission()) ? 'granted' : 'denied')}>
        Allow
      </button>
    </div>
  );
}

export function Reminders() {
  const { data, update, cur } = useStore();
  const [editing, setEditing] = useState<Reminder | 'new' | null>(null);
  const list = [...(data.reminders ?? [])].sort((a, b) => Number(b.active) - Number(a.active) || a.due.localeCompare(b.due));
  const activeList = list.filter((r) => r.active);
  const done = list.filter((r) => !r.active);

  const row = (r: Reminder) => {
    const cat = data.categories.find((c) => c.id === r.categoryId);
    const due = dueLabel(r.due);
    return (
      <div key={r.id} className="acc-row" style={!r.active ? { opacity: 0.55 } : undefined}>
        <button className="row" onClick={() => setEditing(r)}>
          <CatTile cat={cat} size={42} />
          <span className="row-main">
            <span className="row-title" style={{ fontWeight: 700 }}>
              {r.title}
            </span>
            <span className={`row-sub ${r.active && due.late ? 'exp' : ''}`} style={r.active && (due.late || due.soon) ? { fontWeight: 700, color: due.late ? 'var(--exp)' : 'var(--accent)' } : undefined}>
              {r.active ? due.text : 'Done'} · {REPEAT_LABEL[r.repeat]}
              {r.amount ? ` · ${money(r.amount, cur)}` : ''}
            </span>
          </span>
        </button>
        {r.active && (
          <a className="btn small primary" style={{ height: 38, padding: '0 14px' }} href={href(`add?reminder=${r.id}&from=reminders`)}>
            {r.type === 'income' ? 'Receive' : 'Pay'}
          </a>
        )}
      </div>
    );
  };

  return (
    <main className="screen narrow">
      <Header
        title="Payment reminders"
        left={<BackLink to="home" />}
        right={
          <button className="btn-icon solid" aria-label="Add reminder" onClick={() => setEditing('new')}>
            <Icon name="plus" stroke={2.2} />
          </button>
        }
      />
      <NotificationBanner />
      <div className="card list">
        {activeList.length ? (
          activeList.map(row)
        ) : (
          <Empty
            icon="bell"
            title="No reminders yet"
            text="Add bills like rent, electricity, internet or school fees. You'll get a notification when they're due, and one tap records the payment."
            action={
              <button className="btn primary small" onClick={() => setEditing('new')}>
                Add reminder
              </button>
            }
          />
        )}
      </div>
      {done.length > 0 && (
        <section className="section">
          <h2 className="h2">Done</h2>
          <div className="card list">{done.map(row)}</div>
        </section>
      )}
      {editing && (
        <ReminderSheet
          reminder={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            update((d) => ({ ...d, reminders: (d.reminders ?? []).some((x) => x.id === r.id) ? (d.reminders ?? []).map((x) => (x.id === r.id ? r : x)) : [...(d.reminders ?? []), r] }));
            setEditing(null);
            toast('Reminder saved');
          }}
          onDelete={(id) => {
            update((d) => ({ ...d, reminders: (d.reminders ?? []).filter((x) => x.id !== id) }));
            setEditing(null);
          }}
        />
      )}
    </main>
  );
}

function ReminderSheet(props: { reminder: Reminder | null; onClose: () => void; onSave: (r: Reminder) => void; onDelete: (id: string) => void }) {
  const { data, cur } = useStore();
  const r = props.reminder;
  const startDue = r ? new Date(r.due) : (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d;
  })();
  const [title, setTitle] = useState(r?.title ?? '');
  const [type, setType] = useState<'expense' | 'income'>(r?.type ?? 'expense');
  const [amount, setAmount] = useState(r?.amount ? String(r.amount) : '');
  const [categoryId, setCategoryId] = useState(r?.categoryId ?? '');
  const [accountId, setAccountId] = useState(r?.accountId ?? '');
  const [day, setDay] = useState(toDateInput(startDue));
  const [time, setTime] = useState(`${String(startDue.getHours()).padStart(2, '0')}:${String(startDue.getMinutes()).padStart(2, '0')}`);
  const [repeat, setRepeat] = useState<Repeat>(r?.repeat ?? 'monthly');
  const [daysBefore, setDaysBefore] = useState(r?.daysBefore ?? 1);
  const [error, setError] = useState('');
  const cats = data.categories.filter((c) => c.type === type && !c.archived);
  const accounts = data.accounts.filter((a) => !a.archived);

  const build = (patch: Partial<Reminder> = {}): Reminder | null => {
    if (!title.trim()) return setError('What is this payment for?'), null;
    const n = amount ? Number(amount) : undefined;
    if (amount && !(n! > 0)) return setError('Amount must be above zero'), null;
    const due = new Date(`${day}T${time || '10:00'}`);
    if (isNaN(due.getTime())) return setError('Pick a due date'), null;
    return {
      id: r?.id ?? uid(),
      title: title.trim(),
      amount: n,
      type,
      categoryId: categoryId || undefined,
      accountId: accountId || undefined,
      due: due.toISOString(),
      repeat,
      daysBefore,
      active: r?.active ?? true,
      ...patch,
    };
  };

  return (
    <Sheet title={r ? 'Edit reminder' : 'New payment reminder'} onClose={props.onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const x = build();
          if (x) props.onSave(x);
        }}
      >
        <Segmented<'expense' | 'income'>
          label="Reminder type"
          value={type}
          onChange={(t) => {
            setType(t);
            setCategoryId('');
          }}
          options={[
            { value: 'expense', label: 'Bill to pay', color: 'var(--exp)' },
            { value: 'income', label: 'Money to receive', color: 'var(--inc)' },
          ]}
        />
        <label className="field">
          <span>Title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Electricity bill, Rent" autoFocus={!r} maxLength={40} />
        </label>
        <div className="grid2">
          <label className="field">
            <span>Amount ({cur}, optional)</span>
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
          <label className="field">
            <span>Repeats</span>
            <select className="input" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
              {(Object.keys(REPEAT_LABEL) as Repeat[]).map((k) => (
                <option key={k} value={k}>
                  {REPEAT_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid2">
          <label className="field">
            <span>{r ? 'Next due date' : 'Due date'}</span>
            <input className="input" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          </label>
          <label className="field">
            <span>Time</span>
            <input className="input" type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Remind me</span>
          <select className="input" value={daysBefore} onChange={(e) => setDaysBefore(Number(e.target.value))}>
            <option value={0}>On the due date only</option>
            <option value={1}>1 day before, and on the day</option>
            <option value={3}>3 days before, and on the day</option>
            <option value={7}>1 week before, and on the day</option>
          </select>
        </label>
        <div className="grid2">
          <label className="field">
            <span>Category</span>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Choose when paying</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Account</span>
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Choose when paying</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn primary block">Save reminder</button>
        {r && r.active && (
          <>
            <a className="btn secondary block" href={href(`add?reminder=${r.id}&from=reminders`)}>
              <Icon name="check" size={18} />
              {type === 'income' ? 'Record it as received' : 'Record it as paid'}
            </a>
            {r.repeat !== 'none' && (
              <button
                type="button"
                className="btn secondary block"
                onClick={() => {
                  const x = build({ due: nextDue(r.due, r.repeat) });
                  if (x) props.onSave(x);
                }}
              >
                Skip this time
              </button>
            )}
          </>
        )}
        {r && !r.active && (
          <button type="button" className="btn secondary block" onClick={() => { const x = build({ active: true }); if (x) props.onSave(x); }}>
            Turn back on
          </button>
        )}
        {r && (
          <button type="button" className="btn danger block" onClick={async () => (await ask('Delete this reminder?')) && props.onDelete(r.id)}>
            <Icon name="trash" size={18} />
            Delete
          </button>
        )}
      </form>
    </Sheet>
  );
}
