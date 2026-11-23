import { useEffect, useMemo, useRef, useState } from 'react';
import { ask } from '../confirm';
import { Icon } from '../icons';
import { CategorySheet } from './Categories';
import { useStore } from '../store';
import { go, href } from '../router';
import { AccountTile, CatTile, IconTile, Segmented, Sheet } from '../ui';
import type { AppData, RecordType, Txn } from '../types';
import { toDateInput, uid } from '../utils';
import { evaluate, hasOp, press as calcPress } from '../calc';
import { budgetAlert, nextDue, notifyNow } from '../notify';
import { toast } from '../toast';

const timeLabelOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const inEvent = (e: { start: string; end?: string }, day: string) => day >= e.start && day <= (e.end ?? e.start);

const COLORS: Record<RecordType, string> = { expense: 'var(--exp)', income: 'var(--inc)', transfer: 'var(--accent)' };
const pad = (n: number) => String(n).padStart(2, '0');
const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const KEYS = ['1', '2', '3', '÷', '4', '5', '6', '×', '7', '8', '9', '−', '.', '0', 'back', '+', 'C', '='];

export function AddRecord({ id, reminderId, from, presetType, presetEvent }: { id: string | null; reminderId: string | null; from: string; presetType: RecordType | null; presetEvent?: string | null }) {
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
  const [startDate] = useState(() => (existing ? new Date(existing.date) : new Date()));

  const [type, setType] = useState<RecordType>(existing?.type ?? reminder?.type ?? presetType ?? 'expense');
  const [expr, setExpr] = useState(existing ? String(existing.amount) : reminder?.amount ? String(reminder.amount) : '0');
  const [categoryId, setCategoryId] = useState<string | undefined>(existing?.categoryId ?? reminder?.categoryId);
  const [accountId, setAccountId] = useState(startAccount);
  const [toAccountId, setToAccountId] = useState(existing?.toAccountId ?? accounts.find((a) => a.id !== startAccount)?.id ?? '');
  const [day, setDay] = useState(toDateInput(startDate));
  const [time, setTime] = useState(timeOf(startDate));
  const [note, setNote] = useState(existing?.note ?? reminder?.title ?? '');
  const [sheet, setSheet] = useState<null | 'newcat' | 'event' | 'details'>(null);
  const events = (data.events ?? []).filter((e) => !e.archived || e.id === existing?.eventId);
  const autoEvent = (d: string) => events.find((e) => e.autoAdd && !e.archived && inEvent(e, d))?.id;
  const [eventId, setEventId] = useState<string | undefined>(existing ? existing.eventId : (presetEvent ?? autoEvent(toDateInput(startDate))));
  const [eventTouched, setEventTouched] = useState(!!existing || !!presetEvent);
  const ev = events.find((e) => e.id === eventId);
  const [error, setError] = useState('');

  const cats = data.categories.filter((c) => c.type === (type === 'income' ? 'income' : 'expense') && (!c.archived || c.id === categoryId));
  const cat = data.categories.find((c) => c.id === categoryId);
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


  function save() {
    if (!(value > 0)) return setError(evaluate(expr) === null ? 'Check the calculation' : 'Enter an amount');
    if (!accountId) return setError('Add an account first');
    if (type !== 'transfer' && !categoryId) return setError('Choose a category');
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) return setError('Pick two different accounts');
    const when = new Date(`${day}T${time || '12:00'}`);
    if (isNaN(when.getTime())) return setError('Check the date and time');
    // Keep seconds so records added in the same minute stay in order.
    const untouched = time === timeOf(startDate) && day === toDateInput(startDate);
    if (untouched) when.setTime(existing ? startDate.getTime() : Date.now());
    else {
      const now = new Date();
      when.setSeconds(now.getSeconds(), now.getMilliseconds());
    }
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
      eventId: eventId || undefined,
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

  const accountStrip = (label: string, value: string, pick: (id: string) => void, exclude?: string) => (
    <ChoiceStrip label={label} selected={value}>
      {data.accounts
        .filter((a) => (!a.archived || (a.id === value && a.id === existing?.accountId)) && a.id !== exclude)
        .map((a) => (
          <button key={a.id} type="button" className={`choice ${a.id === value ? 'on' : ''}`} aria-pressed={a.id === value} onClick={() => pick(a.id)}>
            <AccountTile account={a} size={26} />
            {a.name}
            {a.archived ? ' (inactive)' : ''}
          </button>
        ))}
      {accounts.length === 0 && (
        <a className="choice" href={href('accounts')}>
          <Icon name="plus" size={18} />
          Add account
        </a>
      )}
    </ChoiceStrip>
  );
  const pickFrom = (id: string) => {
    setAccountId(id);
    setError('');
    if (id === toAccountId) setToAccountId(accounts.find((x) => x.id !== id)?.id ?? '');
  };

  return (
    <main className="screen no-nav narrow add-screen">
      <header className="head">
        <a className="btn-icon" href={href(from)} aria-label="Close">
          <Icon name="close" />
        </a>
        <h1 className="h-small">{existing ? 'Edit record' : reminder ? `Pay: ${reminder.title}` : 'New record'}</h1>
        <div className="head-actions">
          {existing && (
            <button className="btn-icon" aria-label="Delete record" onClick={remove} style={{ color: 'var(--exp)' }}>
              <Icon name="trash" />
            </button>
          )}
          <button className="btn small save-top" style={{ background: color }} onClick={save}>
            <Icon name="check" size={18} stroke={2.4} />
            Save
          </button>
        </div>
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

      {type === 'transfer' ? (
        <>
          {accountStrip('From account', accountId, pickFrom)}
          {accountStrip('To account', toAccountId, (id) => { setToAccountId(id); setError(''); }, accountId)}
        </>
      ) : (
        <>
          <ChoiceStrip label="Category" selected={categoryId}>
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`choice ${c.id === categoryId ? 'on' : ''}`}
                aria-pressed={c.id === categoryId}
                onClick={() => {
                  setCategoryId(c.id);
                  setError('');
                }}
              >
                <CatTile cat={c} size={26} />
                {c.name}
              </button>
            ))}
            <button type="button" className="choice add" onClick={() => setSheet('newcat')}>
              <Icon name="plus" size={18} stroke={2.2} />
              New
            </button>
          </ChoiceStrip>
          {accountStrip('Account', accountId, pickFrom)}
        </>
      )}

      <div className="dt">
        <label className="dt-field">
          <Icon name="calendar" size={16} />
          <input
            type="date"
            aria-label="Date"
            value={day}
            onChange={(e) => {
              if (!e.target.value) return;
              setDay(e.target.value);
              if (!eventTouched) setEventId(autoEvent(e.target.value));
            }}
          />
        </label>
        <button className="pick-btn compact more-btn" onClick={() => setSheet('details')} aria-label="More details: time and event">
          <Icon name="settings" size={18} />
          <span className="row-main">
            <span className="pick-value" style={{ color: 'var(--ink)' }}>More details</span>
            <span className="more-sub">{[timeLabelOf(time), ev?.name].filter(Boolean).join(' · ')}</span>
          </span>
        </button>
      </div>

      <label className="pick-btn compact">
        <Icon name="note" size={18} />
        <input type="text" placeholder="Add a note" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} style={{ color: 'var(--ink)' }} />
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


      {sheet === 'details' && (
        <Sheet title="More details (optional)" onClose={() => setSheet(null)}>
          <p className="muted small" style={{ margin: 0 }}>
            Nothing here is required. Change the time, or put this record in an event like a trip or wedding.
          </p>
          <label className="field">
            <span>Time</span>
            <div className="dt-field" style={{ border: '1px solid var(--border)' }}>
              <Icon name="clock" size={16} />
              <input type="time" aria-label="Time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
            </div>
          </label>
          <div className="field">
            <span>Event</span>
            <button className="pick-btn" onClick={() => setSheet('event')} style={{ border: '1px solid var(--border)' }}>
              {ev ? <IconTile icon={ev.icon} color={ev.color} size={34} /> : <IconTile icon="plane" color="#868E96" size={34} />}
              <span className="row-main">
                <span className="pick-value">{ev ? ev.name : 'No event'}</span>
                <span className="pick-label">{ev ? 'Tap to change' : 'Trips, weddings and other occasions'}</span>
              </span>
              <Icon name="chevR" />
            </button>
          </div>
          <button className="btn primary block" onClick={() => setSheet(null)}>
            Done
          </button>
        </Sheet>
      )}

      {sheet === 'event' && (
        <Sheet title="Add to an event" onClose={() => setSheet('details')}>
          <div className="card list">
            <button
              className="row"
              onClick={() => {
                setEventId(undefined);
                setEventTouched(true);
                setSheet('details');
              }}
            >
              <IconTile icon="close" color="#868E96" />
              <span className="row-main">
                <span className="row-title">No event</span>
              </span>
              {!eventId && (
                <span style={{ color: 'var(--accent)' }}>
                  <Icon name="check" />
                </span>
              )}
            </button>
            {events
              .filter((e) => !e.archived)
              .map((e) => (
                <button
                  key={e.id}
                  className="row"
                  onClick={() => {
                    setEventId(e.id);
                    setEventTouched(true);
                    setSheet('details');
                  }}
                >
                  <IconTile icon={e.icon} color={e.color} />
                  <span className="row-main">
                    <span className="row-title">{e.name}</span>
                    <span className="row-sub">{e.end && e.end !== e.start ? `${e.start} → ${e.end}` : e.start}</span>
                  </span>
                  {eventId === e.id && (
                    <span style={{ color: 'var(--accent)' }}>
                      <Icon name="check" />
                    </span>
                  )}
                </button>
              ))}
          </div>
          <a className="btn secondary" href={href('events')}>
            {events.length ? 'Manage events' : 'Create an event (trip, wedding…)'}
          </a>
        </Sheet>
      )}

      {sheet === 'newcat' && (
        <CategorySheet
          category={null}
          type={type === 'income' ? 'income' : 'expense'}
          onClose={() => setSheet(null)}
          onSaved={(c) => {
            setCategoryId(c.id);
            setError('');
            setSheet(null);
          }}
        />
      )}

    </main>
  );
}

/** A labelled, horizontally scrolling row of choices; keeps the selected one in view. */
function ChoiceStrip({ label, selected, children }: { label: string; selected?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.choice.on');
    const box = ref.current;
    if (el && box && (el.offsetLeft < box.scrollLeft || el.offsetLeft + el.offsetWidth > box.scrollLeft + box.clientWidth))
      box.scrollLeft = Math.max(0, el.offsetLeft - 16);
  }, [selected]);
  return (
    <div className="choice-block">
      <span className="choice-label">{label}</span>
      <div className="choice-strip" ref={ref} role="group" aria-label={label}>
        {children}
      </div>
    </div>
  );
}
