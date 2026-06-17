import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  Plus,
  Flame,
  Timer,
  Lightbulb,
  ArrowRight,
  CalendarDays,
  Target,
} from 'lucide-react';
import { format, startOfDay, isToday, differenceInCalendarDays } from 'date-fns';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';
import { countRoadmap } from '../lib/roadmap';
import { buildProfile, getSuggestions } from '../lib/coach';
import type { CoachState } from '../lib/coach';
import { ProgressBar, PriorityDot } from '../components/ui';
import { CoachCard } from '../components/Coach';
import { Heatmap } from '../components/Heatmap';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Winding down';
}

export default function Dashboard() {
  const {
    tasks,
    addTask,
    cycleTaskStatus,
    streak,
    activityHistory,
    toggleLogDay,
    targetDate,
    setTargetDate,
    phases,
    focusSessions,
    ideas,
    pomodoro,
    habits,
    habitLog,
    addIdea,
  } = useStore();

  const suggestions = useMemo(() => {
    const state: CoachState = {
      phases,
      tasks,
      focusSessions,
      ideas,
      activityHistory,
      streak,
      pomodoro,
      habits,
      habitLog,
      targetDate,
    };
    return getSuggestions(state, buildProfile(state));
  }, [phases, tasks, focusSessions, ideas, activityHistory, streak, pomodoro, habits, habitLog, targetDate]);

  const [quickTask, setQuickTask] = useState('');
  const [quickIdea, setQuickIdea] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const todayStr = startOfDay(new Date()).toISOString();
  const daysLeft = Math.max(0, differenceInCalendarDays(new Date(targetDate), new Date()));

  // "Today" = tasks due today + anything still open with no due date
  const todaysTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        if (t.status === 'done') return t.completedAt && isToday(new Date(t.completedAt));
        if (t.dueDate) return new Date(t.dueDate).getTime() <= new Date(todayStr).getTime();
        return true;
      })
      .sort((a, b) => {
        const order = { doing: 0, todo: 1, done: 2 };
        return order[a.status] - order[b.status];
      })
      .slice(0, 8);
  }, [tasks, todayStr]);

  const doneCount = todaysTasks.filter((t) => t.status === 'done').length;
  const progress = todaysTasks.length ? Math.round((doneCount / todaysTasks.length) * 100) : 0;

  const handleComplete = (t: (typeof todaysTasks)[number]) => {
    cycleTaskStatus(t.id);
  };

  const focusToday = useMemo(
    () =>
      focusSessions
        .filter((s) => s.kind === 'focus' && isToday(new Date(s.date)))
        .reduce((acc, s) => acc + s.durationMins, 0),
    [focusSessions],
  );

  const roadmap = useMemo(() => countRoadmap(phases), [phases]);
  const todayLogged = activityHistory.some((l) => l.date === todayStr);

  const handleLogDay = (type: 'full' | 'minimum') => {
    toggleLogDay(type);
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTask.trim()) return;
    addTask({ title: quickTask.trim(), dueDate: todayStr, priority: 'medium' });
    setQuickTask('');
  };

  const handleAddIdea = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickIdea.trim()) return;
    addIdea(quickIdea.trim());
    setQuickIdea('');
  };

  return (
    <div className="animate-rise space-y-7">
      {/* Hero */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-muted font-medium flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4" />
            {format(new Date(), 'EEEE, MMMM d')}
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink mt-1">
            {greeting()}.
          </h1>
        </div>
        <div className="relative">
          <button
            onClick={() => setDatePickerOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-xl border border-border bg-accent-soft px-4 py-2.5 hover:border-accent transition-colors cursor-pointer group"
            title="Click to change target date"
          >
            <Target className="w-5 h-5 text-accent" />
            <div>
              <p className="font-display text-xl font-bold leading-none text-ink">{daysLeft}</p>
              <p className="text-[11px] text-ink-muted">days to goal</p>
            </div>
          </button>
          {datePickerOpen && (
            <div className="absolute right-0 top-full mt-2 z-50 card shadow-lg p-4 w-64 animate-rise">
              <p className="text-xs text-ink-muted mb-2">
                Target: <span className="text-accent font-medium">{format(new Date(targetDate), 'MMMM d, yyyy')}</span>
              </p>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => {
                  setTargetDate(e.target.value);
                  setDatePickerOpen(false);
                }}
                className="input text-sm w-full"
                autoFocus
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[
                  { label: '6mo', months: 6 },
                  { label: '9mo', months: 9 },
                  { label: '1yr', months: 12 },
                ].map(({ label, months }) => {
                  const d = new Date();
                  d.setMonth(d.getMonth() + months);
                  return (
                    <button
                      key={label}
                      onClick={() => {
                        setTargetDate(format(d, 'yyyy-MM-dd'));
                        setDatePickerOpen(false);
                      }}
                      className="px-2 py-1 rounded-md text-xs font-medium bg-elevated border border-border text-ink-muted hover:text-ink hover:bg-hover transition-colors"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setDatePickerOpen(false)}
                className="text-xs text-ink-subtle hover:text-ink mt-2 w-full text-center"
              >
                close
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Top stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat icon={<Flame className="w-4 h-4" />} label="Streak" value={`${streak}d`} />
        <MiniStat
          icon={<Timer className="w-4 h-4" />}
          label="Focus today"
          value={`${focusToday}m`}
        />
        <MiniStat
          icon={<Check className="w-4 h-4" />}
          label="Today done"
          value={`${doneCount}/${todaysTasks.length}`}
        />
        <MiniStat
          icon={<Target className="w-4 h-4" />}
          label="Roadmap"
          value={`${roadmap.percent}%`}
        />
      </div>

      {/* Coach */}
      <CoachCard suggestions={suggestions} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Today's focus */}
        <section className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-label">Today's focus</h2>
            <Link
              to="/tasks"
              className="text-xs font-medium text-ink-muted hover:text-accent flex items-center gap-1"
            >
              All tasks <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <ProgressBar value={progress} className="h-1.5" />

          <div className="space-y-1.5 pt-1">
            {todaysTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-ink-subtle">
                Nothing planned yet. Add your first task below.
              </div>
            ) : (
              todaysTasks.map((task) => (
                <div
                  key={task.id}
                  className="group card card-hover flex items-center gap-3 px-3 py-2.5"
                >
                  <button
                    onClick={() => handleComplete(task)}
                    className={cn(
                      'w-5 h-5 rounded-full border flex items-center justify-center transition-colors shrink-0',
                      task.status === 'done'
                        ? 'bg-accent border-accent text-[var(--accent-text)]'
                        : task.status === 'doing'
                          ? 'border-warning text-warning'
                          : 'border-ink-subtle text-transparent hover:border-ink',
                    )}
                  >
                    {task.status === 'done' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : task.status === 'doing' ? (
                      <span className="w-2 h-2 rounded-full bg-warning" />
                    ) : null}
                  </button>
                  <PriorityDot priority={task.priority} />
                  <p
                    className={cn(
                      'flex-1 text-sm truncate',
                      task.status === 'done' ? 'line-through text-ink-subtle' : 'text-ink',
                    )}
                  >
                    {task.title}
                  </p>
                  {task.category && <span className="chip hidden sm:inline-flex">{task.category}</span>}
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleAddTask} className="flex items-center gap-2 card px-2 py-1.5">
            <button type="submit" className="p-1.5 text-ink-muted hover:text-accent">
              <Plus className="w-5 h-5" />
            </button>
            <input
              value={quickTask}
              onChange={(e) => setQuickTask(e.target.value)}
              placeholder="Add a task for today…"
              className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-subtle focus:outline-none py-1.5"
            />
          </form>
        </section>

        {/* Right: streak / log / quick capture */}
        <aside className="space-y-4">
          <div className="card p-4">
            <h3 className="section-label mb-3">Daily log</h3>
            <button
              onClick={() => handleLogDay('full')}
              className={cn('btn w-full', todayLogged ? 'btn-secondary' : 'btn-primary')}
            >
              {todayLogged ? '✓ Day locked in' : 'Mark day complete'}
            </button>
            <button
              onClick={() => handleLogDay('minimum')}
              className="btn btn-ghost w-full mt-1.5 text-xs"
            >
              Just did the minimum
            </button>
            <p className="text-[11px] text-ink-subtle text-center mt-3">
              {streak > 0 ? `${streak}-day streak` : 'Start your streak today'}
            </p>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-[10px] font-medium text-ink-subtle uppercase tracking-wider mb-2">Activity (90 Days)</p>
              <Heatmap history={activityHistory} />
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-label">Quick capture</h3>
              <Lightbulb className="w-4 h-4 text-ink-subtle" />
            </div>
            <form onSubmit={handleAddIdea} className="space-y-2">
              <textarea
                value={quickIdea}
                onChange={(e) => setQuickIdea(e.target.value)}
                placeholder="Dump an idea before it's gone…"
                rows={2}
                className="input resize-none"
              />
              <button type="submit" className="btn btn-secondary w-full">
                <Plus className="w-4 h-4" /> Capture
              </button>
            </form>
            <Link
              to="/brain-dump"
              className="text-xs font-medium text-ink-muted hover:text-accent flex items-center gap-1 mt-3"
            >
              Open brain dump <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="card p-3.5">
      <div className="flex items-center gap-1.5 text-ink-subtle">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="font-display text-xl font-bold text-ink mt-1.5">{value}</p>
    </div>
  );
}
