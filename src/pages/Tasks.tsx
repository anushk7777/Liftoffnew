import { useMemo, useState } from 'react';
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
} from 'lucide-react';
import { format, isToday, isPast, startOfDay, addMinutes } from 'date-fns';
import { useStore } from '../store/useStore';
import { buildICS, downloadICS } from '../lib/ics';
import type { TodoTask, Priority, Status } from '../store/data';
import { cn } from '../lib/utils';
import { springSoft } from '../lib/motion';
import { PageHeader, Modal, PriorityDot, EmptyState } from '../components/ui';

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
      <div className="flex items-center gap-1 mb-5 p-1 rounded-lg bg-elevated border border-border w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              filter === f.key ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
            )}
          >
            {f.label}
            <span className="ml-1.5 text-xs text-ink-subtle">{counts[f.key]}</span>
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
    <div className="group card card-hover flex items-start gap-3 px-3.5 py-3">
      <button
        onClick={onCycle}
        title="Cycle status"
        className={cn(
          'mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center transition-colors shrink-0',
          task.status === 'done'
            ? 'bg-accent border-accent text-[var(--accent-text)]'
            : task.status === 'doing'
              ? 'border-warning text-warning'
              : 'border-ink-subtle text-ink-subtle hover:border-ink hover:text-ink',
        )}
      >
        <StatusIcon status={task.status} />
      </button>

      <div className="flex-1 min-w-0" onClick={onEdit} role="button">
        <div className="flex items-center gap-2">
          <PriorityDot priority={task.priority} />
          <p
            className={cn(
              'text-sm font-medium truncate',
              task.status === 'done' ? 'line-through text-ink-subtle' : 'text-ink',
            )}
          >
            {task.title}
          </p>
        </div>
        {(task.notes || task.category || task.dueDate || task.estimate || task.scheduledAt) && (
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-ink-subtle">
            {task.category && <span className="chip">{task.category}</span>}
            {task.estimate && <span>⏱ {task.estimate}</span>}
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
            {task.notes && <span className="truncate max-w-[200px]">— {task.notes}</span>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {task.scheduledAt && (
          <button
            onClick={() => {
              const dtStart = new Date(task.scheduledAt!);
              // Default to 30 mins if no estimate, otherwise parse estimate or just use 60 mins
              const dtEnd = addMinutes(dtStart, 30);
              const icsStr = buildICS({
                title: task.title,
                description: task.notes || '',
                dtStart,
                dtEnd,
                alarmMinutesBefore: 5,
              });
              downloadICS(`task-${task.id}.ics`, icsStr);
            }}
            className="p-1.5 rounded-md text-ink-subtle hover:text-accent hover:bg-hover"
            title="Add to Calendar"
          >
            <Calendar className="w-4 h-4" />
          </button>
        )}
        <button onClick={onEdit} className="p-1.5 rounded-md text-ink-subtle hover:text-ink hover:bg-hover" title="Edit task">
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-md text-ink-subtle hover:text-danger hover:bg-hover"
          title="Delete task"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function TaskModal({
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
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [priority, setPriority] = useState<Priority>(editing?.priority ?? 'medium');
  const [status, setStatus] = useState<Status>(editing?.status ?? 'todo');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [estimate, setEstimate] = useState(editing?.estimate ?? '');
  const [dueDate, setDueDate] = useState(editing?.dueDate ? editing.dueDate.slice(0, 10) : '');
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
          ? startOfDay(new Date(dueDate)).toISOString()
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

        {/* Quick-schedule row — the most important controls, right after title */}
        <div className="flex flex-wrap items-center gap-2">
          <Clock className="w-4 h-4 text-ink-subtle shrink-0" />
          {quickDate('Today', todayStr)}
          {quickDate('Tomorrow', tomorrowStr)}
          {quickDate('Next week', nextWeekStr)}
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="input !w-auto !py-1 !px-2 text-xs"
            title="Pick a date"
          />
          {dueDate && (
            <button
              type="button"
              onClick={() => setDueDate('')}
              className="text-xs text-ink-subtle hover:text-danger transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Schedule exact time */}
        {dueDate && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Set time</span>
            <input
              type="time"
              value={scheduledAt ? scheduledAt.slice(11, 16) : ''}
              onChange={(e) => {
                if (e.target.value) {
                  setScheduledAt(`${dueDate}T${e.target.value}`);
                } else {
                  setScheduledAt('');
                }
              }}
              className="input !w-auto !py-1 !px-2 text-xs"
            />
            {scheduledAt && (
              <button
                type="button"
                onClick={() => setScheduledAt('')}
                className="text-xs text-ink-subtle hover:text-danger transition-colors"
              >
                ✕ clear
              </button>
            )}
            <span className="text-[10px] text-ink-subtle ml-auto">Reminders will fire at this time</span>
          </div>
        )}

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

        {/* Notes + Actions in one row */}
        <div className="flex items-end gap-3 pt-1">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={1}
            className="input resize-none text-sm flex-1"
          />
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editing ? 'Save' : 'Add task'}
            </button>
          </div>
        </div>
    </form>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-1.5 block">
        {label}
      </span>
      {children}
    </label>
  );
}
