import { useMemo, useState } from 'react';
import {
  format, isValid, isSameDay, isSameMonth, isToday,
  startOfMonth, endOfMonth, startOfWeek, addDays, addMonths, addMinutes,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Clock, Minus, Plus, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface DateTimePickerProps {
  value: string; // "yyyy-MM-ddTHH:mm:ss" local, or "" for none
  onChange: (val: string) => void;
  className?: string;
}

const QUICK_TIMES = [
  { label: '9:00 AM', h: 9, m: 0 },
  { label: '12:00 PM', h: 12, m: 0 },
  { label: '3:00 PM', h: 15, m: 0 },
  { label: '6:00 PM', h: 18, m: 0 },
  { label: '9:00 PM', h: 21, m: 0 },
];

/** Fully custom date + time picker — no native inputs, so it looks like the
 *  app (both themes) instead of the operating system. Emits the same local
 *  "yyyy-MM-ddTHH:mm:ss" strings the old picker did; a date with no time is
 *  encoded as T00:00:00 (TaskForm treats that as date-only). */
export function DateTimePicker({ value, onChange, className }: DateTimePickerProps) {
  const parsed = value ? new Date(value) : null;
  const selected = parsed && isValid(parsed) ? parsed : null;
  // "Has a time" means anything other than the midnight sentinel.
  const hasTime = !!selected && !(selected.getHours() === 0 && selected.getMinutes() === 0);
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(selected ?? new Date()));

  const weeks = useMemo(() => {
    const first = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const last = endOfMonth(viewMonth);
    const days: Date[] = [];
    for (let d = first; days.length < 42; d = addDays(d, 1)) {
      days.push(d);
      if (d >= last && d.getDay() === 0) break; // stop after the week containing month-end
    }
    return days;
  }, [viewMonth]);

  const emit = (d: Date, withTime: boolean) =>
    onChange(`${format(d, 'yyyy-MM-dd')}T${withTime ? format(d, 'HH:mm') : '00:00'}:00`);

  const pickDay = (day: Date) => {
    const next = new Date(day);
    if (selected && hasTime) next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    emit(next, !!selected && hasTime);
  };

  const setTime = (h: number, m: number) => {
    const base = selected ?? new Date();
    const next = new Date(base);
    next.setHours(h, m, 0, 0);
    emit(next, true);
  };

  const nudgeTime = (mins: number) => {
    if (!selected || !hasTime) return;
    emit(addMinutes(selected, mins), true);
  };

  const clearTime = () => {
    if (!selected) return;
    emit(selected, false);
  };

  return (
    <div className={cn('rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3', className)} style={{ boxShadow: 'var(--shadow-sm)' }}>
      {/* Month header */}
      <div className="flex items-center justify-between px-1 pb-2">
        <button type="button" onClick={() => setViewMonth((m) => addMonths(m, -1))} aria-label="Previous month"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--hover)]">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-[var(--text)]">{format(viewMonth, 'MMMM yyyy')}</span>
        <button type="button" onClick={() => setViewMonth((m) => addMonths(m, 1))} aria-label="Next month"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--hover)]">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday row + day grid */}
      <div className="grid grid-cols-7 text-center">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-[10px] font-semibold text-[var(--text-subtle)] pb-1">{d}</span>
        ))}
        {weeks.map((day) => {
          const inMonth = isSameMonth(day, viewMonth);
          const sel = !!selected && isSameDay(day, selected);
          const today = isToday(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => pickDay(day)}
              className={cn(
                'h-9 m-0.5 rounded-full text-[13px] font-medium transition-colors',
                sel ? 'text-[var(--accent-text)]' : today ? 'font-bold' : inMonth ? 'text-[var(--text)] hover:bg-[var(--hover)]' : 'text-[var(--text-subtle)] hover:bg-[var(--hover)]',
              )}
              style={{
                background: sel ? 'var(--accent)' : undefined,
                color: !sel && today ? 'var(--cozy)' : undefined,
              }}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>

      {/* Time — only offered once a day is picked */}
      {selected && (
        <div className="mt-2 pt-3 border-t border-[var(--border)]">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
            <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">Time</span>
            {hasTime && (
              <button type="button" onClick={clearTime}
                className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--danger)]">
                <X className="w-3 h-3" /> No time
              </button>
            )}
          </div>

          {hasTime ? (
            <div className="flex items-center justify-center gap-3">
              <button type="button" onClick={() => nudgeTime(-30)} aria-label="30 minutes earlier"
                className="w-9 h-9 rounded-xl border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--hover)] active:scale-95 transition-transform">
                <Minus className="w-4 h-4" />
              </button>
              <span className="min-w-[104px] text-center text-lg font-bold text-[var(--text)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {format(selected, 'h:mm a')}
              </span>
              <button type="button" onClick={() => nudgeTime(30)} aria-label="30 minutes later"
                className="w-9 h-9 rounded-xl border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--hover)] active:scale-95 transition-transform">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TIMES.map((q) => (
                <button key={q.label} type="button" onClick={() => setTime(q.h, q.m)}
                  className="px-2.5 py-1.5 rounded-full text-xs font-medium border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] transition-colors">
                  {q.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
