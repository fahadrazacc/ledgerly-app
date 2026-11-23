import { useState } from 'react';
import { ask } from '../confirm';
import { Icon, type IconName } from '../icons';
import { useStore } from '../store';
import { href } from '../router';
import { toast } from '../toast';
import { BackLink, CatTile, Empty, Header, IconTile, Progress, Sheet } from '../ui';
import type { AppData, LedgerEvent } from '../types';
import { money, toDateInput, uid, byNewest } from '../utils';
import { CATEGORY_COLORS } from './Categories';
import { RecordRow } from './RecordRow';

const EVENT_ICONS: IconName[] = ['plane', 'heart', 'gift', 'house', 'car', 'users', 'baby', 'church', 'book', 'film', 'food', 'bag', 'dumbbell', 'briefcase', 'store', 'tag'];

export const eventTotals = (data: AppData, id: string) => {
  const txns = data.txns.filter((t) => t.eventId === id);
  const spent = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const income = txns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  return { txns, spent, income };
};

const fmtDate = (d: string) => new Date(d + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const eventDates = (e: LedgerEvent) => (e.end && e.end !== e.start ? `${fmtDate(e.start)} – ${fmtDate(e.end)}` : fmtDate(e.start));

function EventCard({ e }: { e: LedgerEvent }) {
  const { data, cur } = useStore();
  const { spent, txns } = eventTotals(data, e.id);
  return (
    <a className="card" href={href(`event?id=${e.id}`)} style={{ display: 'flex', flexDirection: 'column', gap: 10, textDecoration: 'none', color: 'var(--ink)', opacity: e.archived ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <IconTile icon={e.icon} color={e.color} size={44} />
        <span className="row-main">
          <span className="row-title" style={{ fontWeight: 700 }}>
            {e.name}
          </span>
          <span className="row-sub">
            {eventDates(e)} · {txns.length} records
          </span>
        </span>
        <span className="amt exp">{money(spent, cur)}</span>
      </div>
      {e.budget ? (
        <>
          <Progress pct={(spent / e.budget) * 100} color={spent > e.budget ? '#E8590C' : e.color} />
          <span className="muted small">
            {spent > e.budget ? `${money(spent - e.budget, cur)} over the ${money(e.budget, cur)} budget` : `${money(e.budget - spent, cur)} left of ${money(e.budget, cur)}`}
          </span>
        </>
      ) : null}
    </a>
  );
}

export function Events() {
  const { data } = useStore();
  const [editing, setEditing] = useState<LedgerEvent | 'new' | null>(null);
  const today = toDateInput(new Date());
  const list = [...(data.events ?? [])].sort((a, b) => b.start.localeCompare(a.start));
  const current = list.filter((e) => !e.archived && (e.end ?? e.start) >= today);
  const past = list.filter((e) => e.archived || (e.end ?? e.start) < today);
  return (
    <main className="screen narrow">
      <Header
        title="Events"
        left={<BackLink to="home" />}
        right={
          <button className="btn-icon solid" aria-label="Add event" onClick={() => setEditing('new')}>
            <Icon name="plus" stroke={2.2} />
          </button>
        }
      />
      <p className="muted small" style={{ margin: 0 }}>
        Group spending for a trip, wedding, Eid, a home move or any occasion, and see what it really cost. Records dated during an event are added to it automatically (you can change that per record).
      </p>
      {list.length === 0 && (
        <div className="card">
          <Empty
            icon="plane"
            title="No events yet"
            text="Create one, e.g. “Dubai trip” or “Ali’s wedding”, with dates and an optional budget."
            action={
              <button className="btn primary small" onClick={() => setEditing('new')}>
                Create event
              </button>
            }
          />
        </div>
      )}
      {current.length > 0 && (
        <section className="section">
          <h2 className="h2">Current &amp; upcoming</h2>
          {current.map((e) => (
            <EventCard key={e.id} e={e} />
          ))}
        </section>
      )}
      {past.length > 0 && (
        <section className="section">
          <h2 className="h2">Past</h2>
          {past.map((e) => (
            <EventCard key={e.id} e={e} />
          ))}
        </section>
      )}
      {editing && <EventSheet event={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </main>
  );
}

export function EventDetail({ id }: { id: string | null }) {
  const { data, cur } = useStore();
  const [editing, setEditing] = useState(false);
  const e = (data.events ?? []).find((x) => x.id === id);
  if (!e)
    return (
      <main className="screen narrow">
        <Header title="Event" left={<BackLink to="events" />} />
        <p>This event no longer exists.</p>
      </main>
    );
  const { txns, spent, income } = eventTotals(data, e.id);
  const days = Math.max(1, Math.round((new Date((e.end ?? e.start) + 'T12:00').getTime() - new Date(e.start + 'T12:00').getTime()) / 86_400_000) + 1);
  const byCat = new Map<string, number>();
  txns.filter((t) => t.type === 'expense').forEach((t) => byCat.set(t.categoryId ?? '', (byCat.get(t.categoryId ?? '') ?? 0) + t.amount));
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const sorted = [...txns].sort(byNewest);
  return (
    <main className="screen narrow">
      <Header
        title={e.name}
        left={<BackLink to="events" />}
        right={
          <button className="btn-icon" aria-label="Edit event" onClick={() => setEditing(true)}>
            <Icon name="edit" />
          </button>
        }
      />
      <section className="dark-card" style={{ gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <IconTile icon={e.icon} color={e.color} size={44} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="dark-muted">{eventDates(e)}</span>
            <span style={{ fontSize: 12, color: '#b4bccb' }}>
              {days} day{days === 1 ? '' : 's'} · {txns.length} records
            </span>
          </div>
        </div>
        <span className="dark-muted">Total spent</span>
        <span className="big-num" style={{ marginTop: -10 }}>
          {money(spent, cur)}
        </span>
        <div className="grid2">
          <div className="mini-pill" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <span style={{ fontSize: 11, color: '#b4bccb' }}>Per day</span>
            <span style={{ fontWeight: 700 }}>{money(Math.round(spent / days), cur)}</span>
          </div>
          <div className="mini-pill" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <span style={{ fontSize: 11, color: '#b4bccb' }}>{e.budget ? 'Budget left' : 'Money in'}</span>
            <span style={{ fontWeight: 700, color: e.budget && spent > e.budget ? '#ffa94d' : '#63e6be' }}>{e.budget ? money(e.budget - spent, cur) : money(income, cur)}</span>
          </div>
        </div>
        {e.budget ? <Progress pct={(spent / e.budget) * 100} color={spent > e.budget ? '#E8590C' : '#63e6be'} /> : null}
      </section>
      <a className="btn primary" href={href(`add?event=${e.id}&from=${encodeURIComponent(`event?id=${e.id}`)}`)}>
        <Icon name="plus" size={18} stroke={2.2} />
        Add record to this event
      </a>
      {cats.length > 0 && (
        <section className="section">
          <h2 className="h2">By category</h2>
          <div className="card list">
            {cats.map(([cid, amt]) => {
              const c = data.categories.find((x) => x.id === cid);
              return (
                <div key={cid} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <CatTile cat={c} size={36} />
                    <span className="row-main">
                      <span className="row-title">{c?.name ?? 'Other'}</span>
                      <span className="row-sub">{Math.round((amt / spent) * 100)}%</span>
                    </span>
                    <span className="amt">{money(amt, cur)}</span>
                  </div>
                  <Progress pct={(amt / cats[0][1]) * 100} color={c?.color ?? e.color} />
                </div>
              );
            })}
          </div>
        </section>
      )}
      <section className="section">
        <h2 className="h2">Records</h2>
        <div className="card list">
          {sorted.length ? sorted.map((t) => <RecordRow key={t.id} t={t} from={`event?id=${e.id}`} />) : <Empty icon="list" title="Nothing yet" text="Records you add during the event dates are added automatically." />}
        </div>
      </section>
      {editing && <EventSheet event={e} onClose={() => setEditing(false)} />}
    </main>
  );
}

export function EventSheet({ event, onClose }: { event: LedgerEvent | null; onClose: () => void }) {
  const { data, update } = useStore();
  const [name, setName] = useState(event?.name ?? '');
  const [icon, setIcon] = useState<IconName>(event?.icon ?? 'plane');
  const [color, setColor] = useState(event?.color ?? CATEGORY_COLORS[7]);
  const [start, setStart] = useState(event?.start ?? toDateInput(new Date()));
  const [end, setEnd] = useState(event?.end ?? event?.start ?? toDateInput(new Date()));
  const [budget, setBudget] = useState(event?.budget ? String(event.budget) : '');
  const [autoAdd, setAutoAdd] = useState(event?.autoAdd ?? true);
  const [tagPast, setTagPast] = useState(false);
  const [error, setError] = useState('');
  const untagged = data.txns.filter((t) => !t.eventId && t.type === 'expense' && t.date.slice(0, 10) >= start && t.date.slice(0, 10) <= end).length;

  const save = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!name.trim()) return setError('Give the event a name');
    if (end < start) return setError('The end date is before the start date');
    const b = budget ? Number(budget) : undefined;
    if (budget && !(b! > 0)) return setError('Budget must be above zero');
    const e: LedgerEvent = { id: event?.id ?? uid(), name: name.trim(), icon, color, start, end, budget: b, autoAdd, archived: event?.archived };
    update((d) => {
      const events = d.events ?? [];
      let txns = d.txns;
      if (tagPast) {
        // put existing records from these dates into the event (local dates)
        txns = txns.map((t) => {
          if (t.eventId || t.type !== 'expense') return t;
          const day = toDateInput(new Date(t.date));
          return day >= start && day <= end ? { ...t, eventId: e.id } : t;
        });
      }
      return { ...d, txns, events: events.some((x) => x.id === e.id) ? events.map((x) => (x.id === e.id ? e : x)) : [...events, e] };
    });
    toast(event ? 'Event saved' : 'Event created');
    onClose();
  };

  return (
    <Sheet title={event ? 'Edit event' : 'New event'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <IconTile icon={icon} color={color} size={52} />
          <label className="field" style={{ flex: 1 }}>
            <span>Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dubai trip, Ali's wedding" autoFocus={!event} maxLength={40} />
          </label>
        </div>
        <div className="grid2">
          <label className="field">
            <span>Starts</span>
            <input
              className="input"
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (end < e.target.value) setEnd(e.target.value);
              }}
            />
          </label>
          <label className="field">
            <span>Ends</span>
            <input className="input" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Budget (optional)</span>
          <input className="input" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 250000" />
        </label>
        <div className="field">
          <span>Icon</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: 6 }}>
            {EVENT_ICONS.map((ic) => (
              <button key={ic} type="button" aria-label={`Icon ${ic}`} aria-pressed={ic === icon} onClick={() => setIcon(ic)} className={`cat-opt ${ic === icon ? 'on' : ''}`} style={{ padding: 0, height: 42, color: ic === icon ? color : 'var(--muted)', justifyContent: 'center' }}>
                <Icon name={ic} size={20} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Colour</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 }}>
            {CATEGORY_COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={c === color} onClick={() => setColor(c)} style={{ height: 36, borderRadius: 10, border: c === color ? '3px solid var(--ink)' : '3px solid transparent', background: c }} />
            ))}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={autoAdd} onChange={(e) => setAutoAdd(e.target.checked)} />
          Add new records dated during the event automatically
        </label>
        {untagged > 0 && (
          <label className="check">
            <input type="checkbox" checked={tagPast} onChange={(e) => setTagPast(e.target.checked)} />
            Also add the {untagged} existing expense{untagged === 1 ? '' : 's'} from these dates
          </label>
        )}
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn primary block">{event ? 'Save event' : 'Create event'}</button>
        {event && (
          <button
            type="button"
            className="btn secondary block"
            onClick={() => {
              update((d) => ({ ...d, events: (d.events ?? []).map((x) => (x.id === event.id ? { ...x, archived: !x.archived } : x)) }));
              onClose();
            }}
          >
            {event.archived ? 'Reopen event' : 'Close event (move to past)'}
          </button>
        )}
        {event && (
          <button
            type="button"
            className="btn danger block"
            onClick={async () => {
              if (!(await ask(`Delete "${event.name}"? Its records stay, they're just no longer grouped.`))) return;
              update((d) => ({ ...d, events: (d.events ?? []).filter((x) => x.id !== event.id), txns: d.txns.map((t) => (t.eventId === event.id ? { ...t, eventId: undefined } : t)) }));
              onClose();
              location.hash = '#/events';
            }}
          >
            <Icon name="trash" size={18} />
            Delete event
          </button>
        )}
      </form>
    </Sheet>
  );
}

/** Compact list of current events for Home. */
export function EventsHomeCard() {
  const { data, cur } = useStore();
  const today = toDateInput(new Date());
  const current = (data.events ?? []).filter((e) => !e.archived && (e.end ?? e.start) >= today).slice(0, 3);
  if (!current.length) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="h2">Events</h2>
        <a className="link" href={href('events')}>
          See all
        </a>
      </div>
      <div className="card list">
        {current.map((e) => {
          const { spent } = eventTotals(data, e.id);
          return (
            <a key={e.id} className="row" href={href(`event?id=${e.id}`)}>
              <IconTile icon={e.icon} color={e.color} size={38} />
              <span className="row-main">
                <span className="row-title">{e.name}</span>
                <span className="row-sub">{e.budget ? `${money(spent, cur)} of ${money(e.budget, cur)}` : eventDates(e)}</span>
              </span>
              <span className="amt exp">{money(spent, cur)}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
