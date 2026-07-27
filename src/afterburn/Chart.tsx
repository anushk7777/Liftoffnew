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
  marked,
  markedLabel,
  overlay,
  overlayLabel,
  emptyHint = 'Log at least two entries to see your trend.',
  provisionalLast = false,
  projection,
}: {
  points: ChartPoint[];
  unit?: string;
  height?: number;
  accent?: string;
  format?: (v: number) => string;
  /** Dates to ring on the line — e.g. period days, where weight reads high. */
  marked?: Set<string>;
  markedLabel?: string;
  /** A second, calmer series over the same axis — e.g. a rolling average. */
  overlay?: ChartPoint[];
  overlayLabel?: string;
  emptyHint?: string;
  /** The last point is a partial total that is still being added to — drawn
   *  dashed and hollow so it is never read as a finished value. */
  provisionalLast?: boolean;
  /** Where the last point is heading if the current pace holds. Shown as a
   *  hollow ring above it, so a half-done week can be compared with whole ones
   *  instead of looking like a collapse. */
  projection?: { value: number; label: string };
}) {
  const gid = useId();
  const rm = useReducedMotion();
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(320);
  const pressed = useRef(false);
  const [active, setActive] = useState<number | null>(null);

  const fmt = (v: number) => (fmtValue ? fmtValue(v) : `${Math.round(v * 10) / 10}${unit ? ` ${unit}` : ''}`);

  if (points.length < 2) {
    return (
      <div className="card p-6 text-center text-sm text-ink-subtle">{emptyHint}</div>
    );
  }

  const W = Math.max(width, 200);
  const H = height;
  const padL = 8;
  const padR = 10;
  const padT = 14;
  const padB = 14;
  const n = points.length;
  // The overlay shares the axis, so it has to be in the extent — otherwise a
  // smoothed line could sit outside the plot and get clipped.
  const ys = [
    ...points.map((p) => p.value),
    ...(overlay ?? []).map((p) => p.value),
    ...(projection ? [projection.value] : []),
  ];
  // The high/low readout and the gridline labels describe VALUES ACTUALLY
  // REACHED, so a provisional partial and a projection are excluded — reporting
  // "high 82.7 t" for a figure no week has hit, or "low 31.0 t" for a week
  // three days in, both state something untrue. The plot SCALE still spans
  // everything drawn, or the projection ring would sit outside the chart.
  const settled = provisionalLast && n > 1 ? points.slice(0, n - 1) : points;
  const shown = [...settled.map((p) => p.value), ...(overlay ?? []).map((p) => p.value)];
  const minY = Math.min(...shown);
  const maxY = Math.max(...shown);
  const span = Math.max(...ys) - Math.min(...ys) || 1;
  const lo = Math.min(...ys) - span * 0.12;
  const hi = Math.max(...ys) + span * 0.12;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);

  // With a provisional last point the line is drawn in two pieces: the settled
  // history solid, the final leg dashed. Otherwise a half-logged week reads as
  // a real drop in volume.
  const seg = (from: number, to: number) =>
    points.slice(from, to + 1).map((p, k) => `${k === 0 ? 'M' : 'L'}${x(from + k).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  const solidPath = provisionalLast && n > 1 ? seg(0, n - 2) : seg(0, n - 1);
  const dashedPath = provisionalLast && n > 1 ? seg(n - 2, n - 1) : null;
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
            {/* With a provisional last point the headline is a partial total,
                so the overall delta it implies would be nonsense — the pace
                figure is the honest comparison instead. */}
            {n} entries
            {projection ? (
              <> · <span className="text-ember">{projection.label}</span></>
            ) : (
              <>
                {' · '}
                <span className={delta === 0 ? 'text-ink-subtle' : delta > 0 ? 'text-ember' : 'text-[var(--text-muted)]'}>
                  {delta > 0 ? '+' : ''}{fmt(delta)} overall
                </span>
              </>
            )}
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
          d={solidPath}
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

        {/* the still-being-added-to leg */}
        {dashedPath && (
          <motion.path
            d={dashedPath}
            fill="none"
            stroke={accent}
            strokeWidth="2.5"
            strokeDasharray="5 4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={rm ? false : { opacity: 0 }}
            animate={{ opacity: 0.75 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          />
        )}

        {/* where the last point lands if the current pace holds */}
        {projection && (
          <motion.g
            initial={rm ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.6 }}
          >
            <line
              x1={x(n - 1)}
              y1={y(points[n - 1].value)}
              x2={x(n - 1)}
              y2={y(projection.value)}
              stroke={accent}
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity={0.5}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={x(n - 1)} cy={y(projection.value)} r={4.5} fill="none" stroke={accent} strokeWidth="1.75" strokeDasharray="3 2.5" vectorEffect="non-scaling-stroke" />
          </motion.g>
        )}

        {/* dots fade in */}
        {points.map((p, i) => {
          const isLast = i === n - 1;
          const hollow = isLast && provisionalLast;
          return (
            <motion.circle
              key={i}
              cx={x(i)}
              cy={y(p.value)}
              r={isLast ? 4 : 2.5}
              fill={isLast && !hollow ? accent : 'var(--surface)'}
              stroke={accent}
              strokeWidth="1.5"
              initial={rm ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: rm ? 0 : 0.45 + i * 0.03 }}
            />
          );
        })}

        {/* rolling average: the line to actually read, so it sits under the
            raw series but is drawn calmer and dashed */}
        {overlay && overlay.length > 1 && (
          <motion.path
            d={overlay
              .map((p, i) => {
                const idx = points.findIndex((q) => q.date === p.date);
                const px = idx >= 0 ? x(idx) : x(i);
                return `${i === 0 ? 'M' : 'L'}${px.toFixed(2)},${y(p.value).toFixed(2)}`;
              })
              .join(' ')}
            fill="none"
            stroke="var(--text-subtle)"
            strokeWidth="2"
            strokeDasharray="5 4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={rm ? false : { opacity: 0 }}
            animate={{ opacity: 0.9 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          />
        )}

        {/* flagged days (e.g. on-period) get a hollow ring */}
        {marked &&
          points.map((p, i) =>
            marked.has(p.date) ? (
              <motion.circle
                key={`mk-${i}`}
                cx={x(i)}
                cy={y(p.value)}
                r={6}
                fill="none"
                stroke="var(--cozy)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                initial={rm ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25, delay: rm ? 0 : 0.5 }}
              />
            ) : null,
          )}

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

      {overlay && overlay.length > 1 && overlayLabel && (
        <p className="flex items-center gap-1.5 mt-2 text-[10.5px] text-ink-subtle">
          <span
            className="w-4 h-0 shrink-0 border-t-2 border-dashed"
            style={{ borderColor: 'var(--text-subtle)' }}
          />
          {overlayLabel}
        </p>
      )}

      {marked && markedLabel && points.some((p) => marked.has(p.date)) && (
        <p className="flex items-center gap-1.5 mt-2 text-[10.5px] text-ink-subtle">
          <span
            className="w-2.5 h-2.5 rounded-full border-2 shrink-0"
            style={{ borderColor: 'var(--cozy)' }}
          />
          {markedLabel}
        </p>
      )}
    </div>
  );
}
