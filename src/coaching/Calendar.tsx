// A check-in calendar built from scratch — no date library, no UI kit.
// Month grid with per-day state rings: scheduled measurement days get an accent
// ring, completed days fill in, missed days show a hollow warning ring, and
// plain weight logs get a small dot.
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Camera, Ruler, Scale } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Metric } from './api';
import {
  WEEKDAYS, dayKey, dayState, indexByDay, isMeasureDay, monthGrid,
  nextMeasureDay, scheduleLabel, type DayState, type Schedule,
} from './schedule';

const tnum = { fontVariantNumeric: 'tabular-nums' } as const;

const STATE_STYLE: Record<DayState, { ring?: string; fill?: string; dot?: string }> = {
  'measure-done': { fill: 'var(--accent)' },
  'measure-due': { ring: 'var(--accent)' },
  'measure-missed': { ring: 'var(--warning)' },
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
        'relative aspect-square rounded-xl flex items-center justify-center text-[13px] font-medium transition-colors',
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
  const next = useMemo(() => nextMeasureDay(today, schedule), [schedule, today]);

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
        {scheduleLabel(schedule)} · next{' '}
        <b className="text-[var(--text)] font-semibold">
          {dayKey(next) === dayKey(today)
            ? 'today'
            : next.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
        </b>
      </p>

      {/* Weekday header (Monday-first) */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <div
            key={d}
            className={cn(
              'text-center text-[10.5px] font-semibold uppercase tracking-wider py-1',
              d === schedule.measureWeekday ? 'text-[var(--accent)]' : 'text-[var(--text-subtle)]',
            )}
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
              state={dayState(d, schedule, byDay)}
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
          <span className="w-3 h-3 rounded-md" style={{ background: 'var(--accent)' }} /> Logged
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md" style={{ boxShadow: 'inset 0 0 0 1.5px var(--accent)' }} /> Due
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md" style={{ boxShadow: 'inset 0 0 0 1.5px var(--warning)' }} /> Missed
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
                {isMeasureDay(selectedDate, schedule) && (
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
                <p className="text-[13px] text-[var(--text-subtle)] mt-2">Nothing logged this day.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Coach-side control for when a client's measurement check-ins land. */
export function ScheduleEditor({
  schedule,
  onSave,
  saving,
}: {
  schedule: Schedule;
  onSave: (s: { measure_weekday: number; measure_cadence: 'weekly' | 'biweekly'; measure_anchor: string | null; daily_weight: boolean }) => void;
  saving: boolean;
}) {
  const [weekday, setWeekday] = useState(schedule.measureWeekday);
  const [cadence, setCadence] = useState<'weekly' | 'biweekly'>(schedule.cadence);
  const [daily, setDaily] = useState(schedule.dailyWeight);

  const dirty =
    weekday !== schedule.measureWeekday || cadence !== schedule.cadence || daily !== schedule.dailyWeight;

  return (
    <section
      className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">
        Check-in schedule
      </span>

      <p className="text-[12.5px] text-[var(--text-muted)] mt-1.5">
        Measurements and photos are asked for on these days only. Reminders follow this schedule.
      </p>

      {/* Weekday picker */}
      <div className="flex gap-1.5 mt-4">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <button
            key={d}
            onClick={() => setWeekday(d)}
            className={cn(
              'flex-1 py-2 rounded-lg text-[12px] font-semibold transition-colors',
              weekday === d ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]',
            )}
            style={weekday === d ? { background: 'var(--accent)' } : { background: 'var(--elevated)' }}
          >
            {WEEKDAYS[d]}
          </button>
        ))}
      </div>

      {/* Cadence */}
      <div className="flex gap-2 mt-3">
        {(['weekly', 'biweekly'] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCadence(c)}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-[13px] font-semibold border transition-colors',
              cadence === c ? 'text-[var(--accent-text)] border-transparent' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]',
            )}
            style={cadence === c ? { background: 'var(--accent)' } : undefined}
          >
            {c === 'weekly' ? 'Every week' : 'Every other week'}
          </button>
        ))}
      </div>

      {/* Daily weight toggle */}
      <button
        onClick={() => setDaily((v) => !v)}
        className="w-full flex items-center justify-between mt-3 p-3 rounded-xl border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors"
      >
        <span className="text-left">
          <span className="block text-[13.5px] font-semibold text-[var(--text)]">Daily weight log</span>
          <span className="block text-[12px] text-[var(--text-muted)]">Ask for weight every day</span>
        </span>
        <span
          className="relative w-11 h-6 rounded-full transition-colors shrink-0"
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
            measure_weekday: weekday,
            measure_cadence: cadence,
            // Anchor biweekly cycles to the next occurrence of the chosen day.
            measure_anchor: cadence === 'biweekly'
              ? dayKey(nextMeasureDay(new Date(), { measureWeekday: weekday, cadence: 'weekly', anchor: null, dailyWeight: daily }))
              : null,
            daily_weight: daily,
          })
        }
        className="mt-4 w-full py-3 rounded-xl text-[14.5px] font-semibold text-[var(--accent-text)] disabled:opacity-40 transition-opacity"
        style={{ background: 'var(--accent)' }}
      >
        {saving ? 'Saving…' : dirty ? 'Save schedule' : 'Schedule saved'}
      </motion.button>
    </section>
  );
}
