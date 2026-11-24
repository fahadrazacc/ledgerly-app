import { useState } from 'react';
import { href } from '../router';
import { ask } from '../confirm';
import { Icon, type IconName } from '../icons';
import { useStore } from '../store';
import { BackLink, CatTile, Empty, Header, Segmented, Sheet } from '../ui';
import type { Category } from '../types';
import { uid } from '../utils';

export const CATEGORY_ICONS: IconName[] = [
  'food', 'coffee', 'bag', 'shirt', 'car', 'plane', 'bolt', 'wifi', 'droplet', 'phoneDevice', 'house', 'heart',
  'dumbbell', 'film', 'book', 'users', 'baby', 'paw', 'gift', 'church', 'card', 'percent', 'tag', 'briefcase',
  'store', 'laptop', 'trend', 'savings', 'bank', 'cash',
];
export const CATEGORY_COLORS = ['#E67700', '#C2410C', '#D6336C', '#AE3EC9', '#7048E8', '#3B5BDB', '#1971C2', '#0C8599', '#0CA678', '#087F5B', '#5C940D', '#495057'];

export function Categories() {
  const { data, update } = useStore();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [reorder, setReorder] = useState(false);
  const list = data.categories.filter((c) => c.type === type);
  const active = list.filter((c) => !c.archived);
  const hidden = list.filter((c) => c.archived);
  const counts = new Map<string, number>();
  data.txns.forEach((t) => t.categoryId && counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1));

  // Swap with the next visible category of the same type; this order is used when adding records.
  const move = (c: Category, dir: -1 | 1) =>
    update((d) => {
      const all = [...d.categories];
      const peers = all.filter((x) => x.type === c.type && !x.archived);
      const other = peers[peers.findIndex((x) => x.id === c.id) + dir];
      if (!other) return d;
      const ia = all.findIndex((x) => x.id === c.id);
      const ib = all.findIndex((x) => x.id === other.id);
      [all[ia], all[ib]] = [all[ib], all[ia]];
      return { ...d, categories: all };
    });

  const reorderRow = (c: Category, i: number) => (
    <div key={c.id} className="acc-row">
      <div className="row">
        <CatTile cat={c} />
        <span className="row-main">
          <span className="row-title">{c.name}</span>
        </span>
      </div>
      <button className="btn-icon" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(c, -1)} style={i === 0 ? { opacity: 0.35 } : undefined}>
        <Icon name="chevD" size={20} stroke={2.2} />
      </button>
      <button className="btn-icon" aria-label={`Move ${c.name} down`} disabled={i === active.length - 1} onClick={() => move(c, 1)} style={i === active.length - 1 ? { opacity: 0.35 } : undefined}>
        <Icon name="chevD" size={20} stroke={2.2} />
      </button>
    </div>
  );

  const row = (c: Category) => (
    <a key={c.id} className="row" href={href(`category?id=${c.id}&back=categories`)}>
      <CatTile cat={c} />
      <span className="row-main">
        <span className="row-title">{c.name}</span>
        <span className="row-sub">{counts.get(c.id) ? `${counts.get(c.id)} records` : 'No records yet'}</span>
      </span>
      <Icon name="chevR" size={18} />
    </a>
  );

  return (
    <main className="screen narrow">
      <Header
        title="Categories"
        left={<BackLink to="settings" />}
        right={
          <button className="btn-icon solid" aria-label="Add category" onClick={() => setEditing('new')}>
            <Icon name="plus" stroke={2.2} />
          </button>
        }
      />
      <Segmented<'expense' | 'income'>
        label="Category type"
        value={type}
        onChange={setType}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
      />
      <div className="section-head">
        <p className="muted small" style={{ margin: 0 }}>
          {reorder ? 'Use the arrows to set the order. It’s the order you’ll see when adding a record.' : 'Tap a category to see its records.'}
        </p>
        {active.length > 1 && (
          <button className="link" onClick={() => setReorder((r) => !r)} aria-pressed={reorder}>
            {reorder ? 'Done' : 'Reorder'}
          </button>
        )}
      </div>
      <div className="card list">{active.length ? (reorder ? active.map(reorderRow) : active.map(row)) : <Empty icon="tag" title="No categories" text="Tap + to add one." />}</div>
      {hidden.length > 0 && !reorder && (
        <section className="section">
          <h2 className="h2">Hidden</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Hidden categories keep their old records but don't show when adding new ones.
          </p>
          <div className="card list" style={{ opacity: 0.7 }}>
            {hidden.map(row)}
          </div>
        </section>
      )}
      {editing && (
        <CategorySheet
          category={editing === 'new' ? null : editing}
          type={type}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
          onDelete={(id) => {
            update((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id), budgets: d.budgets.filter((b) => b.categoryId !== id) }));
            setEditing(null);
          }}
        />
      )}
    </main>
  );
}

