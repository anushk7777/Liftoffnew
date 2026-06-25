import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, startOfDay, isToday, subDays } from 'date-fns';
import { ListTodo, Plus, Flame, Clock, Play, Brain, Bot, CalendarClock, TriangleAlert, BarChart3 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';
import { buildProfile, getSuggestions, getBriefing, buildDailyPlan, formatHour } from '../lib/coach';
import type { CoachState } from '../lib/coach';
import { SuggestionRow } from '../components/Coach';
import { useCoachActions } from '../components/useCoachActions';
import { Heatmap } from '../components/Heatmap';
import { MiniBars } from '../components/charts';
import type { TodoTask } from '../store/data';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Winding down';
}

function TaskItem({ task, onComplete }: { task: TodoTask, onComplete: () => void }) {
  const isDone = task.status === 'done';

  return (
    <li className={cn("flex items-start gap-4 p-4 rounded-2xl neo-card-inset group/item cursor-pointer transition-opacity", isDone && "opacity-60")} onClick={onComplete}>
      <div className="mt-1 relative flex items-center justify-center">
        <input
          checked={isDone}
          readOnly
          className="custom-checkbox appearance-none bg-[var(--bg)] m-0 w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer shadow-[inset_3px_3px_6px_var(--shadow-dark),inset_-3px_-3px_6px_var(--shadow-light)]"
          type="checkbox"
        />
        {isDone && (
          <div className="absolute inset-0 bg-[var(--accent)] rounded-md transform scale-75 transition-transform"></div>
        )}
      </div>
      <div className={cn("flex-1", isDone && "line-through")}>
        <p className={cn("font-body text-base font-medium transition-colors", isDone ? "text-[var(--text-muted)]" : "text-[var(--text)] group-hover/item:text-[var(--accent)]")}>
          {task.title}
        </p>
        <p className="font-code text-xs text-[var(--text-muted)] flex items-center gap-2 mt-2 uppercase">
          <Clock className="w-3.5 h-3.5" />
          {task.dueDate ? format(new Date(task.dueDate), 'MMM d') : 'NO ETA'}
          {task.priority === 'high' && (
            <>
              <span className="w-1 h-1 rounded-full bg-[var(--text-muted)] mx-1"></span>
              <span className="px-2 py-1 rounded-lg bg-[var(--bg)] neo-button text-[var(--accent)] text-[10px] font-bold tracking-wider">HIGH PRIORITY</span>
            </>
          )}
        </p>
      </div>
    </li>
  );
}

