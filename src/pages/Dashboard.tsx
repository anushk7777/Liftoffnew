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
  RefreshCw,
  MoreHorizontal
} from 'lucide-react';
import { format, startOfDay, isToday, differenceInCalendarDays } from 'date-fns';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';
import { countRoadmap } from '../lib/roadmap';
import { buildProfile, getSuggestions } from '../lib/coach';
import type { CoachState } from '../lib/coach';
import { CoachCard } from '../components/Coach';
import { Heatmap } from '../components/Heatmap';
import type { TodoTask } from '../store/data';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Winding down';
}

function TaskCard({ task, onComplete }: { task: TodoTask, onComplete: () => void }) {
  const isDone = task.status === 'done';
  const isDoing = task.status === 'doing';
  
  return (
    <div className={cn(
      "glass-panel p-5 rounded-xl group transition-all duration-500 cursor-pointer relative overflow-hidden",
      isDoing ? "border-primary/40 ring-1 ring-primary/20 glow-indigo" : "hover:border-primary/40",
      isDone && "opacity-60 hover:opacity-100"
    )} onClick={onComplete}>
      {isDoing && (
        <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity">
          <RefreshCw className="w-4 h-4 animate-spin text-primary" />
        </div>
      )}
      <div className="flex justify-between items-start mb-3">
        <span className={cn("font-mono-data text-[10px] uppercase tracking-widest", isDone ? "text-on-surface-variant/40 line-through" : "text-on-surface-variant")}>
          LF-{task.id.slice(0, 4)}
        </span>
        {!isDone && (
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-0.5 rounded-full border",
            task.priority === 'high' ? "border-secondary/30 bg-secondary/10 glow-cyan text-secondary" :
            task.priority === 'medium' ? "border-primary/30 bg-primary/10 text-primary" :
            "border-white/10 bg-white/5 text-on-surface-variant"
          )}>
            <div className={cn("w-1.5 h-1.5 rounded-full", task.priority === 'high' ? 'bg-secondary' : task.priority === 'medium' ? 'bg-primary' : 'bg-outline')}></div>
            <span className="text-[10px] font-label-caps">{task.priority}</span>
          </div>
        )}
        {isDone && <Check className="w-4 h-4 text-primary" />}
      </div>
      
      <h4 className={cn("font-headline-md text-base mb-2 transition-colors", isDone ? "text-on-surface-variant line-through" : "text-on-surface group-hover:text-primary")}>
        {task.title}
      </h4>
      {task.category && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] px-2 py-0.5 bg-white/5 text-on-surface-variant rounded uppercase">{task.category}</span>
        </div>
      )}
      
      <div className="flex items-center justify-between pt-3 border-t border-white/5">
        <span className="text-[11px] font-mono-data text-on-surface-variant/70">
          {task.estimate ? `EST: ${task.estimate}` : task.dueDate ? `DUE: ${format(new Date(task.dueDate), 'MMM d')}` : 'NO ETA'}
        </span>
        <MoreHorizontal className="w-4 h-4 text-on-surface-variant" />
      </div>
    </div>
  );
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
      });
  }, [tasks, todayStr]);

  const todoTasks = todaysTasks.filter(t => t.status === 'todo');
  const doingTasks = todaysTasks.filter(t => t.status === 'doing');
  const doneTasks = todaysTasks.filter(t => t.status === 'done');

  const focusToday = useMemo(
    () =>
      focusSessions
        .filter((s) => s.kind === 'focus' && isToday(new Date(s.date)))
        .reduce((acc, s) => acc + s.durationMins, 0),
    [focusSessions],
  );

  const roadmap = useMemo(() => countRoadmap(phases), [phases]);
  const todayLogged = activityHistory.some((l) => l.date === todayStr);

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTask.trim()) return;
    addTask({ title: quickTask.trim(), dueDate: todayStr, priority: 'medium' });
    setQuickTask('');
  };

  return (
    <div className="animate-rise pb-24">
      {/* Hero / QuickAdd Bar */}
      <div className="max-w-4xl mx-auto mb-16">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-sm text-on-surface-variant font-medium flex items-center gap-1.5 mb-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              {format(new Date(), 'EEEE, MMMM d')}
            </p>
            <h1 className="font-display-lg text-4xl md:text-5xl font-bold tracking-tight text-on-surface">
              {greeting()}.
            </h1>
          </div>
          <div className="flex gap-4">
            <div className="glass-panel px-4 py-3 rounded-xl flex items-center gap-3">
              <Flame className={cn("w-5 h-5", todayLogged ? "text-warning" : "text-on-surface-variant")} />
              <div>
                <p className="text-xl font-bold font-display-lg leading-none">{streak}</p>
                <p className="text-[10px] font-label-caps text-on-surface-variant">DAY STREAK</p>
              </div>
            </div>
            <div className="glass-panel px-4 py-3 rounded-xl flex items-center gap-3">
              <Timer className="w-5 h-5 text-secondary" />
              <div>
                <p className="text-xl font-bold font-display-lg leading-none">{Math.floor(focusToday / 60)}h {focusToday % 60}m</p>
                <p className="text-[10px] font-label-caps text-on-surface-variant">FOCUS TODAY</p>
              </div>
            </div>
          </div>
        </header>

        <form onSubmit={handleAddTask} className="relative group z-10">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary to-secondary rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-500"></div>
          <div className="relative glass-panel rounded-2xl flex items-center p-2 pr-4 ring-1 ring-white/10 focus-within:ring-primary/50">
            <input
              value={quickTask}
              onChange={(e) => setQuickTask(e.target.value)}
              className="flex-1 bg-transparent border-none focus:ring-0 text-lg px-4 font-body-lg text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none"
              placeholder="Ignite a new task..."
              type="text"
            />
            <div className="flex items-center gap-3">
              <span className="font-mono-data text-on-surface-variant/50 text-[11px] border border-white/10 px-2 py-1 rounded hidden sm:inline-block">Enter ↵</span>
              <button type="submit" className="bg-primary-container text-on-primary-container p-2 md:p-3 rounded-xl hover:scale-105 active:scale-95 transition-transform">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Task Board */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start mb-16">
        {/* TODO */}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-outline"></div>
              <h3 className="font-label-caps text-on-surface-variant">TODO</h3>
            </div>
            <span className="font-mono-data text-on-surface-variant/60">{todoTasks.length < 10 ? '0' + todoTasks.length : todoTasks.length}</span>
          </div>
          <div className="space-y-4">
            {todoTasks.map(task => (
              <TaskCard key={task.id} task={task} onComplete={() => cycleTaskStatus(task.id)} />
            ))}
            {todoTasks.length === 0 && (
              <div className="p-6 text-center border border-dashed border-white/10 rounded-xl text-on-surface-variant/50 text-sm">
                No pending tasks
              </div>
            )}
          </div>
        </div>

        {/* DOING */}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-secondary"></div>
              <h3 className="font-label-caps text-on-surface-variant">DOING</h3>
            </div>
            <span className="font-mono-data text-on-surface-variant/60">{doingTasks.length < 10 ? '0' + doingTasks.length : doingTasks.length}</span>
          </div>
          <div className="space-y-4">
            {doingTasks.map(task => (
              <TaskCard key={task.id} task={task} onComplete={() => cycleTaskStatus(task.id)} />
            ))}
            {doingTasks.length === 0 && (
              <div className="p-6 text-center border border-dashed border-white/10 rounded-xl text-on-surface-variant/50 text-sm">
                Ready to initiate
              </div>
            )}
          </div>
        </div>

        {/* DONE */}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-primary/40"></div>
              <h3 className="font-label-caps text-on-surface-variant">DONE</h3>
            </div>
            <span className="font-mono-data text-on-surface-variant/60">{doneTasks.length < 10 ? '0' + doneTasks.length : doneTasks.length}</span>
          </div>
          <div className="space-y-4">
            {doneTasks.map(task => (
              <TaskCard key={task.id} task={task} onComplete={() => cycleTaskStatus(task.id)} />
            ))}
            {doneTasks.length === 0 && (
              <div className="p-6 text-center border border-dashed border-white/10 rounded-xl text-on-surface-variant/50 text-sm">
                Awaiting completion
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Auxiliary Systems */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="glass-panel p-6 md:p-8 rounded-2xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-display-lg text-xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Coach Telemetry
            </h3>
            <Link to="/coach" className="text-xs text-primary hover:text-primary-container flex items-center gap-1 transition-colors">
              Full analysis <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-4">
            {suggestions.slice(0, 2).map((s, i) => (
              <CoachCard key={i} suggestion={s} />
            ))}
          </div>
        </div>

        <div className="glass-panel p-6 md:p-8 rounded-2xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-display-lg text-xl font-bold flex items-center gap-2">
              <Flame className="w-5 h-5 text-warning" />
              Activity Heatmap
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleLogDay('minimum')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 transition-colors"
              >
                Log +1
              </button>
            </div>
          </div>
          <div className="bg-black/20 p-4 rounded-xl border border-white/5">
            <Heatmap history={activityHistory} color="var(--primary)" />
          </div>
        </div>
      </div>
    </div>
  );
}
