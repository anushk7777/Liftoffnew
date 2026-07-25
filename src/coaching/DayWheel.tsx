// A horizontal day picker for "which day am I logging?".
//
// Picking a past day used to mean scrolling down to the month calendar, tapping
// a cell, then scrolling back up to the form — so if you missed a day you had
// to go looking for the control, and it was easy to type a weight against the
// wrong date without noticing. This sits directly above the fields: the day is
// always in view, and changing it is one swipe.
//
// A snapping strip rather than an actual rotating wheel — snap points give the
// same "click into place" feel, but it stays a plain scroll container, so
// native momentum, keyboard and screen readers all keep working.
import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const key = (d: Date) =>
  `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;

export function DayWheel({
  value,
  onChange,
  logged,
  days = 45,
}: {
  /** yyyy-mm-dd currently being logged. */
  value: string;
  onChange: (day: string) => void;
  /** Days that already have an entry, marked with a dot. */
  logged?: Set<string>;
  /** How far back the strip runs. */
  days?: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Oldest first, ending today: the strip reads left-to-right like a timeline,
  // and the newest day sits where the eye lands after it scrolls to the end.
  const dates = useMemo(() => {
    const today = new Date();
    const out: Date[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      out.push(d);
    }
    return out;
  }, [days]);

  const todayKey = key(new Date());

  // Keep the chosen day in view — on open (scrolled to today) and whenever the
  // day changes from elsewhere, e.g. tapping a date in the calendar below.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [value]);

  const selected = dates.find((d) => key(d) === value) ?? dates[dates.length - 1];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12.5px] font-semibold text-[var(--text)]">
          {selected.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        {value !== todayKey && (
          <button
            type="button"
            onClick={() => onChange(todayKey)}
            className="text-[12px] font-semibold transition-colors"
            style={{ color: 'var(--accent)' }}
          >
            Jump to today
          </button>
        )}
      </div>

      {/* Only the left edge fades. The strip ends at today, so there is nothing
          to the right to hint at — a fade there would just dim the selected
          pill, which is exactly where the eye goes. */}
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-6 z-10"
          style={{ background: 'linear-gradient(90deg, var(--surface), transparent)' }}
        />

        <div
          ref={scroller}
          className="flex gap-1.5 overflow-x-auto no-scrollbar py-1"
          style={{ scrollSnapType: 'x mandatory', scrollPaddingInline: '50%' }}
        >
          {dates.map((d) => {
            const k = key(d);
            const isSel = k === value;
            const isToday = k === todayKey;
            const has = logged?.has(k);
            return (
              <button
                key={k}
                type="button"
                ref={isSel ? selectedRef : undefined}
                onClick={() => onChange(k)}
                aria-pressed={isSel}
                aria-label={d.toLocaleDateString(undefined, {
                  weekday: 'long', month: 'long', day: 'numeric',
                })}
                className={cn(
                  'relative shrink-0 w-[46px] rounded-xl py-2 flex flex-col items-center gap-0.5',
                  'transition-[color,transform] active:scale-95',
                )}
                style={{ scrollSnapAlign: 'center' }}
              >
                {isSel && (
                  <motion.span
                    layoutId="daywheel-pill"
                    transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                    className="absolute inset-0 rounded-xl"
                    style={{ background: 'var(--accent)' }}
                  />
                )}
                <span
                  className="relative text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: isSel ? 'var(--accent-text)' : 'var(--text-subtle)' }}
                >
                  {WEEKDAY[d.getDay()]}
                </span>
                <span
                  className="relative text-[15px] font-bold leading-none"
                  style={{
                    color: isSel
                      ? 'var(--accent-text)'
                      : isToday
                        ? 'var(--accent)'
                        : 'var(--text)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {d.getDate()}
                </span>
                {/* A logged day carries a dot, so gaps are obvious at a glance. */}
                <span
                  className="relative w-1 h-1 rounded-full"
                  style={{
                    background: has
                      ? isSel
                        ? 'var(--accent-text)'
                        : 'var(--accent)'
                      : 'transparent',
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
