import { useEffect, useMemo, useRef, useState } from 'react';
import {
  format, isValid, isSameDay, isSameMonth, isToday, isTomorrow,
  startOfMonth, endOfMonth, startOfWeek, addDays, addMonths,
} from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useReducedMotion } from '../lib/motion';

interface DateTimePickerProps {
  value: string; // "yyyy-MM-ddTHH:mm:ss" local, or "" for none
  onChange: (val: string) => void;
  className?: string;
}

const ITEM_H = 36; // px — one wheel row
const WHEEL_H = 160; // px — visible wheel window

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const MERIDIEM = ['AM', 'PM'];

function dayChipLabel(d: Date): string {
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE, MMM d');
}

/** One iOS-style snap wheel: scroll-snapped rows, fade-masked edges, the
 *  centered row is the value. Click a row to glide to it. */
function Wheel({ items, index, onIndex }: { items: string[]; index: number; onIndex: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Position on mount only — after that the user's scroll owns the wheel.
  const [initialIndex] = useState(index);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = initialIndex * ITEM_H;
  }, [initialIndex]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)));
    if (i !== index) onIndex(i);
  };

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="wheel-scroll flex-1 h-full overflow-y-scroll snap-y snap-mandatory"
      style={{ padding: `${(WHEEL_H - ITEM_H) / 2}px 0`, scrollbarWidth: 'none' }}
    >
      {items.map((v, i) => (
        <button
          type="button"
          key={`${v}-${i}`}
          onClick={() => ref.current?.scrollTo({ top: i * ITEM_H, behavior: 'smooth' })}
          className="w-full flex items-center justify-center snap-center transition-all duration-150 select-none"
          style={{
            height: ITEM_H,
            color: i === index ? 'var(--text)' : 'var(--text-subtle)',
            fontWeight: i === index ? 700 : 400,
            fontSize: i === index ? 16 : 14,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

/** Compact date+time control — chip triggers that expand a floating card with a
 *  calendar and an iOS-style three-wheel time picker (hours / minutes / AM-PM).
 *  Fully themed for light+dark, no native inputs, fixed width (never stretches).
 *  Emits local "yyyy-MM-ddTHH:mm:ss"; a date with no time is T00:00:00. */
export function DateTimePicker({ value, onChange, className }: DateTimePickerProps) {
  const rm = useReducedMotion();
  const parsed = value ? new Date(value) : null;
  const selected = parsed && isValid(parsed) ? parsed : null;
  const hasTime = !!selected && !(selected.getHours() === 0 && selected.getMinutes() === 0);

  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(selected ?? new Date()));

  const days = useMemo(() => {
    const first = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const last = endOfMonth(viewMonth);
    const out: Date[] = [];
    for (let d = first; out.length < 42; d = addDays(d, 1)) {
      out.push(d);
      if (d >= last && d.getDay() === 0) break;
    }
    return out;
  }, [viewMonth]);

  const emit = (d: Date, withTime: boolean) =>
    onChange(`${format(d, 'yyyy-MM-dd')}T${withTime ? format(d, 'HH:mm') : '00:00'}:00`);

  const pickDay = (day: Date) => {
    const next = new Date(day);
    if (selected && hasTime) next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    emit(next, !!selected && hasTime);
  };

  // Wheel indices ← current value (defaults 9:00 AM until a time is chosen).
  const base = hasTime ? selected! : null;
  const h24 = base ? base.getHours() : 9;
  const hourIdx = (h24 % 12 === 0 ? 12 : h24 % 12) - 1;
  const minIdx = base ? Math.round(base.getMinutes() / 5) % 12 : 0;
  const apIdx = h24 >= 12 ? 1 : 0;

  const setWheels = (hi: number, mi: number, ai: number) => {
    const d = new Date(selected ?? new Date());
    const h12 = hi + 1;
    const h = ai === 1 ? (h12 % 12) + 12 : h12 % 12;
    d.setHours(h, mi * 5, 0, 0);
    emit(d, true);
  };

  return (
    <div className={cn('max-w-[360px]', className)}>
      {/* Trigger chips */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors',
            selected ? 'text-[var(--text)]' : 'text-[var(--text-muted)]',
            open ? 'border-[var(--border-strong)] bg-[var(--hover)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]',
          )}
        >
          <CalendarDays className="w-4 h-4" style={{ color: selected ? 'var(--cozy)' : undefined }} />
          {selected ? dayChipLabel(selected) : 'Pick a date'}
        </button>

        {selected && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3.5 py-2 text-[13px] font-semibold text-[var(--text)] hover:border-[var(--border-strong)] transition-colors"
          >
            <Clock className="w-4 h-4" style={{ color: hasTime ? 'var(--cozy)' : undefined }} />
            {hasTime ? format(selected, 'h:mm a') : 'Add time'}
          </button>
        )}

        {selected && (
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            aria-label="Clear schedule"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-subtle)] hover:text-[var(--danger)] hover:bg-[var(--hover)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Floating card */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={rm ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={rm ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mt-2 w-[340px] max-w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
            style={{ boxShadow: 'var(--shadow-lg)' }}
          >
            {/* Month header */}
            <div className="flex items-center justify-between px-3 pt-3 pb-1">
              <button type="button" onClick={() => setViewMonth((m) => addMonths(m, -1))} aria-label="Previous month"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--hover)] active:scale-95 transition-transform">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[13.5px] font-bold text-[var(--text)]">{format(viewMonth, 'MMMM yyyy')}</span>
              <button type="button" onClick={() => setViewMonth((m) => addMonths(m, 1))} aria-label="Next month"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--hover)] active:scale-95 transition-transform">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Day grid */}
            <div className="px-3 pb-2">
              <div className="grid grid-cols-7 place-items-center">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <span key={i} className="text-[10px] font-bold text-[var(--text-subtle)] h-6 flex items-center">{d}</span>
                ))}
                {days.map((day) => {
                  const inMonth = isSameMonth(day, viewMonth);
                  const sel = !!selected && isSameDay(day, selected);
                  const today = isToday(day);
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => pickDay(day)}
                      className={cn(
                        'w-10 h-10 rounded-full text-[13px] font-medium transition-colors relative',
                        sel ? 'font-bold' : 'hover:bg-[var(--hover)]',
                        !inMonth && !sel && 'text-[var(--text-subtle)]',
                      )}
                      style={{
                        background: sel ? 'var(--accent)' : undefined,
                        color: sel ? 'var(--accent-text)' : today ? 'var(--cozy)' : undefined,
                        boxShadow: today && !sel ? 'inset 0 0 0 1.5px var(--cozy)' : undefined,
                        fontWeight: today && !sel ? 700 : undefined,
                      }}
                    >
                      {format(day, 'd')}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time — iOS-style snap wheels */}
            <div className="border-t border-[var(--border)] px-3 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10.5px] font-bold tracking-[0.08em] uppercase text-[var(--text-subtle)] flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> Time
                </span>
                {hasTime && selected ? (
                  <button type="button" onClick={() => emit(selected, false)}
                    className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--danger)]">
                    No time
                  </button>
                ) : (
                  <span className="text-[11px] text-[var(--text-subtle)]">scroll to set</span>
                )}
              </div>

              <div
                className="relative flex"
                style={{
                  height: WHEEL_H,
                  maskImage: 'linear-gradient(to bottom, transparent, black 22%, black 78%, transparent)',
                  WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 22%, black 78%, transparent)',
                }}
              >
                {/* center highlight bar */}
                <div
                  className="absolute left-1 right-1 top-1/2 -translate-y-1/2 rounded-xl pointer-events-none"
                  style={{ height: ITEM_H, background: hasTime ? 'var(--cozy-soft)' : 'var(--hover)' }}
                />
                <Wheel items={HOURS} index={hourIdx} onIndex={(i) => setWheels(i, minIdx, apIdx)} />
                <Wheel items={MINUTES} index={minIdx} onIndex={(i) => setWheels(hourIdx, i, apIdx)} />
                <Wheel items={MERIDIEM} index={apIdx} onIndex={(i) => setWheels(hourIdx, minIdx, i)} />
              </div>
            </div>

            {/* Done */}
            <div className="flex justify-end px-3 pb-3">
              <button type="button" onClick={() => setOpen(false)}
                className="rounded-full px-4 py-1.5 text-[12.5px] font-bold text-[var(--accent-text)] active:scale-95 transition-transform"
                style={{ background: 'var(--accent)' }}>
                Done
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
