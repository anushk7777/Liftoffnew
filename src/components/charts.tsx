import { useId } from 'react';
import { useReducedMotion } from '../lib/motion';

// Tiny, dependency-free charts (replace recharts). Pure inline SVG — they scale
// to the container, respect the theme via currentColor/CSS vars, and add almost
// nothing to the bundle. Entrances are CSS keyframes gated on reduce-motion.

// Smooth area sparkline for a single series.
export function Sparkline({
  data,
  height = 160,
  className,
}: {
  data: number[];
  height?: number;
  className?: string;
}) {
  const id = useId();
  const rm = useReducedMotion();
  const w = 100;
  const h = 100;
  const max = Math.max(1, ...data);
  const min = Math.min(0, ...data);
  const range = max - min || 1;
  const n = data.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * w);
  const y = (v: number) => h - ((v - min) / range) * h;

  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={className}
      style={{ width: '100%', height, display: 'block' }}
    >
      <defs>
        <linearGradient id={`sl-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sl-${id})`} className={rm ? undefined : 'chart-area-in'} />
      <path
        d={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        className={rm ? undefined : 'chart-line-draw'}
      />
    </svg>
  );
}

// Minimal bar chart with optional labels under each bar.
export function MiniBars({
  data,
  height = 160,
  labelEvery = 2,
}: {
  data: { label: string; value: number }[];
  height?: number;
  labelEvery?: number;
}) {
  const rm = useReducedMotion();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex flex-col" style={{ height }}>
      <div className="flex-1 flex items-end gap-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end" title={`${d.label}: ${d.value}`}>
            <div
              className={`rounded-t-md bg-accent/85 hover:bg-accent transition-colors origin-bottom ${rm ? '' : 'chart-bar-grow'}`}
              style={{ height: `${Math.max(2, (d.value / max) * 100)}%`, animationDelay: rm ? undefined : `${i * 35}ms` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center text-[9px] text-ink-subtle truncate">
            {i % labelEvery === 0 ? d.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
