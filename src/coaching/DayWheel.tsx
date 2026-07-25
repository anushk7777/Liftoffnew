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
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { monthGrid, WEEKDAYS } from './schedule';

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

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
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12.5px] font-semibold text-[var(--text)]">
          {selected.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <span className="flex items-center gap-2">
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
          {/* Escape hatch to a whole month at once — the strip is quick for the
              last week or two, but scrolling back weeks is not. */}
          <button
            type="button"
            onClick={() => {
              setPickerMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
              setPickerOpen(true);
            }}
            aria-label="Pick a day from the calendar"
            title="Pick a day from the calendar"
            className="p-1.5 -mr-1 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
          >
            <CalendarDays className="w-[17px] h-[17px]" />
          </button>
        </span>
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

      {/* Full month, for jumping further back than a swipe comfortably reaches. */}
      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
            onClick={() => setPickerOpen(false)}
          >
            <motion.div
              initial={{ y: 28, scale: 0.97, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 16, scale: 0.98, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-2xl border border-[var(--border)] p-4"
              style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() =>
                    setPickerMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                  }
                  className="p-1.5 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[13px] font-semibold text-[var(--text)]">
                  {pickerMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPickerMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                  }
                  className="p-1.5 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <div
                    key={d}
                    className="text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]"
                  >
                    {WEEKDAYS[d]}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {monthGrid(pickerMonth.getFullYear(), pickerMonth.getMonth()).map((d) => {
                  const k = key(d);
                  const inMonth = d.getMonth() === pickerMonth.getMonth();
                  // A weigh-in cannot be logged before it happens.
                  const future = k > todayKey;
                  const isSel = k === value;
                  const has = logged?.has(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={future}
                      onClick={() => {
                        onChange(k);
                        setPickerOpen(false);
                      }}
                      className={cn(
                        'relative aspect-square rounded-lg text-[13px] font-medium transition-colors',
                        !inMonth && 'opacity-30',
                        future ? 'opacity-20 cursor-default' : 'hover:bg-[var(--hover)]',
                      )}
                      style={{
                        background: isSel ? 'var(--accent)' : undefined,
                        color: isSel ? 'var(--accent-text)' : 'var(--text)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {d.getDate()}
                      {has && !isSel && (
                        <span
                          className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                          style={{ background: 'var(--accent)' }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors sm:hidden"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
