import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { subDays } from 'date-fns';
import { Repeat, Plus, Check, Flame, Trash2, AlertTriangle } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { Habit } from '../store/data';
import { cn } from '../lib/utils';
import { dayKey } from '../lib/streak';
import { habitStreak, isHabitDueOn, missedLastDue } from '../lib/habits';
import { pop } from '../lib/motion';
import { PageHeader, ProgressBar, EmptyState } from '../components/ui';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function Habits() {
  const { habits, habitLog, addHabit, deleteHabit, toggleHabitToday } = useStore();

  const today = dayKey(new Date());

  const logsByHabit = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of habitLog) {
      if (!m.has(l.habitId)) m.set(l.habitId, new Set());
      m.get(l.habitId)!.add(l.date);
    }
    return m;
  }, [habitLog]);

  const active = habits.filter((h) => !h.archived);
  const dueToday = active.filter((h) => isHabitDueOn(h, new Date()));
  const doneToday = dueToday.filter((h) => logsByHabit.get(h.id)?.has(today)).length;
  const progress = dueToday.length ? Math.round((doneToday / dueToday.length) * 100) : 0;

  const handleToggle = (h: Habit) => {
    toggleHabitToday(h.id);
  };

  return (
    <div className="animate-rise">
      <PageHeader
        title="Habits"
        subtitle="Small, repeatable wins. Show up daily — don't break the chain."
        icon={<Repeat className="w-5 h-5" />}
      />

      <AddHabit onAdd={addHabit} />

      {dueToday.length > 0 && (
        <div className="card p-4 mb-5">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium text-ink-muted">Today</span>
            <span className="font-display font-bold text-ink">
              {doneToday}/{dueToday.length}
            </span>
          </div>
          <ProgressBar value={progress} />
          {progress === 100 && (
            <p className="text-xs text-success font-medium mt-2">All habits done today.</p>
          )}
        </div>
      )}

      {active.length === 0 ? (
        <EmptyState
          icon={<Repeat className="w-7 h-7" />}
          title="No habits yet"
          hint="Add a tiny daily habit — consistency compounds over six months."
        />
      ) : (
        <div className="space-y-2">
          {active.map((h) => {
            const days = logsByHabit.get(h.id) ?? new Set<string>();
            const done = days.has(today);
            // Counted over the days this habit was DUE — a Mon/Wed/Fri habit
            // kept perfectly used to read a streak of 2 forever, because a
            // day-by-day walk treats Tuesday as a miss.
            const streak = habitStreak(days, h);
            const due = isHabitDueOn(h, new Date());
            const missedTwice = !done && due && missedLastDue(days, h);
            return (
              <HabitRow
                key={h.id}
                habit={h}
                done={done}
                due={due}
                streak={streak}
                days={days}
                missedTwice={missedTwice}
                onToggle={() => handleToggle(h)}
                onDelete={() => deleteHabit(h.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function HabitRow({
  habit,
  done,
  due,
  streak,
  days,
  missedTwice,
  onToggle,
  onDelete,
}: {
  habit: Habit;
  done: boolean;
  due: boolean;
  streak: number;
  days: Set<string>;
  missedTwice: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const strip = useMemo(() => {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      // A day the habit wasn't scheduled on is not a miss. Drawn the same as a
      // missed day, a Mon/Wed/Fri habit looked like it was failing four days a
      // week.
      out.push({ key: dayKey(d), weekday: d.getDay(), hit: days.has(dayKey(d)), due: isHabitDueOn(habit, d) });
    }
    return out;
  }, [days, habit]);

  return (
    <div className="group card card-hover flex items-center gap-3.5 px-3.5 py-3">
      <motion.button
        onClick={onToggle}
        whileTap={{ scale: 0.85 }}
        transition={pop}
        disabled={!due}
        title={due ? 'Mark done' : 'Not scheduled today'}
        className={cn(
          'w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
          done
            ? 'bg-accent border-accent text-[var(--accent-text)] shadow-[0_0_0_4px_var(--accent-soft)]'
            : due
              ? 'border-ink-subtle text-transparent hover:border-accent'
              : 'border-border text-transparent opacity-50',
        )}
      >
        <Check className="w-5 h-5" />
      </motion.button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {habit.emoji && <span className="text-base leading-none">{habit.emoji}</span>}
          <p className={cn('text-sm font-medium truncate', done ? 'text-ink' : 'text-ink')}>
            {habit.name}
          </p>
          {habit.scheduledTime && (
            <span className="text-[11px] font-medium text-ink-muted tabular-nums shrink-0">
              {habit.scheduledTime}
            </span>
          )}
          {streak > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-warning">
              <Flame className="w-3 h-3" /> {streak}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          {/* 7-day strip */}
          <div className="flex items-center gap-1">
            {strip.map((d) => (
              <span
                key={d.key}
                title={`${d.key}${d.hit ? ' — done' : d.due ? ' — missed' : ' — not scheduled'}`}
                className={cn(
                  'w-5 h-5 rounded-[5px] flex items-center justify-center text-[11px] font-bold leading-none',
                  d.hit
                    ? 'bg-accent text-[var(--accent-text)]'
                    : d.due
                      ? 'bg-elevated text-ink-subtle'
                      : 'bg-transparent border border-dashed border-border text-ink-subtle opacity-45',
                )}
              >
                {WEEKDAYS[d.weekday]}
              </span>
            ))}
          </div>
          {missedTwice && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-danger">
              <AlertTriangle className="w-3 h-3" /> Don't miss twice
            </span>
          )}
        </div>
      </div>

      <button
        onClick={onDelete}
        className="tap-44 p-1.5 rounded-md text-ink-muted hover:text-danger hover:bg-hover opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Delete habit"
        title="Delete habit"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function AddHabit({ onAdd }: { onAdd: (h: Partial<Habit> & { name: string }) => void }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [at, setAt] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      emoji: emoji.trim() || undefined,
      cadence,
      daysOfWeek: cadence === 'weekly' && daysOfWeek.length ? daysOfWeek : undefined,
      scheduledTime: at || undefined,
    });
    setName('');
    setEmoji('');
    setCadence('daily');
    setDaysOfWeek([]);
    setAt('');
  };

  const toggleDay = (d: number) =>
    setDaysOfWeek((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  return (
    <form onSubmit={submit} className="card p-3 mb-5 space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value.slice(0, 2))}
          placeholder="🎯"
          aria-label="Habit emoji (optional)"
          className="input w-12 min-h-[44px] text-center text-base px-0"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a habit — e.g. Solve 1 DSA problem"
          aria-label="Habit name"
          className="input flex-1 min-h-[44px]"
        />
        <button type="submit" className="btn btn-primary shrink-0">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-elevated border border-border">
          {(['daily', 'weekly'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCadence(c)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors',
                cadence === c ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
              )}
            >
              {c}
            </button>
          ))}
        </div>
        {cadence === 'weekly' && (
          <div className="flex items-center gap-1">
            {WEEKDAYS.map((w, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className={cn(
                  'w-7 h-7 rounded-md text-xs font-medium transition-colors',
                  daysOfWeek.includes(i)
                    ? 'bg-accent text-[var(--accent-text)]'
                    : 'bg-elevated text-ink-muted hover:text-ink',
                )}
              >
                {w}
              </button>
            ))}
          </div>
        )}
        {/* An implementation intention: "when it is 07:00, I will read".
            Gollwitzer & Sheeran's meta-analysis — 94 tests, ~8,000 people —
            puts specifying WHEN at d = 0.65 on goal attainment, one of the
            larger effects in the behaviour-change literature. The field has
            existed on the Habit type since the beginning; nothing set it. */}
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          at
          <input
            type="time"
            value={at}
            onChange={(e) => setAt(e.target.value)}
            aria-label="Time of day for this habit (optional)"
            className="input !w-auto !py-1 !px-2 text-xs min-h-[44px]"
          />
        </label>
      </div>
      {!at && name.trim() && (
        <p className="text-xs text-ink-muted">
          Setting a time roughly doubles the odds you'll actually do it — it gives the habit a cue
          instead of relying on remembering.
        </p>
      )}
    </form>
  );
}
