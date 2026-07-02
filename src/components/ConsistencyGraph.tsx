import { useEffect, useMemo, useRef, useState } from 'react';
import { format, isToday, startOfDay, subDays } from 'date-fns';
import { Flame, Trophy, CalendarCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { useReducedMotion } from '../lib/motion';
import { AnimatedNumber } from './ui';
import type { ActivityLog } from '../store/useStore';

// The app's one consistency visualization (Dashboard + Stats share it).
// Calendar-honest: columns are real Monday-start weeks, so a Wednesday always
// sits in the Wednesday row — unlike the old chunk-by-7 grids. Ordinal ramp is
// a single ink hue (empty surface → 35% accent → accent), lightness-separated,
// with a labeled legend + tooltip so state is never carried by color alone.
const CELL = 13; // px
const GAP = 3; // px
const STEP = CELL + GAP;

type DayCell = { date: Date; type: 'full' | 'minimum' | null } | null; // null = pad

interface TooltipState {
  x: number;
  y: number;
  text: string;
}

const TYPE_LABEL = { full: 'Full day', minimum: 'Minimum day' } as const;

export function ConsistencyGraph({
  history,
  days = 182,
  streak,
  showStats = true,
}: {
  history: ActivityLog[];
  days?: number;
  streak?: number;
  showStats?: boolean;
}) {
  const rm = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TooltipState | null>(null);

  const { weeks, monthLabels, bestStreak, active30 } = useMemo(() => {
    const today = startOfDay(new Date());
    const logMap = new Map(history.map((l) => [startOfDay(new Date(l.date)).toISOString(), l.type]));
    const start = subDays(today, days - 1);
    const lead = (start.getDay() + 6) % 7; // pad so column rows are Mon…Sun

    const cells: DayCell[] = Array.from({ length: lead }, () => null);
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(today, i);
      cells.push({ date, type: logMap.get(date.toISOString()) ?? null });
    }
    const weeks: DayCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    // A month label on each column that starts a new month.
    const monthLabels = weeks.map((week, i) => {
      const first = week.find(Boolean) as Exclude<DayCell, null> | undefined;
      if (!first) return '';
      const prev = weeks[i - 1]?.find(Boolean) as Exclude<DayCell, null> | undefined;
      return !prev || prev.date.getMonth() !== first.date.getMonth() ? format(first.date, 'MMM') : '';
    });

    // Best streak (any activity) across the visible window + active % last 30d.
    let bestStreak = 0;
    let run = 0;
    for (const c of cells) {
      if (c?.type) {
        run += 1;
        if (run > bestStreak) bestStreak = run;
      } else if (c) run = 0;
    }
    const last30 = cells.filter((c): c is Exclude<DayCell, null> => !!c).slice(-30);
    const active30 = last30.length ? Math.round((last30.filter((c) => c.type).length / last30.length) * 100) : 0;

    return { weeks, monthLabels, bestStreak, active30 };
  }, [history, days]);

  // Land scrolled to the most recent weeks.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks]);

  const showTip = (e: React.MouseEvent<HTMLDivElement>, cell: Exclude<DayCell, null>) => {
    const frame = frameRef.current;
    if (!frame) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    setTip({
      x: r.left - f.left + r.width / 2,
      y: r.top - f.top,
      text: `${format(cell.date, 'EEE, MMM d')} · ${cell.type ? TYPE_LABEL[cell.type] : 'No activity'}`,
    });
  };

  return (
    <div>
      {showStats && (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 mb-4">
          <Stat icon={<Flame className="w-3.5 h-3.5" />} label="Current streak">
            <AnimatedNumber value={streak ?? 0} />
            <span className="text-sm text-ink-subtle font-body"> days</span>
          </Stat>
          <Stat icon={<Trophy className="w-3.5 h-3.5" />} label="Best run">
            <AnimatedNumber value={bestStreak} />
            <span className="text-sm text-ink-subtle font-body"> days</span>
          </Stat>
          <Stat icon={<CalendarCheck className="w-3.5 h-3.5" />} label="Active, last 30d">
            <AnimatedNumber value={active30} />
            <span className="text-sm text-ink-subtle font-body">%</span>
          </Stat>
        </div>
      )}

      <div ref={frameRef} className="relative">
        <div ref={scrollRef} className="overflow-x-auto no-scrollbar">
          <div className="w-max">
            {/* Month labels */}
            <div className="flex text-[10px] text-ink-subtle mb-1.5 pl-8">
              {monthLabels.map((m, i) => (
                <span key={i} className="shrink-0" style={{ width: STEP }}>
                  {m}
                </span>
              ))}
            </div>

            <div className="flex">
              {/* Weekday gutter */}
              <div className="flex flex-col text-[10px] text-ink-subtle pr-2 w-8 shrink-0">
                {['Mon', '', 'Wed', '', 'Fri', '', ''].map((d, i) => (
                  <span key={i} className="flex items-center" style={{ height: STEP }}>
                    {d}
                  </span>
                ))}
              </div>

              {/* Weeks */}
              {weeks.map((week, col) => (
                <div key={col} className="flex flex-col" style={{ gap: GAP, marginRight: GAP }}>
                  {Array.from({ length: 7 }).map((_, row) => {
                    const cell = week[row] ?? null;
                    if (!cell) return <div key={row} style={{ width: CELL, height: CELL }} />;
                    const today = isToday(cell.date);
                    return (
                      <div
                        key={row}
                        onMouseEnter={(e) => showTip(e, cell)}
                        onMouseLeave={() => setTip(null)}
                        onClick={(e) => showTip(e, cell)}
                        className={cn(
                          'rounded-[4px] cursor-default',
                          cell.type === 'full' && 'bg-accent',
                          cell.type === 'minimum' && 'bg-accent/35',
                          !cell.type && 'bg-elevated border border-border/60',
                          today && 'ring-1 ring-accent ring-offset-1 ring-offset-surface',
                          !rm && 'consistency-cell',
                        )}
                        style={{
                          width: CELL,
                          height: CELL,
                          animationDelay: rm ? undefined : `${col * 14 + row * 6}ms`,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tooltip */}
        {tip && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-surface shadow-md"
            style={{ left: tip.x, top: tip.y - 6 }}
          >
            {tip.text}
          </div>
        )}
      </div>

      {/* Legend — labeled, so state never rides on color alone */}
      <div className="flex items-center gap-4 mt-3 text-[11px] text-ink-subtle">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[4px] bg-accent inline-block" /> Full day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[4px] bg-accent/35 inline-block" /> Minimum
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[4px] bg-elevated border border-border/60 inline-block" /> Rest
        </span>
      </div>
    </div>
  );
}

function Stat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
        <span className="text-[var(--accent)]">{icon}</span> {label}
      </p>
      <p className="font-display text-2xl text-ink mt-0.5">{children}</p>
    </div>
  );
}
