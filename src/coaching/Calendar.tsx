// A check-in calendar built from scratch — no date library, no UI kit.
//
// It records, it does not prescribe. Nothing is marked in advance and nothing
// is ever "missed": days you logged measurements fill in, weight-only days get
// a small dot, and every other day is simply blank and available.
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Camera, Ruler, Scale } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Metric } from './api';
import {
  WEEKDAYS, dayKey, dayState, indexByDay, monthGrid,
  scheduleLabel, RECOMMENDED_GAP_DAYS, type DayState, type Schedule,
} from './schedule';

const tnum = { fontVariantNumeric: 'tabular-nums' } as const;

const STATE_STYLE: Record<DayState, { ring?: string; fill?: string; dot?: string }> = {
  'measure-done': { fill: 'var(--accent)' },
  'weight-done': { dot: 'var(--text-subtle)' },
  none: {},
};

function DayCell({
  date,
  inMonth,
  state,
  isToday,
  selected,
  onSelect,
}: {
  date: Date;
  inMonth: boolean;
  state: DayState;
  isToday: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const s = STATE_STYLE[state];
  const filled = !!s.fill;
  return (
    <button
      onClick={onSelect}
      className={cn(
        'cal-day relative aspect-square rounded-xl flex items-center justify-center text-[13px] font-medium transition-colors',
        !inMonth && 'opacity-25',
        selected && 'ring-2 ring-offset-2',
      )}
      style={{
        background: filled ? s.fill : selected ? 'var(--hover)' : 'transparent',
        color: filled ? 'var(--accent-text)' : 'var(--text)',
        boxShadow: s.ring ? `inset 0 0 0 1.5px ${s.ring}` : undefined,
        ...(selected
          ? ({ ['--tw-ring-color' as string]: 'var(--accent)', ['--tw-ring-offset-color' as string]: 'var(--surface)' } as React.CSSProperties)
          : {}),
      }}
    >
      <span style={tnum}>{date.getDate()}</span>

      {/* today marker */}
      {isToday && !filled && (
        <span
          className="absolute inset-x-0 -bottom-0.5 mx-auto w-1 h-1 rounded-full"
          style={{ background: 'var(--accent)' }}
        />
      )}
      {/* plain weight-log dot */}
      {s.dot && (
        <span
          className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
          style={{ background: s.dot }}
        />
      )}
    </button>
  );
}

export function CheckinCalendar({
  metrics,
  schedule,
  onPickDay,
}: {
  metrics: Metric[];
  schedule: Schedule;
  onPickDay?: (date: Date) => void;
}) {
  // Stable per mount — the calendar only needs "today" as of first render.
  const [today] = useState(() => new Date());
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);

  const byDay = useMemo(() => indexByDay(metrics), [metrics]);
  const grid = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  const move = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  const selectedMetric = selected ? byDay.get(selected) : undefined;
  const selectedDate = selected ? new Date(`${selected}T12:00:00`) : null;

  return (
    <section
      className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">
          Check-in calendar
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => move(-1)}
            className="p-1.5 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[13px] font-semibold text-[var(--text)] min-w-[110px] text-center">
            {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </span>
          <button
            onClick={() => move(1)}
            className="p-1.5 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <p className="text-[12.5px] text-[var(--text-muted)] mb-4">
        {scheduleLabel(schedule)} · measurements suggested every {RECOMMENDED_GAP_DAYS} days
      </p>

      {/* Weekday header (Monday-first) */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <div
            key={d}
            className="text-center text-[10.5px] font-semibold uppercase tracking-wider py-1 text-[var(--text-subtle)]"
          >
            {WEEKDAYS[d]}
          </div>
        ))}
      </div>

      {/* Grid */}
      <motion.div
        key={`${cursor.getFullYear()}-${cursor.getMonth()}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="grid grid-cols-7 gap-1"
      >
        {grid.map((d) => {
          const key = dayKey(d);
          return (
            <DayCell
              key={key}
              date={d}
              inMonth={d.getMonth() === cursor.getMonth()}
              state={dayState(d, byDay)}
              isToday={key === dayKey(today)}
              selected={key === selected}
              onSelect={() => {
                setSelected(key === selected ? null : key);
                onPickDay?.(d);
              }}
            />
          );
        })}
      </motion.div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 text-[11px] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md" style={{ background: 'var(--accent)' }} /> Measured
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-subtle)' }} /> Weight only
        </span>
      </div>

      {/* Selected day detail */}
      <AnimatePresence>
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[var(--text)]">
                  {selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
                {dayState(selectedDate, byDay) === 'measure-done' && (
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
                  >
                    Measurement day
                  </span>
                )}
              </div>
              {selectedMetric ? (
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5 text-[13px]">
                  {selectedMetric.weight_kg != null && (
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                      <Scale className="w-3.5 h-3.5" />
                      <b className="text-[var(--text)] font-semibold" style={tnum}>{selectedMetric.weight_kg}</b> kg
                    </span>
                  )}
                  {selectedMetric.waist_cm != null && (
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                      <Ruler className="w-3.5 h-3.5" />
                      waist <b className="text-[var(--text)] font-semibold" style={tnum}>{selectedMetric.waist_cm}</b> cm
                    </span>
                  )}
                  {(selectedMetric.photo_front || selectedMetric.photo_side) && (
                    <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                      <Camera className="w-3.5 h-3.5" /> photos
                    </span>
                  )}
                  {selectedMetric.notes && (
                    <span className="w-full text-[var(--text-muted)] italic">"{selectedMetric.notes}"</span>
                  )}
                </div>
              ) : (
                <p className="text-[13px] text-[var(--text-subtle)] mt-2">Nothing logged this day — tap the form above to add it.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/**
 * Coach-side check-in options.
 *
 * The weekday and cadence pickers are gone on purpose. Prescribing a day meant
 * the calendar marked days in advance and flagged the rest as missed, which
 * turned a progress tracker into a chore list. Clients measure when they want;
 * all that is left to decide is whether to ask for a daily weight.
 */
export function ScheduleEditor({
  schedule,
  onSave,
  saving,
}: {
  schedule: Schedule;
  onSave: (s: { measure_weekday: number; measure_cadence: 'weekly' | 'biweekly'; measure_anchor: string | null; daily_weight: boolean }) => void;
  saving: boolean;
}) {
  const [daily, setDaily] = useState(schedule.dailyWeight);
  const dirty = daily !== schedule.dailyWeight;

  return (
    <section
      className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">
        Check-ins
      </span>

      <p className="text-[12.5px] text-[var(--text-muted)] mt-1.5">
        Measurements and photos can be logged on any day. We suggest leaving about{' '}
        {RECOMMENDED_GAP_DAYS} days between them — closer together and normal
        fluctuation hides the actual change.
      </p>

      {/* Daily weight toggle */}
      <button
        onClick={() => setDaily((v) => !v)}
        className="w-full flex items-center justify-between mt-4 p-3 rounded-xl border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors"
      >
        <span className="text-left">
          <span className="block text-[13.5px] font-semibold text-[var(--text)]">Daily weight log</span>
          <span className="block text-[12px] text-[var(--text-muted)]">Ask for weight every day</span>
        </span>
        <span
          className="switch-track relative w-11 h-6 rounded-full transition-colors shrink-0"
          style={{ background: daily ? 'var(--accent)' : 'var(--elevated)' }}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white"
            style={{ left: daily ? 22 : 2 }}
          />
        </span>
      </button>

      <motion.button
        whileHover={{ scale: dirty ? 1.02 : 1 }}
        whileTap={{ scale: dirty ? 0.98 : 1 }}
        disabled={!dirty || saving}
        onClick={() =>
          onSave({
            // Kept so stored rows stay valid; nothing reads them any more.
            measure_weekday: schedule.measureWeekday,
            measure_cadence: schedule.cadence,
            measure_anchor: schedule.anchor,
            daily_weight: daily,
          })
        }
        className="mt-4 w-full py-3 rounded-xl text-[14.5px] font-semibold text-[var(--accent-text)] disabled:opacity-40 transition-opacity"
        style={{ background: 'var(--accent)' }}
      >
        {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
      </motion.button>
    </section>
  );
}
