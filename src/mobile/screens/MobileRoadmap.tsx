import { useState } from 'react';
import { ChevronDown, Check, ExternalLink } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { cn } from '../../lib/utils';
import { haptics } from '../../lib/haptics';
import { countRoadmap } from '../../lib/roadmap';
import { ProgressBar } from '../../components/ui';

// Mobile roadmap: a vertical phase -> week -> task accordion. The desktop
// xyflow graph is unusable on a phone, so we render the same store data
// (phases / toggleRoadmapTask) as a touch-friendly list.
export default function MobileRoadmap() {
  const { phases, toggleRoadmapTask } = useStore();
  const [open, setOpen] = useState<string | null>(phases[0]?.id ?? null);
  const overall = countRoadmap(phases);

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-base font-semibold text-ink">Overall progress</h2>
          <span className="font-mono-data text-sm text-accent">{overall.percent}%</span>
        </div>
        <ProgressBar value={overall.percent} />
        <p className="text-xs text-ink-muted mt-2">{overall.done} of {overall.total} milestones complete</p>
      </section>

      {phases.length === 0 && (
        <section className="card p-5 text-center">
          <p className="text-sm font-medium text-ink">No roadmap yet</p>
          <p className="text-xs text-ink-muted mt-1">
            Import your own plan or load an example from Settings → Data to get started.
          </p>
        </section>
      )}

      {phases.map((phase) => {
        const pc = countRoadmap([phase]);
        const isOpen = open === phase.id;
        return (
          <section key={phase.id} className="card overflow-hidden">
            <button
              onClick={() => { setOpen(isOpen ? null : phase.id); haptics.tap(); }}
              className="w-full flex items-center gap-3 p-4 text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="font-display text-base font-semibold text-ink truncate">{phase.title}</p>
                <p className="text-xs text-ink-muted">{pc.done}/{pc.total} · {pc.percent}%</p>
              </div>
              <ChevronDown className={cn('w-5 h-5 text-ink-subtle transition-transform', isOpen && 'rotate-180')} />
            </button>

            {isOpen && (
              <div className="px-4 pb-4 flex flex-col gap-4">
                {phase.weeks.map((week) => (
                  <div key={week.id}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-2">{week.title}</p>
                    <ul className="flex flex-col gap-1.5">
                      {week.tasks.map((task) => (
                        <li key={task.id} className="flex items-center gap-3">
                          <button
                            onClick={() => { toggleRoadmapTask(phase.id, week.id, task.id); haptics.tap(); }}
                            aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
                            className={cn(
                              'w-9 h-9 -ml-1 rounded-full flex items-center justify-center shrink-0',
                              task.completed ? 'text-accent' : 'text-on-surface-variant',
                            )}
                          >
                            <span className={cn(
                              'w-5 h-5 rounded-full border flex items-center justify-center',
                              task.completed ? 'bg-accent border-accent text-[var(--accent-text)]' : 'border-on-surface-variant/50',
                            )}>
                              {task.completed && <Check className="w-3.5 h-3.5" />}
                            </span>
                          </button>
                          <span className={cn('flex-1 text-sm', task.completed && 'line-through text-ink-muted')}>{task.title}</span>
                          {task.link && (
                            <a href={task.link} target="_blank" rel="noreferrer" className="p-2 text-ink-subtle active:text-primary" aria-label="Open resource">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
