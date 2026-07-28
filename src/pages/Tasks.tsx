import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Trash2,
  Pencil,
  Clock,
  Timer,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Inbox,
  CalendarClock,
  CornerDownRight,
  Check,
} from 'lucide-react';
import { format, isToday, isSameDay, startOfDay, addDays, setHours } from 'date-fns';
import { useStore } from '../store/useStore';
import type { TodoTask, Priority, Status } from '../store/data';
import { cn } from '../lib/utils';
import { PageHeader, Modal, PriorityDot } from '../components/ui';
import { DateTimePicker } from '../components/DateTimePicker';

const toLocalInput = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const DAY_START_HOUR = 7; // 7 AM
const DAY_END_HOUR = 22; // 10 PM
const QUICK_HOURS: { label: string; hour: number }[] = [
  { label: '9a', hour: 9 },
  { label: '12p', hour: 12 },
  { label: '3p', hour: 15 },
  { label: '6p', hour: 18 },
];

const sameDay = (iso: string | undefined, day: Date) => !!iso && isSameDay(new Date(iso), day);
const hourLabel = (h: number) => format(setHours(new Date(), h), 'h a');

/**
 * The Tasks route is a day-planner diary: pick a day, capture tasks onto it,
 * time-block them on an hour timeline, and check them off. Arrow between days
 * like flipping a diary. Backs onto the same task store (dueDate = the day,
 * scheduledAt = the time-block).
 */
