import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Timer, Flame, Check } from 'lucide-react';
import { startOfDay, isToday } from 'date-fns';
import { useStore } from '../../store/useStore';
import { stagger, rise, useReducedMotion } from '../../lib/motion';
import { AnimatedNumber } from '../../components/ui';
import { cn } from '../../lib/utils';
import { haptics } from '../../lib/haptics';
import { buildProfile, getSuggestions } from '../../lib/coach';
import type { CoachState } from '../../lib/coach';
import { ConsistencyGraph } from '../../components/ConsistencyGraph';
import MemoriesCard from '../../kairos/MemoriesCard';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Winding down';
}

export default function MobileToday() {
  const rm = useReducedMotion();
  const {
    tasks, cycleTaskStatus, streak, activityHistory, targetDate,
    phases, focusSessions, ideas, pomodoro, habits, habitLog, journeyStart,
  } = useStore();

  const todayMs = startOfDay(new Date()).getTime();

  const todaysTasks = useMemo(
    () =>
      tasks
        .filter((t) => {
          if (t.status === 'done') return t.completedAt && isToday(new Date(t.completedAt));
          if (t.dueDate) return new Date(t.dueDate).getTime() <= todayMs;
          return true;
        })
        .sort((a, b) => {
          const order = { doing: 0, todo: 1, done: 2 };
          return order[a.status] - order[b.status];
        }),
    [tasks, todayMs],
  );

  const suggestions = useMemo(() => {
    const state: CoachState = { phases, tasks, focusSessions, ideas, activityHistory, streak, pomodoro, habits, habitLog, targetDate, journeyStart };
    return getSuggestions(state, buildProfile(state));
  }, [phases, tasks, focusSessions, ideas, activityHistory, streak, pomodoro, habits, habitLog, targetDate, journeyStart]);

  const total = todaysTasks.length;
  // Progress measures today's dated slate (due/overdue or completed today);
  // the undated backlog stays in the list without zeroing the percentage.
  const dated = todaysTasks.filter((t) => t.dueDate || t.status === 'done');
  const scope = dated.length > 0 ? dated : todaysTasks;
  const pct = scope.length > 0 ? Math.round((scope.filter((t) => t.status === 'done').length / scope.length) * 100) : 0;

  return (
    <motion.div variants={stagger} initial={rm ? false : 'hidden'} animate="show" className="flex flex-col gap-6">
      <motion.header variants={rise} className="flex flex-col gap-3">
        <h1 className="font-display-italic text-3xl text-ink">{greeting()}</h1>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2.5 rounded-full bg-elevated overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={rm ? { width: `${pct}%` } : { width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.9, ease: [0.21, 1, 0.4, 1], delay: 0.2 }}
            />
          </div>
          <span className="font-mono-data text-sm font-semibold text-accent"><AnimatedNumber value={pct} />%</span>
        </div>
      </motion.header>

      {/* Kairos "On this day" memories */}
      <MemoriesCard />

      {/* Coach insight */}
      {suggestions[0]?.title && (
        <motion.div variants={rise} className="card p-4">
          <p className="text-sm text-ink leading-relaxed">{suggestions[0].title}</p>
        </motion.div>
      )}

      {/* Today's tasks */}
      <motion.section variants={rise} className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">Today</h2>
        {total === 0 ? (
          <p className="card p-6 text-center text-sm text-ink-muted">No objectives for today. Tap + to add one.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {todaysTasks.map((t) => {
              const isDone = t.status === 'done';
              return (
                <li key={t.id}>
                  <button
                    onClick={() => { cycleTaskStatus(t.id); haptics.tap(); }}
                    className={cn(
                      'w-full card flex items-center gap-3 p-4 text-left active:scale-[0.99] transition-transform',
                      isDone && 'opacity-60',
                    )}
                  >
                    <span
                      className={cn(
                        'w-6 h-6 rounded-full border flex items-center justify-center shrink-0',
                        isDone ? 'bg-accent border-accent text-[var(--accent-text)]' : 'border-on-surface-variant/50 text-transparent',
                      )}
                    >
                      <Check className="w-4 h-4" />
                    </span>
                    <span className={cn('flex-1 text-base', isDone && 'line-through text-ink-muted')}>{t.title}</span>
                    {t.priority === 'high' && !isDone && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-danger">High</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </motion.section>

      {/* Focus CTA */}
      <motion.div variants={rise}>
        <Link to="/focus" className="card p-5 flex items-center justify-between active:scale-[0.98] transition-transform">
          <span className="flex items-center gap-3 text-ink font-medium">
            <Timer className="w-5 h-5 text-accent" /> Start a focus session
          </span>
          <span className="text-ink-subtle">→</span>
        </Link>
      </motion.div>

      {/* Streak */}
      <motion.section variants={rise} className="card p-5">
        <h2 className="font-display text-lg text-ink mb-3 flex items-center gap-2">
          <Flame className="w-4 h-4 text-warning" /> <AnimatedNumber value={streak} />-day streak
        </h2>
        <ConsistencyGraph history={activityHistory} days={91} streak={streak} showStats={false} />
      </motion.section>
    </motion.div>
  );
}
