import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, startOfDay, isToday, subDays } from 'date-fns';
import { ListTodo, Plus, Flame, Clock, Play, Brain, Bot, CalendarClock, TriangleAlert, Search, CheckCircle2, TrendingUp } from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';
import { buildProfile, getSuggestions, getBriefing, buildDailyPlan, formatHour } from '../lib/coach';
import type { CoachState } from '../lib/coach';
import { SuggestionRow } from '../components/Coach';
import { useCoachActions } from '../components/useCoachActions';
import { Heatmap } from '../components/Heatmap';
import { AnimatedNumber } from '../components/ui';
import { Sparkline } from '../components/charts';
import type { TodoTask } from '../store/data';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Winding down';
}

// Staggered entrance for the bento grid.
const grid = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const rise = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0.7, 0.2, 1] as const } },
};

function TaskItem({ task, onComplete }: { task: TodoTask; onComplete: () => void }) {
  const isDone = task.status === 'done';
  return (
    <li
      onClick={onComplete}
      className={cn(
        'task-row flex items-center gap-3.5 p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] cursor-pointer group/item',
        isDone && 'opacity-60',
      )}
    >
      <span
        className={cn(
          'w-[22px] h-[22px] rounded-md shrink-0 flex items-center justify-center transition-all',
          isDone ? 'bg-[var(--accent)]' : 'border-[1.5px] border-[var(--text-subtle)]',
        )}
      >
        {isDone && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="3">
            <path d="M5 12l5 5L20 6" />
          </svg>
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'font-body text-[15px] font-medium transition-colors truncate',
            isDone ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text)] group-hover/item:text-[var(--accent)]',
          )}
        >
          {task.title}
        </p>
        <p className="font-code text-[11px] text-[var(--text-subtle)] flex items-center gap-1.5 mt-1.5 uppercase">
          <Clock className="w-3 h-3" />
          {task.dueDate ? format(new Date(task.dueDate), 'MMM d') : 'No ETA'}
        </p>
      </div>
      {task.priority === 'high' && !isDone && (
        <span className="text-[9px] font-bold tracking-[0.07em] text-[var(--accent-text)] bg-[var(--accent)] px-2.5 py-1 rounded-full">
          HIGH
        </span>
      )}
    </li>
  );
}

