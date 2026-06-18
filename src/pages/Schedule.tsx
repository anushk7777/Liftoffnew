import { useState, useMemo } from 'react';
import { format, startOfWeek, addDays, isSameDay, parseISO } from 'date-fns';
import { CalendarDays, Clock, Plus, CheckCircle2, Circle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { EmptyState } from '../components/ui';
import { cn } from '../lib/utils';


export default function Schedule() {
  const { tasks, updateTask, setTaskStatus } = useStore();
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Derive weekly dates
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  // Split tasks into scheduled for selected date vs unscheduled
  const scheduledTasks = useMemo(() => {
    return tasks.filter(
      (t) => t.scheduledAt && isSameDay(parseISO(t.scheduledAt), selectedDate) && t.status !== 'done'
    ).sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime());
  }, [tasks, selectedDate]);

  const unscheduledTasks = useMemo(() => {
    return tasks.filter((t) => !t.scheduledAt && t.status !== 'done');
  }, [tasks]);

  const scheduleTask = (taskId: string, date: Date) => {
    // Default to 9:00 AM on the selected date
    const scheduled = new Date(date);
    scheduled.setHours(9, 0, 0, 0);
    updateTask(taskId, { scheduledAt: scheduled.toISOString() });
  };

  const unscheduleTask = (taskId: string) => {
    updateTask(taskId, { scheduledAt: undefined });
  };

  return (
    <div className="h-full flex flex-col gap-6 animate-rise">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display-lg font-bold">Schedule</h1>
          <p className="text-text-muted mt-1">Plan your week and integrate with Google Calendar</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            className="btn btn-secondary"
            onClick={() => window.dispatchEvent(new CustomEvent('liftoff:alarm', { detail: { id: 'test', title: 'Test Alarm Fired!' } }))}
          >
            <Clock className="w-4 h-4" />
            Test Alarm
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => alert("Google Calendar integration needs to be configured with an OAuth Client ID in your Google Cloud Project. Please provide keys to enable two-way sync.")}
          >
            <CalendarDays className="w-4 h-4" />
            Sync Calendar
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(100vh-140px)]">
        
        {/* Left Col: Weekly Calendar & Day's Agenda */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline-md text-lg">{format(weekStart, 'MMMM yyyy')}</h2>
              <div className="flex gap-2">
                <button 
                  onClick={() => setSelectedDate(addDays(selectedDate, -7))}
                  className="p-1 hover:bg-hover rounded text-text-subtle hover:text-text transition-colors"
                >
                  Prev
                </button>
                <button 
                  onClick={() => setSelectedDate(addDays(selectedDate, 7))}
                  className="p-1 hover:bg-hover rounded text-text-subtle hover:text-text transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((date) => {
                const isSelected = isSameDay(date, selectedDate);
                const isToday = isSameDay(date, new Date());
                return (
                  <button
                    key={date.toISOString()}
                    onClick={() => setSelectedDate(date)}
                    className={cn(
                      "flex flex-col items-center p-2 rounded-xl transition-all",
                      isSelected ? "bg-primary text-on-primary shadow-[0_0_15px_-3px_rgba(252,76,2,0.4)]" : "hover:bg-hover",
                      isToday && !isSelected && "border border-primary text-primary"
                    )}
                  >
                    <span className={cn("text-xs font-label-caps", isSelected ? "text-on-primary/80" : "text-text-subtle")}>
                      {format(date, 'EEE')}
                    </span>
                    <span className="text-lg font-bold mt-1">{format(date, 'd')}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card flex-1 p-6 overflow-y-auto custom-scrollbar flex flex-col">
            <h3 className="font-headline-md mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Agenda for {format(selectedDate, 'EEEE, MMM d')}
            </h3>
            
            {scheduledTasks.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <EmptyState
                  icon={<CalendarDays className="w-8 h-8" />}
                  title="No tasks scheduled"
                  hint="Select a task from the backlog to schedule it for today."
                />
              </div>
            ) : (
              <div className="space-y-2">
                {scheduledTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-elevated group">
                    <button onClick={() => setTaskStatus(task.id, 'done')} className="text-text-subtle hover:text-success transition-colors shrink-0">
                      <Circle className="w-5 h-5" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{task.title}</p>
                      <p className="text-xs text-text-subtle flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {format(parseISO(task.scheduledAt!), 'h:mm a')}
                      </p>
                    </div>
                    <button 
                      onClick={() => unscheduleTask(task.id)}
                      className="opacity-0 group-hover:opacity-100 text-xs text-text-muted hover:text-danger transition-all px-2 py-1 rounded hover:bg-hover-strong"
                    >
                      Unschedule
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Unscheduled Backlog */}
        <div className="card p-6 flex flex-col h-full overflow-hidden">
          <h3 className="font-headline-md mb-4">Backlog</h3>
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
            {unscheduledTasks.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="w-8 h-8" />}
                title="All clear"
                hint="No unscheduled tasks."
              />
            ) : (
              unscheduledTasks.map((task) => (
                <div key={task.id} className="p-3 rounded-lg border border-border bg-bg hover:border-border-strong transition-colors flex items-start gap-3 group">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm">{task.title}</p>
                    {task.category && (
                      <span className="chip mt-2">{task.category}</span>
                    )}
                  </div>
                  <button
                    onClick={() => scheduleTask(task.id, selectedDate)}
                    className="p-1.5 rounded-md bg-hover text-text-muted hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                    title={`Schedule for ${format(selectedDate, 'MMM d')}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