export default function Dashboard() {
  const {
    tasks, addTask, updateTask, cycleTaskStatus, streak, activityHistory, targetDate,
    phases, focusSessions, ideas, pomodoro, habits, habitLog
  } = useStore();

  const [quickTask, setQuickTask] = useState('');
  const onAct = useCoachActions();

  const { suggestions, briefing, plan } = useMemo(() => {
    const state: CoachState = { phases, tasks, focusSessions, ideas, activityHistory, streak, pomodoro, habits, habitLog, targetDate };
    const profile = buildProfile(state);
    return {
      suggestions: getSuggestions(state, profile),
      briefing: getBriefing(state),
      plan: buildDailyPlan(state, profile),
    };
  }, [phases, tasks, focusSessions, ideas, activityHistory, streak, pomodoro, habits, habitLog, targetDate]);

  const todayStr = startOfDay(new Date()).toISOString();

  const todaysTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.status === 'done') return t.completedAt && isToday(new Date(t.completedAt));
      if (t.dueDate) return new Date(t.dueDate).getTime() <= new Date(todayStr).getTime();
      return true;
    }).sort((a, b) => {
      const order = { doing: 0, todo: 1, done: 2 };
      return order[a.status] - order[b.status];
    });
  }, [tasks, todayStr]);

  const doneCount = todaysTasks.filter(t => t.status === 'done').length;
  const totalCount = todaysTasks.length;
  const progressPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // Real focus-minutes over the last 14 days (from logged Pomodoro sessions).
  const focusByDay = useMemo(() => {
    const data: { label: string; value: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = subDays(new Date(), i);
      const mins = focusSessions
        .filter((s) => s.kind === 'focus' && format(new Date(s.date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'))
        .reduce((a, s) => a + s.durationMins, 0);
      data.push({ label: format(day, 'EEE'), value: mins });
    }
    return data;
  }, [focusSessions]);
  const focusToday = focusByDay[focusByDay.length - 1]?.value ?? 0;
  const focus14 = focusByDay.reduce((a, d) => a + d.value, 0);

  const handleAddTask = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!quickTask.trim()) return;
    addTask({ title: quickTask.trim(), dueDate: todayStr, priority: 'medium' });
    setQuickTask('');
  };

  // Schedule the auto-plan: stamp each block onto today at its suggested hour.
  const acceptPlan = () => {
    const base = startOfDay(new Date());
    plan.blocks.forEach((b) => {
      const d = new Date(base);
      d.setHours(b.startHour, 0, 0, 0);
      updateTask(b.taskId, { scheduledAt: d.toISOString(), dueDate: base.toISOString() });
    });
  };

  const briefingColor =
    briefing.status === 'behind' ? 'text-[var(--danger)]'
      : briefing.status === 'ahead' ? 'text-[var(--success,#34d399)]'
        : 'text-[var(--accent)]';

  return (
    <div className="relative z-10 w-full h-full flex flex-col gap-8">
      {/* Greeting & Progress */}
      <header className="flex flex-col gap-4 pt-6 relative z-20">
        <h2 className="font-display text-4xl font-bold text-[var(--text)] drop-shadow-md">{greeting()}, Commander</h2>
        <div className="flex items-center gap-4 w-full max-w-md">
          <span className="font-body text-xs font-bold text-[var(--text-muted)] tracking-widest uppercase">Daily Objective</span>
          <div className="flex-1 h-3 bg-[var(--bg)] rounded-full overflow-hidden progress-track">
            <div
              className="h-full bg-[var(--accent)] rounded-full progress-fill transition-all duration-1000"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          <span className="font-code text-sm font-semibold text-[var(--accent)]">{progressPercent}%</span>
        </div>
      </header>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 flex-1 pb-10 relative z-20">

        {/* Left Column (Tasks, Plan, Habits) */}
        <div className="md:col-span-7 flex flex-col gap-8 h-full">
          {/* Tasks */}
          <div className="neo-card p-6 flex-1 flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-center mb-6 z-10">
              <h3 className="font-display text-xl font-semibold text-[var(--text)] flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl neo-button flex items-center justify-center">
                  <ListTodo className="w-5 h-5 text-[var(--accent)]" />
                </div>
                Mission Critical
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Quick add..."
                  value={quickTask}
                  onChange={e => setQuickTask(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                  className="bg-transparent border-none text-sm font-body text-[var(--text)] focus:ring-0 placeholder-[var(--text-muted)]"
                />
                <button onClick={() => handleAddTask()} aria-label="Add task" className="w-10 h-10 rounded-xl neo-button flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
            <ul className="flex-1 space-y-4 z-10 overflow-y-auto pr-2 custom-scrollbar">
              {todaysTasks.map(t => (
                <TaskItem key={t.id} task={t} onComplete={() => cycleTaskStatus(t.id)} />
              ))}
              {todaysTasks.length === 0 && (
                <div className="p-8 text-center text-[var(--text-muted)]">No active objectives for today.</div>
              )}
            </ul>
          </div>

          {/* Performance — real focus minutes, last 14 days */}
          <div className="neo-card p-6 shrink-0">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display text-xl font-semibold text-[var(--text)] flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl neo-button flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-[var(--accent)]" />
                </div>
                Performance
              </h3>
              <span className="font-code text-xs text-[var(--text-muted)]">
                <span className="text-[var(--accent)] font-semibold">{focusToday}m</span> today · {focus14}m / 14d
              </span>
            </div>
            {focus14 > 0 ? (
              <MiniBars data={focusByDay} height={140} />
            ) : (
              <div className="h-[140px] flex flex-col items-center justify-center text-center gap-1">
                <p className="text-sm text-[var(--text-muted)]">No focus time logged yet.</p>
                <Link to="/focus" className="text-xs font-semibold text-[var(--accent)] hover:underline">Run a focus session →</Link>
              </div>
            )}
            <p className="font-body text-[11px] text-[var(--text-muted)] mt-2">Focus minutes per day — grows as you complete Pomodoro sessions.</p>
          </div>

          {/* Today's plan (auto-generated by the coach) */}
          {plan.blocks.length > 0 && (
            <div className="neo-card p-6 shrink-0">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-display text-xl font-semibold text-[var(--text)] flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl neo-button flex items-center justify-center">
                    <CalendarClock className="w-5 h-5 text-[var(--accent)]" />
                  </div>
                  Today's Plan
                </h3>
                <button onClick={acceptPlan} className="neo-button text-[var(--accent)] text-sm font-bold py-2 px-4 rounded-xl">
                  Add to schedule
                </button>
              </div>
              {plan.overloaded && (
                <p className="flex items-center gap-2 text-xs text-[var(--danger)] mb-3">
                  <TriangleAlert className="w-3.5 h-3.5" />
                  ~{Math.round((plan.demandMins / 60) * 10) / 10}h queued vs your usual ~{Math.round((plan.capacityMins / 60) * 10) / 10}h — consider trimming.
                </p>
              )}
              <ul className="space-y-2">
                {plan.blocks.map((b) => (
                  <li key={b.taskId} className="flex items-center gap-3 p-3 rounded-xl neo-card-inset">
                    <span className="font-code text-xs font-bold text-[var(--accent)] w-14 shrink-0">{formatHour(b.startHour)}</span>
                    <span className="flex-1 text-sm text-[var(--text)] truncate">{b.title}</span>
                    <span className="font-code text-[10px] text-[var(--text-muted)] shrink-0">{b.mins}m</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Habits Heatmap */}
          <div className="neo-card p-6 shrink-0">
            <h3 className="font-display text-xl font-semibold text-[var(--text)] mb-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neo-button flex items-center justify-center">
                <Flame className="w-5 h-5 text-[var(--warning)]" />
              </div>
              Consistency Streak ({streak} days)
            </h3>
            <div className="bg-black/20 p-4 rounded-xl neo-card-inset">
              <Heatmap history={activityHistory} />
            </div>
          </div>
        </div>

        {/* Right Column (Timer & Coach) */}
        <div className="md:col-span-5 flex flex-col gap-8 h-full">
          {/* Focus Timer */}
          <div className="neo-card p-6 flex flex-col items-center justify-center relative overflow-hidden flex-1 shrink-0 min-h-[300px]">
            <div className="relative flex items-center justify-center w-56 h-56 mb-8">
              <div className="absolute inset-0 rounded-full bg-[var(--bg)] dial-ring flex items-center justify-center">
                <div className="absolute inset-4 rounded-full bg-[var(--bg)] dial-inner flex items-center justify-center">
                  <svg className="absolute inset-0 w-full h-full transform -rotate-90 transition-colors duration-300" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" fill="none" r="46" stroke="var(--border-strong)" strokeLinecap="round" strokeWidth="4"></circle>
                    <circle cx="50" cy="50" fill="none" r="46" stroke="var(--accent)" strokeDasharray="289" strokeDashoffset="60" strokeLinecap="round" strokeWidth="4" style={{ filter: 'drop-shadow(0 0 4px var(--accent-soft))' }}></circle>
                  </svg>
                  <div className="text-center z-10 flex flex-col items-center justify-center w-36 h-36 rounded-full bg-[var(--bg)] neo-button">
                    <h1 className="font-display text-5xl font-bold text-[var(--text)] tracking-tighter m-0 leading-none">25<span className="opacity-50">:</span>00</h1>
                    <span className="font-body text-xs font-bold text-[var(--accent)] mt-2 uppercase tracking-widest">Focus</span>
                  </div>
                </div>
              </div>
            </div>
            <Link to="/focus" className="neo-button bg-[var(--bg)] text-[var(--accent)] font-body text-base font-bold py-3 px-10 rounded-2xl flex items-center gap-2">
              <Play className="w-5 h-5" />
              Engage
            </Link>
          </div>

          {/* Coach / Insights — real briefing + ranked next moves */}
          <div className="neo-card p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl neo-button flex items-center justify-center">
                <Brain className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <h3 className="font-display text-xl font-semibold text-[var(--text)]">Coach</h3>
              <Link to="/coach" className="ml-auto text-xs font-medium text-[var(--text-muted)] hover:text-[var(--accent)]">More →</Link>
            </div>

            {/* Pace briefing */}
            <div className="neo-card-inset p-4 rounded-2xl mb-4">
              <p className={cn('font-body text-sm font-semibold', briefingColor)}>{briefing.headline}</p>
              <p className="font-body text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{briefing.detail}</p>
            </div>

            {/* Top next moves */}
            <div className="flex flex-col gap-1">
              {suggestions.slice(0, 3).map((s) => (
                <SuggestionRow key={s.id} suggestion={s} onAct={onAct} />
              ))}
            </div>

            <div className="mt-4 pt-4 flex items-center gap-2 justify-center opacity-60">
              <Bot className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="font-code text-xs font-semibold text-[var(--text-muted)]">Coach learns from your activity — on-device</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Add FAB */}
      <button onClick={() => {
        const title = window.prompt("New Task:");
        if (title) addTask({ title, priority: 'medium', dueDate: todayStr });
      }} aria-label="Quick add task" className="fixed bottom-8 right-8 w-16 h-16 bg-[var(--accent)] text-white rounded-2xl flex items-center justify-center fab-btn transition-all z-50 hover:scale-105">
        <Plus className="w-8 h-8" />
      </button>

    </div>
  );
}
