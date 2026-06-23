import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Check,
  Trash2,
  Pencil,
  CheckSquare,
  Circle,
  CircleDot,
  Clock,
  Calendar,
  Timer,
} from 'lucide-react';
import { format, isToday, isPast, startOfDay } from 'date-fns';
import { useStore } from '../store/useStore';
import { buildICS, downloadICS, googleCalendarUrl } from '../lib/ics';
import type { TodoTask, Priority, Status } from '../store/data';
import { cn } from '../lib/utils';
import { springSoft } from '../lib/motion';
import { PageHeader, EmptyState, Modal, PriorityDot } from '../components/ui';
import { DateTimePicker } from '../components/DateTimePicker';

const toLocalInput = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

type Filter = 'all' | 'todo' | 'doing' | 'done';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'In progress' },
  { key: 'done', label: 'Done' },
];

export default function Tasks() {
  const { tasks, addTask, updateTask, deleteTask, cycleTaskStatus } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TodoTask | null>(null);

  const filtered = useMemo(() => {
    const base = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);
    const prioRank = { high: 0, medium: 1, low: 2 };
    return [...base].sort((a, b) => {
      const stRank = { doing: 0, todo: 1, done: 2 };
      if (stRank[a.status] !== stRank[b.status]) return stRank[a.status] - stRank[b.status];
      return prioRank[a.priority] - prioRank[b.priority];
    });
  }, [tasks, filter]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      todo: tasks.filter((t) => t.status === 'todo').length,
      doing: tasks.filter((t) => t.status === 'doing').length,
      done: tasks.filter((t) => t.status === 'done').length,
    }),
    [tasks],
  );

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (t: TodoTask) => {
    setEditing(t);
    setModalOpen(true);
  };

  const handleCycle = (t: TodoTask) => {
    cycleTaskStatus(t.id);
  };

  return (
    <div className="animate-rise">
      <PageHeader
        title="Tasks"
        subtitle="Everything you need to do, in one place."
        icon={<CheckSquare className="w-5 h-5" />}
        actions={
          <button onClick={openNew} className="btn btn-primary">
            <Plus className="w-4 h-4" /> New task
          </button>
        }
      />

      {/* Filter bar */}
      <div className="flex items-center gap-1 mb-6 p-1.5 rounded-2xl bg-black/20 border border-white/5 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300',
              filter === f.key ? 'bg-primary/10 text-primary border border-primary/20 glow-indigo shadow-md' : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5 border border-transparent',
            )}
          >
            {f.label}
            <span className={cn("ml-2 text-[10px] font-mono-data px-1.5 py-0.5 rounded", filter === f.key ? "bg-primary/20" : "bg-white/5")}>{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="w-7 h-7" />}
          title="No tasks here yet"
          hint="Create a task to start building momentum toward your goal."
        />
      ) : (
        <motion.div layout className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {filtered.map((task) => (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={springSoft}
              >
                <TaskRow
                  task={task}
                  onCycle={() => handleCycle(task)}
                  onEdit={() => openEdit(task)}
                  onDelete={() => deleteTask(task.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        onSave={(data) => {
          if (editing) updateTask(editing.id, data);
          else addTask({ title: data.title || 'Untitled', ...data });
          setModalOpen(false);
        }}
      />
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'done') return <Check className="w-3.5 h-3.5" />;
  if (status === 'doing') return <CircleDot className="w-3.5 h-3.5" />;
  return <Circle className="w-3.5 h-3.5" />;
}

function TaskRow({
  task,
  onCycle,
  onEdit,
  onDelete,
}: {
  task: TodoTask;
  onCycle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const overdue =
    task.dueDate &&
    task.status !== 'done' &&
    isPast(new Date(task.dueDate)) &&
    !isToday(new Date(task.dueDate));

  return (
    <div className={cn(
      "glass-panel group p-5 rounded-xl flex items-start gap-4 transition-all duration-300 relative overflow-hidden",
      task.status === 'doing' ? "border-primary/40 ring-1 ring-primary/20 glow-indigo" : "hover:border-primary/40",
      task.status === 'done' && "opacity-60 hover:opacity-100"
    )}>
      {task.status === 'doing' && (
        <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity">
          <Clock className="w-4 h-4 animate-spin text-primary" />
        </div>
      )}
      <button
        onClick={onCycle}
        title="Cycle status"
        className={cn(
          'mt-1 w-6 h-6 rounded-full border flex items-center justify-center transition-all shrink-0 hover:scale-110 active:scale-95',
          task.status === 'done'
            ? 'bg-primary border-primary text-on-primary shadow-[0_0_10px_rgba(192,193,255,0.6)]'
            : task.status === 'doing'
              ? 'border-secondary text-secondary glow-cyan bg-secondary/10'
              : 'border-on-surface-variant/50 text-on-surface-variant hover:border-primary hover:text-primary bg-black/20',
        )}
      >
        <StatusIcon status={task.status} />
      </button>

      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={onEdit}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onEdit();
          }
        }}
      >
        <div className="flex items-center gap-3">
          <PriorityDot priority={task.priority} />
          <p
            className={cn(
              'text-base font-headline-md truncate transition-colors',
              task.status === 'done' ? 'line-through text-on-surface-variant/50' : 'text-on-surface group-hover:text-primary',
            )}
          >
            {task.title}
          </p>
        </div>
        {(task.notes || task.category || task.dueDate || task.estimate || task.scheduledAt) && (
          <div className="flex flex-wrap items-center gap-3 mt-2.5 text-[11px] font-mono-data text-on-surface-variant">
            {task.category && <span className="px-2 py-0.5 bg-white/5 rounded text-on-surface">{task.category}</span>}
            {task.estimate && <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {task.estimate}</span>}
            {task.scheduledAt ? (
              <span className={cn('inline-flex items-center gap-1', overdue && 'text-danger font-medium')}>
                <Clock className="w-3 h-3" />
                {format(new Date(task.scheduledAt), 'MMM d, h:mm a')}
              </span>
            ) : (
              task.dueDate && (
                <span className={cn(overdue && 'text-danger font-medium')}>
                  {overdue ? 'Overdue · ' : 'Due '}
                  {format(new Date(task.dueDate), 'MMM d')}
                </span>
              )
            )}
            {task.notes && <span className="truncate max-w-[200px] font-body-sm text-on-surface-variant/70">— {task.notes}</span>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {task.scheduledAt && (
          <>
            <button
              onClick={() => {
                const icsStr = buildICS({
                  title: task.title,
                  description: task.notes || '',
                  start: task.scheduledAt!,
                  durationMins: 30,
                });
                downloadICS(`task-${task.id}.ics`, icsStr);
              }}
              className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-white/5 transition-colors"
              title="Download .ics"
            >
              <Calendar className="w-4 h-4" />
            </button>
            <a
              href={googleCalendarUrl({
                title: task.title,
                description: task.notes || '',
                start: task.scheduledAt!,
                durationMins: 30,
              })}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-white/5 text-[10px] font-label-caps transition-colors"
              title="Add to Google Calendar"
            >
              GCAL
            </a>
          </>
        )}
        <button onClick={onEdit} className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-white/5 transition-colors" title="Edit task">
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg text-on-surface-variant hover:text-danger hover:bg-danger/10 transition-colors"
          title="Delete task"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function TaskModal({
  open,
  onClose,
  editing,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: TodoTask | null;
  onSave: (data: Partial<TodoTask>) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit task' : 'New task'} maxWidth="max-w-2xl">
      {/* Remount on open / when switching target so fields initialise from props */}
      {open && (
        <TaskForm
          key={editing?.id ?? 'new'}
          editing={editing}
          onClose={onClose}
          onSave={onSave}
        />
      )}
    </Modal>
  );
}

function TaskForm({
  editing,
  onClose,
  onSave,
}: {
  editing: TodoTask | null;
  onClose: () => void;
  onSave: (data: Partial<TodoTask>) => void;
}) {
  const navigate = useNavigate();
  const setFocusTaskId = useStore((s) => s.setFocusTaskId);
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [priority, setPriority] = useState<Priority>(editing?.priority ?? 'medium');
  const [status, setStatus] = useState<Status>(editing?.status ?? 'todo');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [estimate, setEstimate] = useState(editing?.estimate ?? '');
  const [dueDate, setDueDate] = useState(
    editing?.dueDate ? format(new Date(editing.dueDate), 'yyyy-MM-dd') : '',
  );
  const [scheduledAt, setScheduledAt] = useState(
    editing?.scheduledAt ? toLocalInput(new Date(editing.scheduledAt)) : '',
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

        {/* Compact row: Priority + Status + Category + Estimate */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex items-center gap-1">
            {(['low', 'medium', 'high'] as Priority[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={cn(
                  'px-2 py-1 rounded-md text-xs font-medium capitalize transition-colors',
                  priority === p
                    ? p === 'high' ? 'bg-danger/20 text-danger border border-danger/30'
                      : p === 'medium' ? 'bg-warning/20 text-warning border border-warning/30'
                      : 'bg-elevated text-ink-muted border border-border'
                    : 'bg-transparent text-ink-subtle hover:bg-hover border border-transparent',
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="input !w-auto !py-1 !px-2 text-xs"
          >
            <option value="todo">To do</option>
            <option value="doing">In progress</option>
            <option value="done">Done</option>
          </select>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category"
            className="input !w-24 !py-1 !px-2 text-xs"
          />
          <input
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            placeholder="⏱ Est."
            className="input !w-20 !py-1 !px-2 text-xs"
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


