import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, startOfDay, isToday } from 'date-fns';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';
import { buildProfile, getSuggestions } from '../lib/coach';
import type { CoachState } from '../lib/coach';
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
          <span className="material-symbols-outlined text-[14px]">schedule</span> 
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
    tasks, addTask, cycleTaskStatus, streak, activityHistory, targetDate,
    phases, focusSessions, ideas, pomodoro, habits, habitLog
  } = useStore();

  const [quickTask, setQuickTask] = useState('');

  const state: CoachState = { phases, tasks, focusSessions, ideas, activityHistory, streak, pomodoro, habits, habitLog, targetDate };
  const suggestions = useMemo(() => getSuggestions(state, buildProfile(state)), [state]);

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

  const handleAddTask = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!quickTask.trim()) return;
    addTask({ title: quickTask.trim(), dueDate: todayStr, priority: 'medium' });
    setQuickTask('');
  };

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
        
        {/* Left Column (Tasks & Habits) */}
        <div className="md:col-span-7 flex flex-col gap-8 h-full">
          {/* Tasks */}
          <div className="neo-card p-6 flex-1 flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-center mb-6 z-10">
              <h3 className="font-display text-xl font-semibold text-[var(--text)] flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl neo-button flex items-center justify-center">
                  <span className="material-symbols-outlined text-[var(--accent)]">format_list_bulleted</span>
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
                <button onClick={() => handleAddTask()} className="w-10 h-10 rounded-xl neo-button flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                  <span className="material-symbols-outlined">add</span>
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

          {/* Habits Heatmap */}
          <div className="neo-card p-6 shrink-0">
            <h3 className="font-display text-xl font-semibold text-[var(--text)] mb-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neo-button flex items-center justify-center">
                <span className="material-symbols-outlined text-[var(--warning)]">local_fire_department</span>
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
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
              Engage
            </Link>
          </div>

          {/* Coach / Insights */}
          <div className="neo-card p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl neo-button flex items-center justify-center">
                <span className="material-symbols-outlined text-[var(--accent)] text-[20px]">psychology</span>
              </div>
              <h3 className="font-display text-xl font-semibold text-[var(--text)]">Daily Insight</h3>
            </div>
            <div className="flex-1 flex flex-col gap-4">
              <div className="neo-card-inset p-4 rounded-2xl rounded-tl-none max-w-[90%]">
                <p className="font-body text-sm text-[var(--text)] leading-relaxed">
                  {suggestions[0]?.title || "Commander, your evening velocity is optimal. Keep pushing forward."}
                </p>

              </div>
              <div className="self-end bg-[var(--accent)] text-black p-4 rounded-2xl rounded-tr-none neo-button max-w-[90%]">
                <p className="font-body text-sm font-semibold">Understood. Context set.</p>
              </div>
            </div>
            <div className="mt-6 pt-4 flex items-center gap-2 justify-center opacity-60">
              <span className="material-symbols-outlined text-[var(--text-muted)] text-[16px]">smart_toy</span>
              <span className="font-code text-xs font-semibold text-[var(--text-muted)]">Coach AI is active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Add FAB */}
      <button onClick={() => {
        const title = window.prompt("New Task:");
        if(title) addTask({ title, priority: 'medium', dueDate: todayStr });
      }} className="fixed bottom-8 right-8 w-16 h-16 bg-[var(--accent)] text-white rounded-2xl flex items-center justify-center fab-btn transition-all z-50 hover:scale-105">
        <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>add</span>
      </button>
      
    </div>
  );
}