function KpiCard({
  label,
  icon,
  children,
  strong,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <motion.div
      variants={rise}
      className="card card-hover p-5 rounded-[18px]"
      style={strong ? { background: 'var(--card-grad-strong)' } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[var(--text-muted)]">{label}</span>
        <span className="text-[var(--text)]">{icon}</span>
      </div>
      <div className="mt-3">{children}</div>
    </motion.div>
  );
}

export default function Dashboard() {
  const {
    tasks, addTask, updateTask, cycleTaskStatus, streak, activityHistory, targetDate,
    phases, focusSessions, ideas, pomodoro, habits, habitLog, journeyStart,
  } = useStore();

  const [quickTask, setQuickTask] = useState('');
  const onAct = useCoachActions();

  const { suggestions, briefing, plan } = useMemo(() => {
    const state: CoachState = { phases, tasks, focusSessions, ideas, activityHistory, streak, pomodoro, habits, habitLog, targetDate, journeyStart };
    const profile = buildProfile(state);
    return {
      suggestions: getSuggestions(state, profile),
      briefing: getBriefing(state),
      plan: buildDailyPlan(state, profile),
    };
  }, [phases, tasks, focusSessions, ideas, activityHistory, streak, pomodoro, habits, habitLog, targetDate, journeyStart]);

  const todayStr = startOfDay(new Date()).toISOString();

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
      });
  }, [tasks, todayStr]);

  const doneCount = todaysTasks.filter((t) => t.status === 'done').length;
  const totalCount = todaysTasks.length;
  const progressPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // Focus minutes today + a 14-day focus series for the momentum/performance charts.
  const focusToday = useMemo(
    () =>
      focusSessions
        .filter((s) => s.kind === 'focus' && isToday(new Date(s.date)))
        .reduce((a, s) => a + s.durationMins, 0),
    [focusSessions],
  );
  const focusSeries = useMemo(() => {
    const arr: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = subDays(new Date(), i);
      const mins = focusSessions
        .filter((s) => s.kind === 'focus' && format(new Date(s.date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'))
        .reduce((a, s) => a + s.durationMins, 0);
      arr.push(mins);
    }
    return arr;
  }, [focusSessions]);
  const miniSeries = focusSeries.slice(-7);

  const handleAddTask = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!quickTask.trim()) return;
    addTask({ title: quickTask.trim(), dueDate: todayStr, priority: 'medium' });
    setQuickTask('');
  };

  const acceptPlan = () => {
    const base = startOfDay(new Date());
    plan.blocks.forEach((b) => {
      const d = new Date(base);
      d.setHours(b.startHour, 0, 0, 0);
      updateTask(b.taskId, { scheduledAt: d.toISOString(), dueDate: base.toISOString() });
    });
  };

  return (
    <div className="relative z-10 w-full flex flex-col gap-6 pb-10">
      {/* Hero */}
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}
        className="flex flex-wrap items-start justify-between gap-5 pt-4 relative z-20"
      >
        <div>
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[var(--text-muted)] mb-2">
            {format(new Date(), 'EEEE · MMMM d')}
          </p>
          <h2 className="font-display text-[34px] sm:text-[40px] font-bold text-[var(--text)] tracking-[-0.03em] leading-[1.02]">
            {greeting()},{' '}
            <span className="font-normal italic" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
              Commander
            </span>
          </h2>
          <div className="flex items-center gap-3.5 mt-4 max-w-md">
            <span className="font-body text-[11px] font-bold text-[var(--text-muted)] tracking-[0.16em] uppercase shrink-0">
              Daily Objective
            </span>
            <div className="flex-1 h-2 bg-[var(--elevated)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="font-code text-[13px] font-semibold text-[var(--text)] shrink-0">{progressPercent}%</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            to="/tasks"
            className="h-11 px-4 rounded-full bg-[var(--elevated)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] text-[13px] font-medium flex items-center gap-2 transition-colors"
          >
            <Search className="w-4 h-4" /> Search
          </Link>
          <button
            onClick={() => {
              const title = window.prompt('Capture a task:');
              if (title) addTask({ title, priority: 'medium', dueDate: todayStr });
            }}
            className="h-11 px-5 rounded-full bg-[var(--accent)] text-[var(--accent-text)] font-bold text-[13px] flex items-center gap-2 hover:bg-[var(--accent-hover)] active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" strokeWidth={2.6} /> Capture
          </button>
        </div>
      </motion.header>

      {/* KPI strip */}
      <motion.div variants={grid} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-4 relative z-20">
        <KpiCard label="Streak" icon={<Flame className="w-4 h-4" />}>
          <p className="font-display text-[38px] font-bold text-[var(--text)] leading-none tracking-[-0.02em]">
            <AnimatedNumber value={streak} />
            <span className="text-[13px] font-medium text-[var(--text-muted)] ml-1.5">days</span>
          </p>
        </KpiCard>
        <KpiCard label="Focus today" icon={<Clock className="w-4 h-4" />}>
          <p className="font-display text-[38px] font-bold text-[var(--text)] leading-none tracking-[-0.02em]">
            <AnimatedNumber value={focusToday} />
            <span className="text-[13px] font-medium text-[var(--text-muted)] ml-1.5">min</span>
          </p>
        </KpiCard>
        <KpiCard label="Done" icon={<CheckCircle2 className="w-4 h-4" />}>
          <p className="font-display text-[38px] font-bold text-[var(--text)] leading-none tracking-[-0.02em]">
            <AnimatedNumber value={doneCount} />
            <span className="text-[13px] font-medium text-[var(--text-muted)] ml-1.5">/ {totalCount} tasks</span>
          </p>
        </KpiCard>
        <KpiCard label="Momentum" icon={<TrendingUp className="w-4 h-4" />} strong>
          <div className="h-[42px] -mb-1">
            <Sparkline data={miniSeries.length ? miniSeries : [0, 0, 0, 0, 0, 0, 0]} height={42} />
          </div>
        </KpiCard>
      </motion.div>

      {/* Row 1: Mission Critical + Focus dial */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-20">
        <div className="lg:col-span-7 neo-card p-6 flex flex-col">
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-display text-lg font-semibold text-[var(--text)] flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                <ListTodo className="w-[18px] h-[18px] text-[var(--accent)]" />
              </span>
              Mission Critical
            </h3>
            <div className="flex items-center gap-2">
              <span className="font-code text-xs text-[var(--text-muted)]">
                {doneCount}/{totalCount}
              </span>
            </div>
          </div>

          <form onSubmit={handleAddTask} className="flex items-center gap-2 mb-4">
            <input
              type="text"
              placeholder="Quick add a task…"
              value={quickTask}
              onChange={(e) => setQuickTask(e.target.value)}
              className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 h-11 text-sm text-[var(--text)] placeholder-[var(--text-subtle)] focus:outline-none focus:border-[var(--border-strong)]"
            />
            <button
              type="submit"
              aria-label="Add task"
              className="w-11 h-11 rounded-xl bg-[var(--accent)] text-[var(--accent-text)] flex items-center justify-center hover:bg-[var(--accent-hover)] active:scale-95 transition-all"
            >
              <Plus className="w-5 h-5" />
            </button>
          </form>

          <ul className="flex-1 space-y-2.5 overflow-y-auto pr-1 custom-scrollbar min-h-[180px]">
            {todaysTasks.map((t) => (
              <TaskItem key={t.id} task={t} onComplete={() => cycleTaskStatus(t.id)} />
            ))}
            {todaysTasks.length === 0 && (
              <div className="p-8 text-center text-[var(--text-muted)] text-sm">No active objectives for today.</div>
            )}
          </ul>
        </div>

        {/* Focus dial */}
        <div className="lg:col-span-5 neo-card p-6 flex flex-col items-center justify-center min-h-[320px]">
          <div className="flex items-center justify-between w-full mb-2">
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-[var(--text-muted)]">Focus Session</span>
            <span className="font-code text-[11px] text-[var(--text-subtle)]">Pomodoro</span>
          </div>
          <div className="relative w-52 h-52 my-3 dial-ring rounded-full flex items-center justify-center">
            <svg className="absolute inset-3 w-[calc(100%-1.5rem)] h-[calc(100%-1.5rem)] -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border-strong)" strokeWidth="4" />
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="276"
                strokeDashoffset="166"
                style={{ filter: 'drop-shadow(0 0 5px var(--accent-soft))' }}
              />
            </svg>
            <div className="text-center z-10">
              <p className="font-display text-5xl font-bold text-[var(--text)] tracking-[-0.03em] leading-none">
                {pomodoro.focusMins}
                <span className="opacity-40">:</span>00
              </p>
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[var(--text-muted)] mt-2">Ready</p>
            </div>
          </div>
          <Link
            to="/focus"
            className="mt-3 h-11 px-10 rounded-full bg-[var(--accent)] text-[var(--accent-text)] font-bold text-[14px] flex items-center gap-2 hover:bg-[var(--accent-hover)] active:scale-95 transition-all"
          >
            <Play className="w-4 h-4 fill-current" /> Engage
          </Link>
        </div>
      </div>

      {/* Row 2: Performance + Coach */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-20">
        <div className="lg:col-span-7 neo-card p-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-display text-lg font-semibold text-[var(--text)]">Performance</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Focus minutes · last 14 days</p>
            </div>
            <span className="font-code text-xs text-[var(--success)] flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> {focusToday}m today · {focusSeries.reduce((a, b) => a + b, 0)}m / 14d
            </span>
          </div>
          <div className="mt-3">
            {focusSeries.some((v) => v > 0) ? (
              <Sparkline data={focusSeries} height={170} />
            ) : (
              <div className="h-[170px] flex flex-col items-center justify-center text-center gap-1">
                <p className="text-sm text-[var(--text-muted)]">No focus time logged in the last 14 days.</p>
                <Link to="/focus" className="text-xs font-semibold text-[var(--accent)] hover:underline">Run a focus session →</Link>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 neo-card p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
              <Brain className="w-[18px] h-[18px] text-[var(--accent)]" />
            </span>
            <h3 className="font-display text-lg font-semibold text-[var(--text)]">Coach</h3>
            <Link to="/coach" className="ml-auto text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
              More →
            </Link>
          </div>

          <div
            className="p-4 rounded-2xl mb-3"
            style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
          >
            <p className={cn('font-body text-[13px] font-bold')} style={{ color: 'var(--accent-text)' }}>
              {briefing.headline}
            </p>
            <p className="font-body text-[12px] mt-1 leading-relaxed" style={{ color: 'var(--accent-text)', opacity: 0.7 }}>
              {briefing.detail}
            </p>
          </div>

          <div className="flex flex-col gap-1 flex-1">
            {suggestions.slice(0, 3).map((s) => (
              <SuggestionRow key={s.id} suggestion={s} onAct={onAct} />
            ))}
          </div>

          <div className="mt-3 pt-3 flex items-center gap-2 justify-center opacity-50">
            <Bot className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="font-code text-[11px] font-medium text-[var(--text-muted)]">Coach learns on-device</span>
          </div>
        </div>
      </div>

      {/* Today's plan (auto-generated by the coach) */}
      {plan.blocks.length > 0 && (
        <div className="neo-card p-6 relative z-20">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-display text-lg font-semibold text-[var(--text)] flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                <CalendarClock className="w-[18px] h-[18px] text-[var(--accent)]" />
              </span>
              Today's Plan
            </h3>
            <button
              onClick={acceptPlan}
              className="bg-[var(--elevated)] border border-[var(--border)] text-[var(--text)] text-sm font-semibold py-2 px-4 rounded-xl hover:bg-[var(--hover-strong)] transition-colors"
            >
              Add to schedule
            </button>
          </div>
          {plan.overloaded && (
            <p className="flex items-center gap-2 text-xs text-[var(--danger)] mb-3">
              <TriangleAlert className="w-3.5 h-3.5" />~{Math.round((plan.demandMins / 60) * 10) / 10}h queued vs your usual ~
              {Math.round((plan.capacityMins / 60) * 10) / 10}h — consider trimming.
            </p>
          )}
          <ul className="space-y-2">
            {plan.blocks.map((b) => (
              <li key={b.taskId} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
                <span className="font-code text-xs font-bold text-[var(--text)] w-14 shrink-0">{formatHour(b.startHour)}</span>
                <span className="flex-1 text-sm text-[var(--text)] truncate">{b.title}</span>
                <span className="font-code text-[10px] text-[var(--text-muted)] shrink-0">{b.mins}m</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Consistency heatmap */}
      <div className="neo-card p-6 relative z-20">
        <h3 className="font-display text-lg font-semibold text-[var(--text)] mb-5 flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
            <Flame className="w-[18px] h-[18px] text-[var(--accent)]" />
          </span>
          Consistency Streak <span className="text-[var(--text-muted)] font-normal text-sm">({streak} days)</span>
        </h3>
        <div className="bg-[var(--bg)] p-4 rounded-2xl border border-[var(--border)]">
          <Heatmap history={activityHistory} />
        </div>
      </div>

      {/* Quick Add FAB */}
      <button
        onClick={() => {
          const title = window.prompt('New Task:');
          if (title) addTask({ title, priority: 'medium', dueDate: todayStr });
        }}
        aria-label="Quick add task"
        className="fixed bottom-8 right-8 w-15 h-15 bg-[var(--accent)] text-[var(--accent-text)] rounded-full flex items-center justify-center fab-btn z-50 hover:scale-105 transition-transform"
        style={{ width: '60px', height: '60px' }}
      >
        <Plus className="w-7 h-7" strokeWidth={2.4} />
      </button>
    </div>
  );
}