export function CategorySheet(props: { category: Category | null; type: 'expense' | 'income'; onClose: () => void; onSaved: (c: Category) => void; onDelete?: (id: string) => void }) {
  const { data, update } = useStore();
  const c = props.category;
  const [name, setName] = useState(c?.name ?? '');
  const [icon, setIcon] = useState<IconName>(c?.icon ?? 'tag');
  const [color, setColor] = useState(c?.color ?? CATEGORY_COLORS[5]);
  const [error, setError] = useState('');
  const type = c?.type ?? props.type;
  const used = c ? data.txns.some((t) => t.categoryId === c.id) : false;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError('Give it a name');
    if (data.categories.some((x) => x.id !== c?.id && x.type === type && x.name.toLowerCase() === n.toLowerCase())) return setError('You already have a category with that name');
    const cat: Category = { id: c?.id ?? uid(), name: n, type, icon, color, archived: c?.archived };
    update((d) => ({ ...d, categories: c ? d.categories.map((x) => (x.id === cat.id ? cat : x)) : [...d.categories, cat] }));
    props.onSaved(cat);
  };

  const setArchived = (archived: boolean) => {
    if (!c) return;
    update((d) => ({ ...d, categories: d.categories.map((x) => (x.id === c.id ? { ...x, archived } : x)) }));
    props.onClose();
  };

  return (
    <Sheet title={c ? 'Edit category' : `New ${type} category`} onClose={props.onClose}>
      <form className="form" onSubmit={save}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CatTile cat={{ id: '', name, type, icon, color }} size={52} />
          <label className="field" style={{ flex: 1 }}>
            <span>Name</span>
            <input className="input" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="e.g. Groceries" autoFocus={!c} maxLength={30} />
          </label>
        </div>
        <div className="field">
          <span>Colour</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 }}>
            {CATEGORY_COLORS.map((col) => (
              <button
                key={col}
                type="button"
                aria-label={`Colour ${col}`}
                aria-pressed={col === color}
                onClick={() => setColor(col)}
                style={{ height: 44, borderRadius: 12, border: col === color ? '3px solid var(--ink)' : '3px solid transparent', background: col, boxShadow: col === color ? 'inset 0 0 0 2px #fff' : undefined }}
              />
            ))}
          </div>
        </div>
        <div className="field">
          <span>Icon</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 }}>
            {CATEGORY_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                aria-label={`Icon ${ic}`}
                aria-pressed={ic === icon}
                onClick={() => setIcon(ic)}
                className={`cat-opt ${ic === icon ? 'on' : ''}`}
                style={{ padding: 0, height: 48, color: ic === icon ? color : 'var(--muted)', justifyContent: 'center' }}
              >
                <Icon name={ic} size={22} />
              </button>
            ))}
          </div>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn primary block">Save category</button>
        {c && !c.archived && (
          <button type="button" className="btn secondary block" onClick={() => setArchived(true)}>
            Hide category
          </button>
        )}
        {c && c.archived && (
          <button type="button" className="btn secondary block" onClick={() => setArchived(false)}>
            Show category again
          </button>
        )}
        {c && !used && props.onDelete && (
          <button type="button" className="btn danger block" onClick={async () => (await ask(`Delete "${c.name}"?`, { verify: true })) && props.onDelete!(c.id)}>
            <Icon name="trash" size={18} />
            Delete category
          </button>
        )}
        {c && used && <p className="muted small" style={{ margin: 0 }}>This category has records, so it can be hidden but not deleted.</p>}
      </form>
    </Sheet>
  );
}
