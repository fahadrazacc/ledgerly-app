import { useEffect, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import type { Account, AccountKind, Category } from './types';
import { href } from './router';
import { tint } from './utils';

export function IconTile({ icon, color, size = 40 }: { icon: IconName; color: string; size?: number }) {
  return (
    <span className="tile" style={{ width: size, height: size, background: tint(color), color }}>
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </span>
  );
}

export function CatTile({ cat, size }: { cat?: Category; size?: number }) {
  return <IconTile icon={cat?.icon ?? 'tag'} color={cat?.color ?? '#868E96'} size={size} />;
}

/** An account's picture: uploaded image, chosen icon/colour, or the default for its type. */
export function AccountTile({ account, size = 40 }: { account?: Account; size?: number }) {
  if (account?.image)
    return <img src={account.image} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: Math.round(size * 0.32), objectFit: 'cover', flexShrink: 0 }} />;
  const kind = account?.kind ?? 'bank';
  return <IconTile icon={account?.icon ?? accountIcon[kind]} color={account?.color ?? accountColor[kind]} size={size} />;
}

export const accountIcon: Record<AccountKind, IconName> = {
  cash: 'cash',
  bank: 'bank',
  wallet: 'wallet',
  card: 'card',
  savings: 'savings',
};
export const accountColor: Record<AccountKind, string> = {
  cash: '#087F5B',
  bank: '#3B5BDB',
  wallet: '#7048E8',
  card: '#C2410C',
  savings: '#0C8599',
};
export const accountKindLabel: Record<AccountKind, string> = {
  cash: 'Cash',
  bank: 'Bank account',
  wallet: 'Mobile wallet',
  card: 'Credit card',
  savings: 'Savings',
};

export function Segmented<T extends string>(props: {
  options: { value: T; label: string; color?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="tablist" aria-label={props.label} style={{ gridTemplateColumns: `repeat(${props.options.length}, minmax(0, 1fr))` }}>
      {props.options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={props.value === o.value}
          className={props.value === o.value ? 'on' : ''}
          style={props.value === o.value && o.color ? { color: o.color } : undefined}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet(props: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = '';
    };
  }, [props]);
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{props.title}</h2>
          <button className="btn-icon" aria-label="Close" onClick={props.onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{props.children}</div>
      </div>
    </div>
  );
}

export function Header(props: { title: ReactNode; left?: ReactNode; right?: ReactNode; big?: boolean }) {
  if (props.big)
    return (
      <header className="head">
        <h1 className="h-big">{props.title}</h1>
        <div className="head-actions">{props.right}</div>
      </header>
    );
  return (
    <header className="head">
      <div className="head-side">{props.left}</div>
      <h1 className="h-small">{props.title}</h1>
      <div className="head-side right">{props.right}</div>
    </header>
  );
}

export function BackLink({ to, label = 'Back' }: { to: string; label?: string }) {
  return (
    <a className="btn-icon" href={href(to)} aria-label={label}>
      <Icon name="chevL" />
    </a>
  );
}

export function Progress({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <strong>{title}</strong>
      <span>{text}</span>
      {action}
    </div>
  );
}

export function Keypad({ onKey, extra }: { onKey: (k: string) => void; extra?: string }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', extra ?? '', '0', 'back'];
  return (
    <div className="keypad">
      {keys.map((k, i) =>
        k === '' ? (
          <span key={i} />
        ) : (
          <button key={i} type="button" onClick={() => onKey(k)} aria-label={k === 'back' ? 'Delete' : k === '.' ? 'Decimal point' : k}>
            {k === 'back' ? <Icon name="backspace" size={24} /> : k}
          </button>
        ),
      )}
    </div>
  );
}
