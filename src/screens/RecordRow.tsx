import { useStore } from '../store';
import type { Txn } from '../types';
import { CatTile, IconTile } from '../ui';
import { href } from '../router';
import { money, timeLabel } from '../utils';

export function RecordRow({ t, from, showTime = true }: { t: Txn; from: string; showTime?: boolean }) {
  const { data, cur } = useStore();
  const cat = data.categories.find((c) => c.id === t.categoryId);
  const acc = data.accounts.find((a) => a.id === t.accountId);
  const to = data.accounts.find((a) => a.id === t.toAccountId);
  const isTransfer = t.type === 'transfer';
  const title = t.note || (isTransfer ? 'Transfer' : cat?.name ?? 'Record');
  const sub = isTransfer ? `${acc?.name ?? '?'} → ${to?.name ?? '?'}` : `${cat?.name ?? 'Uncategorised'} · ${acc?.name ?? '?'}`;
  const amount = t.type === 'income' ? t.amount : -t.amount;
  return (
    <a className="row" href={href(`add?id=${t.id}&from=${from}`)}>
      {isTransfer ? <IconTile icon="transfer" color="#3B5BDB" /> : <CatTile cat={cat} />}
      <span className="row-main">
        <span className="row-title">{title}</span>
        <span className="row-sub">{sub}</span>
      </span>
      <span className="row-end">
        <span className={`amt ${isTransfer ? '' : t.type === 'income' ? 'inc' : 'exp'}`}>
          {isTransfer ? money(t.amount, cur) : money(amount, cur, true)}
        </span>
        {showTime && <span className="muted" style={{ fontSize: 11 }}>{timeLabel(t.date)}</span>}
      </span>
    </a>
  );
}
