import { useId } from 'react';
import { format } from 'date-fns';

export interface ChartPoint {
  date: string; // ISO
  value: number;
}

// A small, dependency-free area+line chart: gradient fill, smooth curve, dots,
// min/max guides and the latest value highlighted. Styled via CSS vars so it
// matches the theme.
export default function Chart({
  points,
  unit = '',
  height = 200,
  accent = 'var(--accent)',
}: {
  points: ChartPoint[];
  unit?: string;
  height?: number;
  accent?: string;
}) {
  const gid = useId();
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

  const linePts = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const areaPts = `${x(0)},${H - padY} ${linePts} ${x(points.length - 1)},${H - padY}`;

  const first = points[0].value;
  const last = points[points.length - 1].value;
  const delta = Math.round((last - first) * 10) / 10;

  return (
    <div>
      <div className="flex items-end justify-between mb-2">
        <div>
          <p className="font-display text-3xl font-bold text-ink">
            {last}
            <span className="text-base text-ink-subtle font-normal ml-1">{unit}</span>
          </p>
          <p className="text-xs text-ink-subtle">
            {points.length} entries ·{' '}
            <span className={delta === 0 ? 'text-ink-subtle' : delta > 0 ? 'text-success' : 'text-[var(--accent)]'}>
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
            <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPts} fill={`url(#fill-${gid})`} />
        <polyline points={linePts} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.value)}
            r={i === points.length - 1 ? 3.5 : 2}
            fill={i === points.length - 1 ? accent : 'var(--surface)'}
            stroke={accent}
            strokeWidth="1.5"
          />
        ))}
      </svg>

      <div className="flex justify-between text-[10px] text-ink-subtle mt-1 px-1">
        <span>{format(new Date(points[0].date), 'MMM d')}</span>
        <span>{format(new Date(points[points.length - 1].date), 'MMM d')}</span>
      </div>
    </div>
  );
}
