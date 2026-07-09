import { useMemo, useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { format, isToday, isPast, isTomorrow } from 'date-fns';
import { useStore } from '../../store/useStore';
import { cn } from '../../lib/utils';
import { haptics } from '../../lib/haptics';
import { SwipeRow } from '../components/SwipeRow';
import { TaskModal } from '../../pages/Tasks';
import type { TodoTask } from '../../store/data';

type Filter = 'all' | 'todo' | 'doing' | 'done';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'Doing' },
  { key: 'done', label: 'Done' },
];

const PRIO_EDGE: Record<string, string> = { high: 'var(--danger)', medium: 'var(--warning)', low: 'transparent' };

function dueMeta(t: TodoTask): { text: string; tone: string } | null {
  if (t.scheduledAt) {
    const d = new Date(t.scheduledAt);
    const day = isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'MMM d');
    return { text: `${day}, ${format(d, 'h:mm a')}`, tone: 'var(--text-muted)' };
  }
  if (!t.dueDate) return null;
  const d = new Date(t.dueDate);
  if (t.status !== 'done' && isPast(d) && !isToday(d)) return { text: `Overdue · ${format(d, 'MMM d')}`, tone: 'var(--danger)' };
  if (isToday(d)) return { text: 'Today', tone: 'var(--accent)' };
  if (isTomorrow(d)) return { text: 'Tomorrow', tone: 'var(--text-muted)' };
  return { text: `Due ${format(d, 'MMM d')}`, tone: 'var(--text-muted)' };
}

function Checkbox({ status, onClick }: { status: string; onClick: () => void }) {
  const done = status === 'done';
  const doing = status === 'doing';
  return (
    <button
      onClick={onClick}
      aria-label="Cycle status"
      className="w-11 h-11 -m-1.5 flex items-center justify-center shrink-0"
    >
      <span
        className={cn('w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-colors')}
        style={{
          borderColor: done ? 'var(--accent)' : doing ? 'var(--accent)' : 'var(--border-strong)',
          background: done ? 'var(--accent)' : 'transparent',
          color: 'var(--accent-text)',
        }}
      >
        {done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
        {doing && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />}
      </span>
    </button>
  );
}

function Row({ task, onCycle, onOpen }: { task: TodoTask; onCycle: () => void; onOpen: () => void }) {
  const done = task.status === 'done';
  const meta = dueMeta(task);
  return (
    <div
      className="flex items-center gap-2.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] pl-2.5 pr-3 py-2.5"
      style={{ boxShadow: 'var(--shadow-sm)', borderLeft: `3px solid ${PRIO_EDGE[task.priority] || 'transparent'}` }}
    >
      <Checkbox status={task.status} onClick={onCycle} />
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <p className={cn('text-[15px] leading-snug truncate', done ? 'line-through text-[var(--text-subtle)]' : 'text-[var(--text)] font-medium')}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {meta && <span className="text-[11.5px]" style={{ color: meta.tone }}>{meta.text}</span>}
          {task.category && <span className="text-[11px] text-[var(--text-subtle)] truncate">{task.category}</span>}
        </div>
      </button>
    </div>
  );
}

export default function MobileTasks() {
  const { tasks, cycleTaskStatus, setTaskStatus, deleteTask, updateTask } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<TodoTask | null>(null);

  const { active, done } = useMemo(() => {
    const base = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);
    const prio = { high: 0, medium: 1, low: 2 };
    const rank = (t: TodoTask) => (t.status === 'doing' ? 0 : t.status === 'todo' ? 1 : 2);
    const sorted = [...base].sort((a, b) => (rank(a) !== rank(b) ? rank(a) - rank(b) : prio[a.priority] - prio[b.priority]));
    return { active: sorted.filter((t) => t.status !== 'done'), done: sorted.filter((t) => t.status === 'done') };
  }, [tasks, filter]);

  const cycle = (t: TodoTask) => { cycleTaskStatus(t.id); haptics.tap(); };
  const empty = active.length === 0 && done.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Segmented control */}
      <div className="flex p-1 rounded-full bg-[var(--elevated)] border border-[var(--border)]">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'flex-1 py-2 rounded-full text-[13px] font-semibold transition-colors',
              filter === f.key ? 'text-[var(--text)]' : 'text-[var(--text-muted)]',
            )}
            style={filter === f.key ? { background: 'var(--surface)', boxShadow: 'var(--shadow-sm)' } : undefined}
          >
            {f.label}
          </button>
        ))}
      </div>

      {empty ? (
        <div className="text-center py-16 px-6">
          <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4" style={{ background: 'var(--accent-soft)' }}>
            <Check className="w-6 h-6" style={{ color: 'var(--accent)' }} />
          </div>
          <p className="text-[var(--text)] font-semibold">All clear</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">Nothing on this list. Add your next task.</p>
          <button
            onClick={() => window.dispatchEvent(new Event('liftoff:quickadd'))}
            className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-[var(--accent-text)]"
            style={{ background: 'var(--accent)' }}
          >
            <Plus className="w-4 h-4" /> New task
          </button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {active.map((task) => (
                <li key={task.id}>
                  <SwipeRow onComplete={() => setTaskStatus(task.id, 'done')} onDelete={() => deleteTask(task.id)}>
                    <Row task={task} onCycle={() => cycle(task)} onOpen={() => setEditing(task)} />
                  </SwipeRow>
                </li>
              ))}
            </ul>
          )}

          {done.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)] px-1 pt-1">
                Completed · {done.length}
              </div>
              <ul className="flex flex-col gap-2.5">
                {done.map((task) => (
                  <li key={task.id}>
                    <SwipeRow onComplete={() => setTaskStatus(task.id, 'todo')} onDelete={() => deleteTask(task.id)}>
                      <Row task={task} onCycle={() => cycle(task)} onOpen={() => setEditing(task)} />
                    </SwipeRow>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <TaskModal
        open={!!editing}
        editing={editing}
        onClose={() => setEditing(null)}
        onSave={(d) => {
          if (editing) updateTask(editing.id, d);
          setEditing(null);
        }}
      />
    </div>
  );
}
