import { useMemo, useState } from 'react';
import { Plus, Check, Circle, CircleDot, Trash2 } from 'lucide-react';
import { format, isToday, isPast } from 'date-fns';
import { useStore } from '../../store/useStore';
import { cn } from '../../lib/utils';
import { haptics } from '../../lib/haptics';
import { PriorityDot } from '../../components/ui';
import type { Status } from '../../store/data';

type Filter = 'all' | 'todo' | 'doing' | 'done';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'Doing' },
  { key: 'done', label: 'Done' },
];

function StatusIcon({ status }: { status: Status }) {
  if (status === 'done') return <Check className="w-4 h-4" />;
  if (status === 'doing') return <CircleDot className="w-4 h-4" />;
  return <Circle className="w-4 h-4" />;
}

export default function MobileTasks() {
  const { tasks, cycleTaskStatus, deleteTask } = useStore();
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    const base = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);
    const prio = { high: 0, medium: 1, low: 2 };
    const st = { doing: 0, todo: 1, done: 2 };
    return [...base].sort((a, b) =>
      st[a.status] !== st[b.status] ? st[a.status] - st[b.status] : prio[a.priority] - prio[b.priority],
    );
  }, [tasks, filter]);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter chips — scrollable, ≥44px targets */}
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 custom-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'shrink-0 min-h-[44px] px-4 rounded-full text-sm font-medium transition-colors',
              filter === f.key ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-white/5 text-on-surface-variant border border-transparent',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="card p-6 text-center text-sm text-ink-muted">Nothing here. Tap “New task”.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((task) => {
            const overdue =
              task.dueDate && task.status !== 'done' && isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate));
            return (
              <li key={task.id} className="card flex items-center gap-3 p-3">
                <button
                  onClick={() => { cycleTaskStatus(task.id); haptics.tap(); }}
                  aria-label="Cycle status"
                  className={cn(
                    'w-11 h-11 -m-1 rounded-full flex items-center justify-center shrink-0',
                    task.status === 'done' ? 'text-accent' : task.status === 'doing' ? 'text-secondary' : 'text-on-surface-variant',
                  )}
                >
                  <StatusIcon status={task.status} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <PriorityDot priority={task.priority} />
                    <p className={cn('truncate text-base', task.status === 'done' && 'line-through text-ink-muted')}>{task.title}</p>
                  </div>
                  {(task.dueDate || task.scheduledAt) && (
                    <p className={cn('text-[11px] font-mono-data text-on-surface-variant mt-0.5', overdue && 'text-danger')}>
                      {task.scheduledAt
                        ? format(new Date(task.scheduledAt), 'MMM d, h:mm a')
                        : `${overdue ? 'Overdue · ' : 'Due '}${format(new Date(task.dueDate!), 'MMM d')}`}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { deleteTask(task.id); haptics.warn(); }}
                  aria-label="Delete task"
                  className="w-11 h-11 -m-1 rounded-full flex items-center justify-center text-on-surface-variant active:text-danger shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button
        onClick={() => window.dispatchEvent(new Event('liftoff:quickadd'))}
        className="btn btn-primary min-h-[48px] sticky bottom-2 self-center px-6"
      >
        <Plus className="w-4 h-4" /> New task
      </button>
    </div>
  );
}
