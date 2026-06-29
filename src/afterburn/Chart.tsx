import { useId } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { useReducedMotion } from '../lib/motion';
import { AnimatedNumber } from '../components/ui';

export interface ChartPoint {
  date: string; // ISO
  value: number;
}

// A small, dependency-free area+line chart: gradient fill, smooth curve, dots,
// gridlines and the latest value highlighted. The line draws on, the area fades
// in and the dots pop in (all disabled under reduced-motion). Styled via CSS
// vars; defaults to the Afterburn ember accent for the progress charts.
export default function Chart({
  points,
  unit = '',
  height = 200,
  accent = 'var(--ember)',
}: {
  points: ChartPoint[];
  unit?: string;
  height?: number;
  accent?: string;
}) {
  const gid = useId();
  const rm = useReducedMotion();
  if (points.length < 2) {
    return (
      <div className="card p-6 text-center text-sm text-ink-subtle">
        Log at least two entries to see your trend.
      </div>
    );
  }

  const W = 320;
  const H = height;
  const padX = 10;
  const padY = 18;
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.value);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = maxY - minY || 1;
  // pad the y-range a touch so the line isn't glued to the edges
  const lo = minY - span * 0.12;
  const hi = maxY + span * 0.12;
  const x = (i: number) => padX + (i / (xs.length - 1)) * (W - padX * 2);
  const y = (v: number) => padY + (1 - (v - lo) / (hi - lo)) * (H - padY * 2);

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const areaPath = `M${x(0)},${H - padY} ${points.map((p, i) => `L${x(i)},${y(p.value)}`).join(' ')} L${x(points.length - 1)},${H - padY} Z`;
  const grid = [0.25, 0.5, 0.75].map((f) => padY + f * (H - padY * 2));

  const first = points[0].value;
  const last = points[points.length - 1].value;
  const delta = Math.round((last - first) * 10) / 10;

  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <div>
          <p className="font-display text-3xl font-bold text-ink">
            <AnimatedNumber value={last} />
            <span className="text-base text-ink-subtle font-normal ml-1">{unit}</span>
          </p>
          <p className="text-xs text-ink-subtle">
            {points.length} entries ·{' '}
            <span className={delta === 0 ? 'text-ink-subtle' : delta > 0 ? 'text-ember' : 'text-[var(--text-muted)]'}>
              {delta > 0 ? '+' : ''}
              {delta} {unit} overall
            </span>
          </p>
        </div>
        <div className="text-right text-[11px] text-ink-subtle">
          <p>high {maxY}{unit}</p>
          <p>low {minY}{unit}</p>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* faint gridlines for depth */}
        {grid.map((gy, i) => (
          <line key={i} x1={padX} y1={gy} x2={W - padX} y2={gy} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 4" />
        ))}

        {/* area fades in */}
        <motion.path
          d={areaPath}
          fill={`url(#fill-${gid})`}
          initial={rm ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.25 }}
        />

        {/* line draws on */}
        <motion.path
          d={linePath}
          fill="none"
          stroke={accent}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={rm ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: [0.21, 1, 0.4, 1] }}
        />

        {/* dots pop in, last one emphasised */}
        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          return (
            <motion.circle
              key={i}
              cx={x(i)}
              cy={y(p.value)}
              r={isLast ? 4 : 2}
              fill={isLast ? accent : 'var(--surface)'}
              stroke={accent}
              strokeWidth="1.5"
              initial={rm ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: rm ? 0 : 0.5 + i * 0.04, type: 'spring', stiffness: 400, damping: 24 }}
              style={{ transformOrigin: `${x(i)}px ${y(p.value)}px` }}
            />
          );
        })}
      </svg>

      <div className="flex justify-between text-[10px] text-ink-subtle mt-1 px-1">
        <span>{format(new Date(points[0].date), 'MMM d')}</span>
        <span>{format(new Date(points[points.length - 1].date), 'MMM d')}</span>
      </div>
    </div>
  );
}