export default function Tasks() {
  const { tasks, addTask, updateTask, deleteTask, setTaskStatus } = useStore();
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));
  const [quick, setQuick] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TodoTask | null>(null);
  const [draftDefaults, setDraftDefaults] = useState<Partial<TodoTask> | undefined>(undefined);

  const dayISO = day.toISOString();
  const viewingToday = isToday(day);

  const dayTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          sameDay(t.scheduledAt, day) ||
          sameDay(t.dueDate, day) ||
          (t.status === 'done' && sameDay(t.completedAt, day)),
      ),
    [tasks, day],
  );

  const scheduled = useMemo(
    () =>
      dayTasks
        .filter((t) => t.scheduledAt && t.status !== 'done')
        .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime()),
    [dayTasks],
  );
  const unscheduled = useMemo(
    () => dayTasks.filter((t) => !t.scheduledAt && t.status !== 'done'),
    [dayTasks],
  );
  const doneToday = useMemo(() => dayTasks.filter((t) => t.status === 'done'), [dayTasks]);
  const backlog = useMemo(
    () => tasks.filter((t) => !t.dueDate && !t.scheduledAt && t.status !== 'done'),
    [tasks],
  );

  const total = scheduled.length + unscheduled.length + doneToday.length;
  const progress = total > 0 ? Math.round((doneToday.length / total) * 100) : 0;

  // Expand the hour window to fit any task scheduled outside the default range.
  const hours = useMemo(() => {
    let start = DAY_START_HOUR;
    let end = DAY_END_HOUR;
    for (const t of scheduled) {
      const h = new Date(t.scheduledAt!).getHours();
      if (h < start) start = h;
      if (h > end) end = h;
    }
    const out: number[] = [];
    for (let h = start; h <= end; h++) out.push(h);
    return out;
  }, [scheduled]);

  const atHour = (h: number) => {
    const d = new Date(day);
    d.setHours(h, 0, 0, 0);
    return d;
  };

  const addForDay = () => {
    if (!quick.trim()) return;
    addTask({ title: quick.trim(), dueDate: dayISO, priority: 'medium' });
    setQuick('');
  };
  const scheduleAt = (t: TodoTask, h: number) => updateTask(t.id, { scheduledAt: atHour(h).toISOString(), dueDate: dayISO });
  const unschedule = (t: TodoTask) => updateTask(t.id, { scheduledAt: undefined });
  const moveToDay = (t: TodoTask) => updateTask(t.id, { dueDate: dayISO });
  const toggleDone = (t: TodoTask) => setTaskStatus(t.id, t.status === 'done' ? 'todo' : 'done');

  const openNew = (defaults?: Partial<TodoTask>) => {
    setEditing(null);
    setDraftDefaults(defaults ?? { dueDate: dayISO });
    setModalOpen(true);
  };
  const openEdit = (t: TodoTask) => {
    setEditing(t);
    setDraftDefaults(undefined);
    setModalOpen(true);
  };

  return (
    <div className="animate-rise">
      <PageHeader
        title="Diary"
        subtitle="Plan your day, hour by hour."
        icon={<CalendarDays className="w-5 h-5" />}
        actions={
          <button onClick={() => openNew()} className="btn btn-primary">
            <Plus className="w-4 h-4" /> New task
          </button>
        }
      />

      {/* Date navigator + day progress */}
      <div className="glass-panel rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDay((d) => startOfDay(addDays(d, -1)))}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-hover transition-colors"
            title="Previous day"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center min-w-[9rem]">
            <p className="font-headline-md text-on-surface leading-tight">{format(day, 'EEEE')}</p>
            <p className="font-mono-data text-xs text-on-surface-variant">{format(day, 'MMMM d')}</p>
          </div>
          <button
            onClick={() => setDay((d) => startOfDay(addDays(d, 1)))}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-hover transition-colors"
            title="Next day"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        {!viewingToday && (
          <button
            onClick={() => setDay(startOfDay(new Date()))}
            className="text-xs font-label-caps px-3 py-1.5 rounded-lg border border-cozy bg-cozy-soft text-primary hover:bg-accent-soft transition-colors"
          >
            Today
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono-data text-xs text-on-surface-variant">
            {doneToday.length}/{total} done
          </span>
          <div className="w-28 h-2 rounded-full bg-hover overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* Capture box for the selected day */}
      <div className="relative group mb-6">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-cozy-soft to-cozy-soft rounded-2xl blur opacity-0 group-focus-within:opacity-40 transition duration-500" />
        <div className="relative glass-panel rounded-2xl flex items-center p-2 pl-5 ring-1 ring-border focus-within:ring-cozy">
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addForDay()}
            placeholder={viewingToday ? 'Capture a task for today…' : `Capture a task for ${format(day, 'MMM d')}…`}
            className="flex-1 bg-transparent border-none focus:ring-0 text-base text-on-surface placeholder:text-text-subtle"
          />
          <button
            onClick={addForDay}
            className="bg-primary text-on-primary p-2.5 rounded-xl hover:scale-105 active:scale-95 transition-transform"
            aria-label="Add task to this day"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Timeline */}
        <div className="lg:col-span-8 glass-panel rounded-2xl p-5">
          <h3 className="font-label-caps text-on-surface-variant mb-4 flex items-center gap-2">
            <CalendarClock className="w-4 h-4" /> Timeline
          </h3>
          <div className="flex flex-col">
            {hours.map((h) => {
              const items = scheduled.filter((t) => new Date(t.scheduledAt!).getHours() === h);
              return (
                <div key={h} className="flex gap-3 group/hour animate-rise" style={{ animationDelay: `${(h - hours[0]) * 22}ms` }}>
                  <div className="w-14 shrink-0 text-right pt-2 font-mono-data text-[11px] text-text-subtle">
                    {hourLabel(h)}
                  </div>
                  <div className="flex-1 border-l border-border pl-3 min-h-[3.25rem] py-2 space-y-2">
                    {items.map((t) => (
                      <ScheduledItem
                        key={t.id}
                        task={t}
                        onToggle={() => toggleDone(t)}
                        onEdit={() => openEdit(t)}
                        onUnschedule={() => unschedule(t)}
                      />
                    ))}
                    <button
                      onClick={() => openNew({ scheduledAt: atHour(h).toISOString(), dueDate: dayISO, priority: 'medium' })}
                      className="opacity-0 group-hover/hour:opacity-100 transition-opacity text-xs text-text-subtle hover:text-primary inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> add at {hourLabel(h)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side rail: unscheduled-for-day + backlog */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="glass-panel rounded-2xl p-5">
            <h3 className="font-label-caps text-on-surface-variant mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" /> No time set · {unscheduled.length}
            </h3>
            {unscheduled.length === 0 ? (
              <p className="text-sm text-text-subtle py-2">Everything for this day has a time block.</p>
            ) : (
              <div className="space-y-2">
                {unscheduled.map((t) => (
                  <LooseItem
                    key={t.id}
                    task={t}
                    onToggle={() => toggleDone(t)}
                    onEdit={() => openEdit(t)}
                    onDelete={() => deleteTask(t.id)}
                    quickHours={QUICK_HOURS}
                    onSchedule={(h) => scheduleAt(t, h)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="glass-panel rounded-2xl p-5">
            <h3 className="font-label-caps text-on-surface-variant mb-3 flex items-center gap-2">
              <Inbox className="w-4 h-4" /> Backlog · {backlog.length}
            </h3>
            {backlog.length === 0 ? (
              <p className="text-sm text-text-subtle py-2">No undated tasks waiting.</p>
            ) : (
              <div className="space-y-2">
                {backlog.slice(0, 12).map((t) => (
                  <BacklogItem
                    key={t.id}
                    task={t}
                    dayLabel={viewingToday ? 'today' : format(day, 'MMM d')}
                    onMove={() => moveToDay(t)}
                    onEdit={() => openEdit(t)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Completed on this day */}
      {doneToday.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 mt-6">
          <h3 className="font-label-caps text-on-surface-variant mb-3 flex items-center gap-2">
            <Check className="w-4 h-4" /> Done · {doneToday.length}
          </h3>
          <div className="space-y-2">
            {doneToday.map((t) => (
              <LooseItem
                key={t.id}
                task={t}
                onToggle={() => toggleDone(t)}
                onEdit={() => openEdit(t)}
                onDelete={() => deleteTask(t.id)}
              />
            ))}
          </div>
        </div>
      )}

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        defaults={draftDefaults}
        onSave={(data) => {
          if (editing) updateTask(editing.id, data);
          else addTask({ title: data.title || 'Untitled', ...data });
          setModalOpen(false);
        }}
      />
    </div>
  );
}

function StatusToggle({ status, onToggle }: { status: Status; onToggle: () => void }) {
  const done = status === 'done';
  return (
    <button
      onClick={onToggle}
      title={done ? 'Mark not done' : 'Mark done'}
      className={cn(
        'mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all hover:scale-110 active:scale-95',
        done
          ? 'bg-primary border-primary text-on-primary shadow-none'
          : status === 'doing'
            ? 'border-secondary text-secondary bg-cozy-soft'
            : 'border-border-strong text-transparent hover:border-primary bg-elevated',
      )}
    >
      <Check className="w-3 h-3" />
    </button>
  );
}

function ScheduledItem({
  task,
  onToggle,
  onEdit,
  onUnschedule,
}: {
  task: TodoTask;
  onToggle: () => void;
  onEdit: () => void;
  onUnschedule: () => void;
}) {
  return (
    <div className="group/item glass-panel rounded-xl px-3 py-2 flex items-center gap-3 hover:border-border-strong transition-colors">
      <StatusToggle status={task.status} onToggle={onToggle} />
      <span className="font-mono-data text-[11px] text-primary w-14 shrink-0">{format(new Date(task.scheduledAt!), 'h:mm a')}</span>
      <PriorityDot priority={task.priority} />
      <button onClick={onEdit} className="flex-1 min-w-0 text-left text-sm text-on-surface hover:text-primary truncate">
        {task.title}
      </button>
      <button onClick={onUnschedule} title="Remove time" className="opacity-0 group-hover/item:opacity-100 transition-opacity p-1 rounded text-on-surface-variant hover:text-danger">
        <Clock className="w-3.5 h-3.5" />
      </button>
      <button onClick={onEdit} title="Edit" className="opacity-0 group-hover/item:opacity-100 transition-opacity p-1 rounded text-on-surface-variant hover:text-primary">
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function LooseItem({
  task,
  onToggle,
  onEdit,
  onDelete,
  quickHours,
  onSchedule,
}: {
  task: TodoTask;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  quickHours?: { label: string; hour: number }[];
  onSchedule?: (h: number) => void;
}) {
  const done = task.status === 'done';
  return (
    <div className="group/item glass-panel rounded-xl px-3 py-2 flex items-center gap-3 hover:border-border-strong transition-colors">
      <StatusToggle status={task.status} onToggle={onToggle} />
      <PriorityDot priority={task.priority} />
      <button
        onClick={onEdit}
        className={cn('flex-1 min-w-0 text-left text-sm truncate', done ? 'line-through text-text-subtle' : 'text-on-surface hover:text-primary')}
      >
        {task.title}
      </button>
      {quickHours && onSchedule && (
        <div className="hidden group-hover/item:flex items-center gap-1">
          {quickHours.map((q) => (
            <button
              key={q.hour}
              onClick={() => onSchedule(q.hour)}
              title={`Schedule at ${hourLabel(q.hour)}`}
              className="font-mono-data text-[11px] px-1.5 py-0.5 rounded bg-hover text-on-surface-variant hover:bg-accent-soft hover:text-primary transition-colors"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}
      <button onClick={onDelete} title="Delete" className="opacity-0 group-hover/item:opacity-100 transition-opacity p-1 rounded text-on-surface-variant hover:text-danger">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function BacklogItem({
  task,
  dayLabel,
  onMove,
  onEdit,
}: {
  task: TodoTask;
  dayLabel: string;
  onMove: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="group/item glass-panel rounded-xl px-3 py-2 flex items-center gap-2 hover:border-border-strong transition-colors">
      <PriorityDot priority={task.priority} />
      <button onClick={onEdit} className="flex-1 min-w-0 text-left text-sm text-on-surface hover:text-primary truncate">
        {task.title}
      </button>
      <button
        onClick={onMove}
        title={`Move to ${dayLabel}`}
        className="shrink-0 inline-flex items-center gap-1 font-mono-data text-[11px] px-2 py-1 rounded-lg bg-hover text-on-surface-variant hover:bg-accent-soft hover:text-primary transition-colors"
      >
        <CornerDownRight className="w-3 h-3" /> {dayLabel}
      </button>
    </div>
  );
}

export function TaskModal({
  open,
  onClose,
  editing,
  defaults,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: TodoTask | null;
  defaults?: Partial<TodoTask>;
  onSave: (data: Partial<TodoTask>) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit task' : 'New task'} maxWidth="max-w-2xl">
      {/* Remount on open / when switching target so fields initialise from props */}
      {open && (
        <TaskForm
          key={editing?.id ?? defaults?.scheduledAt ?? defaults?.dueDate ?? 'new'}
          editing={editing}
          defaults={defaults}
          onClose={onClose}
          onSave={onSave}
        />
      )}
    </Modal>
  );
}

function TaskForm({
  editing,
  defaults,
  onClose,
  onSave,
}: {
  editing: TodoTask | null;
  defaults?: Partial<TodoTask>;
  onClose: () => void;
  onSave: (data: Partial<TodoTask>) => void;
}) {
  const navigate = useNavigate();
  const setFocusTaskId = useStore((s) => s.setFocusTaskId);
  const base = editing ?? defaults ?? null;
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [title, setTitle] = useState(base?.title ?? '');
  const [notes, setNotes] = useState(base?.notes ?? '');
  const [priority, setPriority] = useState<Priority>(base?.priority ?? 'medium');
  const [status, setStatus] = useState<Status>(base?.status ?? 'todo');
  const [category, setCategory] = useState(base?.category ?? '');
  const [estimate, setEstimate] = useState(base?.estimate ?? '');
  const [dueDate, setDueDate] = useState(
    base?.dueDate ? format(new Date(base.dueDate), 'yyyy-MM-dd') : '',
  );
  const [scheduledAt, setScheduledAt] = useState(
    base?.scheduledAt ? toLocalInput(new Date(base.scheduledAt)) : '',
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const sched = scheduledAt ? new Date(scheduledAt) : null;
    onSave({
      title: title.trim(),
      notes: notes.trim() || undefined,
      priority,
      status,
      category: category.trim() || undefined,
      estimate: estimate.trim() || undefined,
      scheduledAt: sched ? sched.toISOString() : undefined,
      dueDate: sched
        ? startOfDay(sched).toISOString()
        : dueDate
          ? // parse the yyyy-MM-dd input as LOCAL midnight (not UTC) so the day
            // doesn't shift by one for users east/west of UTC
            startOfDay(new Date(`${dueDate}T00:00:00`)).toISOString()
          : undefined,
    });
  };

  const quickDate = (label: string, value: string) => (
    <button
      type="button"
      onClick={() => setDueDate(value)}
      className={cn(
        'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
        dueDate === value
          ? 'bg-accent text-[var(--accent-text)]'
          : 'bg-elevated border border-border text-ink-muted hover:text-ink hover:bg-hover',
      )}
    >
      {label}
    </button>
  );

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = format(nextWeek, 'yyyy-MM-dd');

  return (
    <form onSubmit={submit} className="space-y-3">
        {/* Title */}
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to get done?"
          className="input text-base"
        />

        {/* Date & Time Scheduling using DateTimePicker */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Schedule</span>
          <div className="flex flex-wrap items-center gap-2">
            {quickDate('Today', todayStr)}
            {quickDate('Tomorrow', tomorrowStr)}
            {quickDate('Next week', nextWeekStr)}
          </div>
          <DateTimePicker
            value={scheduledAt || (dueDate ? `${dueDate}T00:00:00` : '')}
            onChange={(val) => {
              if (!val) {
                setDueDate('');
                setScheduledAt('');
              } else {
                setDueDate(val.slice(0, 10));
                if (val.includes('T00:00:00')) {
                  setScheduledAt(''); // Only date
                } else {
                  setScheduledAt(val); // Date + Time
                }
              }
            }}
            className="mt-2"
          />
        </div>

        {/* Priority + status as segmented chips (no native selects) */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex p-0.5 rounded-full bg-elevated border border-border">
            {(['low', 'medium', 'high'] as Priority[]).map((p) => {
              const dot = p === 'high' ? 'var(--danger)' : p === 'medium' ? 'var(--warning)' : 'var(--text-subtle)';
              const sel = priority === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors',
                    sel ? 'text-[var(--text)]' : 'text-[var(--text-muted)]',
                  )}
                  style={sel ? { background: 'var(--surface)', boxShadow: 'var(--shadow-sm)' } : undefined}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
                  {p}
                </button>
              );
            })}
          </div>
          <div className="flex p-0.5 rounded-full bg-elevated border border-border">
            {([['todo', 'To do'], ['doing', 'Doing'], ['done', 'Done']] as [Status, string][]).map(([s, label]) => {
              const sel = status === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors',
                    sel ? 'text-[var(--text)]' : 'text-[var(--text-muted)]',
                  )}
                  style={sel ? { background: 'var(--surface)', boxShadow: 'var(--shadow-sm)' } : undefined}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category"
            className="input !w-28 !py-1.5 !px-3 !rounded-full text-xs"
          />
          <input
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            placeholder="Estimate (30m)"
            className="input !w-36 !py-1.5 !px-3 !rounded-full text-xs"
          />
        </div>

        {/* Description */}
        <div className="pt-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-1 block">Description</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add details, links, sub-steps…"
            rows={3}
            className="input resize-y text-sm w-full"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {editing && (
            <button
              type="button"
              onClick={() => {
                onSave({ title: title.trim() || editing.title, notes });
                setFocusTaskId(editing.id);
                onClose();
                navigate('/focus');
              }}
              className="btn btn-secondary mr-auto"
            >
              <Timer className="w-4 h-4" /> Focus on this
            </button>
          )}
          <button type="button" onClick={onClose} className={cn('btn btn-secondary', !editing && 'ml-auto')}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {editing ? 'Save' : 'Add task'}
          </button>
        </div>
    </form>
  );
}
