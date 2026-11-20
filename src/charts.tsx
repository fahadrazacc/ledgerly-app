// Small, dependency-free charts used by the web dashboard.
import { useEffect, useRef, useState } from 'react';
import { money, short } from './utils';

export function useWide(min = 900) {
  const q = `(min-width: ${min}px)`;
  const [wide, setWide] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const f = () => setWide(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [q]);
  return wide;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export interface Slice {
  label: string;
  value: number;
  color: string;
}

export function Donut({ slices, total, label, cur, size = 180 }: { slices: Slice[]; total: number; label: string; cur: string; size?: number }) {
  let acc = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg role="img" aria-label={`${label}: ${money(total, cur)}`} width={size} height={size} viewBox="0 0 160 160" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="80" cy="80" r="62" fill="none" stroke="var(--line)" strokeWidth="18" />
        {slices.map((s, i) => {
          const pct = total ? (s.value / total) * 100 : 0;
          const len = Math.max(0, pct - (slices.length > 1 ? 0.8 : 0));
          const off = -acc;
          acc += pct;
          return <circle key={i} cx="80" cy="80" r="62" fill="none" stroke={s.color} strokeWidth="18" pathLength={100} strokeDasharray={`${len} ${100 - len}`} strokeDashoffset={off} />;
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, textAlign: 'center' }}>
        <span className="muted small" style={{ fontWeight: 600 }}>
          {label}
        </span>
        <span style={{ fontSize: size > 160 ? 18 : 15, fontWeight: 800 }}>{money(total, cur)}</span>
      </div>
    </div>
  );
}

/** Paired bars per period (e.g. income vs expense by month). */
export function PairBars({ data, cur, height = 200 }: { data: { label: string; a: number; b: number }[]; cur: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.a, d.b)));
  const ticks = [1, 0.5, 0];
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div className="muted" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 11, height, textAlign: 'right', minWidth: 34 }}>
        {ticks.map((t) => (
          <span key={t}>{short(max * t)}</span>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          role="img"
          aria-label={data.map((d) => `${d.label}: income ${money(d.a, cur)}, expense ${money(d.b, cur)}`).join('; ')}
          style={{ display: 'grid', gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`, gap: 6, alignItems: 'end', height, borderBottom: '1px solid var(--line)', backgroundImage: 'linear-gradient(var(--line) 1px, transparent 1px)', backgroundSize: `100% ${height / 2}px` }}
        >
          {data.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 4, height: '100%' }} title={`${d.label} — income ${money(d.a, cur)}, expense ${money(d.b, cur)}`}>
              <span style={{ width: '32%', maxWidth: 18, height: `${(d.a / max) * 100}%`, background: 'var(--inc)', borderRadius: '4px 4px 0 0' }} />
              <span style={{ width: '32%', maxWidth: 18, height: `${(d.b / max) * 100}%`, background: '#FF922B', borderRadius: '4px 4px 0 0' }} />
            </div>
          ))}
        </div>
        <div className="muted" style={{ display: 'grid', gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`, gap: 6, fontSize: 11, fontWeight: 600, textAlign: 'center', marginTop: 6 }}>
          {data.map((d, i) => (
            <span key={i}>{d.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Cumulative spending through the month, this month vs last month. */
export function CumulativeLine({ current, previous, days, today, cur, height = 220 }: { current: number[]; previous: number[]; days: number; today: number; cur: string; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const padL = 44;
  const padB = 22;
  const W = w;
  const H = height;
  const max = Math.max(1, ...current, ...previous);
  const x = (i: number) => padL + (i / Math.max(1, days - 1)) * (W - padL - 8);
  const y = (v: number) => 8 + (1 - v / max) * (H - padB - 8);
  const path = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const cur0 = current.slice(0, today);
  const area = cur0.length ? `${path(cur0)} L${x(cur0.length - 1).toFixed(1)},${y(0)} L${x(0)},${y(0)} Z` : '';
  const ticks = [0, 0.5, 1];
  const xt = [1, Math.round(days / 2), days];
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={W} height={H} role="img" aria-label={`Spending so far this month ${money(current[today - 1] ?? 0, cur)}; last month in total ${money(previous[previous.length - 1] ?? 0, cur)}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(max * t)} y2={y(max * t)} stroke="var(--line)" />
            <text x={padL - 6} y={y(max * t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {short(max * t)}
            </text>
          </g>
        ))}
        {xt.map((d) => (
          <text key={d} x={x(d - 1)} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--muted)">
            {d}
          </text>
        ))}
        <path d={path(previous)} fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="5 5" opacity="0.7" />
        {area && <path d={area} fill="var(--accent)" opacity="0.12" />}
        {cur0.length > 0 && <path d={path(cur0)} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
        {cur0.length > 0 && <circle cx={x(cur0.length - 1)} cy={y(cur0[cur0.length - 1])} r="5" fill="var(--accent)" stroke="var(--card)" strokeWidth="2" />}
      </svg>
    </div>
  );
}

/** Horizontal bars with labels and values. */
export function HBars({ rows, cur }: { rows: { label: string; value: number; color: string; sub?: string }[]; cur: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
            <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }} className={r.value < 0 ? 'exp' : ''}>
              {money(r.value, cur)}
            </span>
          </div>
          <div className="progress">
            <div style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: r.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
