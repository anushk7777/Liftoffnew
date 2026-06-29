import { useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { useReducedMotion } from '../lib/motion';
import { useElementWidth } from '../lib/useElementWidth';
import { AnimatedNumber } from '../components/ui';

export interface ChartPoint {
  date: string; // ISO
  value: number;
}

// Responsive area+line chart. Drawn at real pixel width (no aspect-ratio
// stretch) so dots are round and strokes even. Touch/drag anywhere to scrub a
// crosshair + tooltip showing the value & date. The mount animation draws the
// line on once; scrubbing never retriggers it. Styled via theme vars; defaults
// to the Afterburn ember accent.
export default function Chart({
  points,
  unit = '',
  height = 200,
  accent = 'var(--ember)',
  format: fmtValue,
}: {
  points: ChartPoint[];
  unit?: string;
  height?: number;
  accent?: string;
  format?: (v: number) => string;
}) {
  const gid = useId();
  const rm = useReducedMotion();
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(320);
  const pressed = useRef(false);
  const [active, setActive] = useState<number | null>(null);

  const fmt = (v: number) => (fmtValue ? fmtValue(v) : `${Math.round(v * 10) / 10}${unit ? ` ${unit}` : ''}`);

  if (points.length < 2) {
    return (
      <div className="card p-6 text-center text-sm text-ink-subtle">
        Log at least two entries to see your trend.
      </div>
    );
  }

  const W = Math.max(width, 200);
  const H = height;
  const padL = 8;
  const padR = 10;
  const padT = 14;
  const padB = 14;
  const n = points.length;
  const ys = points.map((p) => p.value);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = maxY - minY || 1;
  const lo = minY - span * 0.12;
  const hi = maxY + span * 0.12;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  const areaPath = `M${x(0).toFixed(2)},${(H - padB).toFixed(2)} ${points.map((p, i) => `L${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ')} L${x(n - 1).toFixed(2)},${(H - padB).toFixed(2)} Z`;
  const ticks = [maxY, (maxY + minY) / 2, minY];

  const first = points[0].value;
  const last = points[n - 1].value;
  const delta = Math.round((last - first) * 10) / 10;

  const locate = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rel = (clientX - rect.left - padL) / Math.max(1, W - padL - padR);
    const idx = Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
    setActive(idx);
  };

  const ap = active != null ? points[active] : null;
  // Tooltip x clamped within the chart so it never runs off-screen.
  const tipW = 116;
  const tipLeft = ap ? Math.max(4, Math.min(W - tipW - 4, x(active!) - tipW / 2)) : 0;

  return (
    <div ref={wrapRef} className="relative select-none" style={{ touchAction: 'none' }}>
      <div className="flex items-end justify-between mb-2">
        <div>
          <p className="font-display text-3xl font-bold text-ink leading-none">
            {fmtValue ? fmtValue(last) : (<><AnimatedNumber value={last} /><span className="text-base text-ink-subtle font-normal ml-1">{unit}</span></>)}
          </p>
          <p className="text-xs text-ink-subtle mt-1">
            {n} entries ·{' '}
            <span className={delta === 0 ? 'text-ink-subtle' : delta > 0 ? 'text-ember' : 'text-[var(--text-muted)]'}>
              {delta > 0 ? '+' : ''}{fmt(delta)} overall
            </span>
          </p>
        </div>
        <div className="text-right text-[11px] text-ink-subtle">
          <p>high {fmt(maxY)}</p>
          <p>low {fmt(minY)}</p>
        </div>
      </div>

      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', touchAction: 'none' }}
        onPointerDown={(e) => { pressed.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); locate(e.clientX); }}
        onPointerMove={(e) => { if (pressed.current) locate(e.clientX); }}
        onPointerUp={() => { pressed.current = false; }}
        onPointerCancel={() => { pressed.current = false; }}
      >
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.3" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* y gridlines + value labels */}
        {ticks.map((tv, i) => {
          const gy = y(tv);
          return (
            <g key={i}>
              <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 5" opacity={0.7} />
              <text x={padL + 2} y={gy - 3} fontSize="9" fill="var(--text-subtle)">{fmt(tv)}</text>
            </g>
          );
        })}

        {/* area */}
        <motion.path
          d={areaPath}
          fill={`url(#fill-${gid})`}
          initial={rm ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        />

        {/* line draws on once */}
        <motion.path
          d={linePath}
          fill="none"
          stroke={accent}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          initial={rm ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.7, ease: [0.21, 1, 0.4, 1] }}
        />

        {/* dots fade in */}
        {points.map((p, i) => (
          <motion.circle
            key={i}
            cx={x(i)}
            cy={y(p.value)}
            r={i === n - 1 ? 4 : 2.5}
            fill={i === n - 1 ? accent : 'var(--surface)'}
            stroke={accent}
            strokeWidth="1.5"
            initial={rm ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, delay: rm ? 0 : 0.45 + i * 0.03 }}
          />
        ))}

        {/* crosshair + active dot while scrubbing */}
        {ap && (
          <g>
            <line x1={x(active!)} y1={padT} x2={x(active!)} y2={H - padB} stroke={accent} strokeWidth="1" strokeDasharray="3 3" opacity={0.6} />
            <circle cx={x(active!)} cy={y(ap.value)} r={6} fill={accent} stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
      </svg>

      {/* tooltip */}
      {ap && (
        <div
          className="absolute z-10 pointer-events-none rounded-lg border border-ember bg-[var(--surface)] px-2.5 py-1.5 shadow-md"
          style={{ left: tipLeft, top: 26, width: tipW }}
        >
          <p className="font-display text-sm font-bold text-ink leading-none">{fmt(ap.value)}</p>
          <p className="text-[10px] text-ink-subtle mt-0.5">{format(new Date(ap.date), 'EEE, MMM d')}</p>
        </div>
      )}

      <div className="flex justify-between text-[10px] text-ink-subtle mt-1 px-1">
        <span>{format(new Date(points[0].date), 'MMM d')}</span>
        <span>{format(new Date(points[n - 1].date), 'MMM d')}</span>
      </div>
    </div>
  );
}
