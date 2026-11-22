import { useStore } from '../store';
import type { Txn } from '../types';
import { CatTile, IconTile } from '../ui';
import { href } from '../router';
import { money } from '../utils';

const dayShort = (iso: string) => {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: '2-digit' }) });
};

export function RecordRow({ t, from }: { t: Txn; from: string; showTime?: boolean }) {
  const { data, cur } = useStore();
  const cat = data.categories.find((c) => c.id === t.categoryId);
  const acc = data.accounts.find((a) => a.id === t.accountId);
  const to = data.accounts.find((a) => a.id === t.toAccountId);
  const ev = t.eventId ? (data.events ?? []).find((e) => e.id === t.eventId) : undefined;
  const isTransfer = t.type === 'transfer';
  const title = t.note || (isTransfer ? 'Transfer' : cat?.name ?? 'Record');
  const sub = isTransfer ? `${acc?.name ?? '?'} → ${to?.name ?? '?'}` : `${cat?.name ?? 'Uncategorised'} · ${acc?.name ?? '?'}`;
  const amount = t.type === 'income' ? t.amount : -t.amount;
  return (
    <a className="row" href={href(`add?id=${t.id}&from=${from}`)}>
      {isTransfer ? <IconTile icon="transfer" color="#3B5BDB" /> : <CatTile cat={cat} />}
      <span className="row-main">
        <span className="row-title">{title}</span>
        <span className="row-sub">
          {sub}
          {ev && (
            <span className="ev-tag" style={{ color: ev.color }}>
              {' · '}
              {ev.name}
            </span>
          )}
        </span>
      </span>
      <span className="row-end">
        <span className={`amt ${isTransfer ? '' : t.type === 'income' ? 'inc' : 'exp'}`}>{isTransfer ? money(t.amount, cur) : money(amount, cur, true)}</span>
        <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
          {dayShort(t.date)}
        </span>
      </span>
    </a>
  );
}
