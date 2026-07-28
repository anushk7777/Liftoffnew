import { useMemo } from 'react';
import { Check, Star, ExternalLink } from 'lucide-react';
import type { Phase, Task, TaskType } from '../store/data';
import { cn } from '../lib/utils';
import { countRoadmap } from '../lib/roadmap';

export interface NodeRef {
  phaseId: string;
  weekId: string;
  task: Task;
  phaseTitle: string;
  weekTitle: string;
}

const TYPE_RING: Record<TaskType, string> = {
  dsa: 'ring-accent/40',
  course: 'ring-success/40',
  milestone: 'ring-warning/50',
  project: 'ring-accent/40',
  apply: 'ring-danger/40',
};

const TYPE_TEXT: Record<TaskType, string> = {
  dsa: 'text-accent',
  course: 'text-success',
  milestone: 'text-warning',
  project: 'text-accent',
  apply: 'text-danger',
};

export default function RoadmapJourney({
  phases,
  onNodeClick,
  addedKeys,
}: {
  phases: Phase[];
  onNodeClick: (node: NodeRef) => void;
  addedKeys: Set<string>;
}) {
  // The first incomplete task overall — the "you are here" beacon.
  const nextKey = useMemo(() => {
    for (const p of phases)
      for (const w of p.weeks)
        for (const t of w.tasks) if (!t.completed) return `${p.id}:${w.id}:${t.id}`;
    return null;
  }, [phases]);

  return (
    <div className="relative pb-6">
      {/* Central spine */}
      <div className="absolute left-1/2 top-2 bottom-2 w-[2px] -translate-x-1/2 bg-gradient-to-b from-accent/50 via-border to-border" />

      <div className="relative space-y-2">
        {phases.map((phase) => {
          const stats = countRoadmap([phase]);
          return (
            <div key={phase.id} className="relative">
              {/* Phase header pill on the spine */}
              <div className="flex justify-center py-4">
                <div className="relative z-10 rounded-full border border-border bg-surface px-4 py-1.5 shadow-sm text-center">
                  <p className="font-display text-sm font-bold text-ink">{phase.title}</p>
                  <p className="text-[11px] text-ink-subtle">
                    {phase.duration ? `${phase.duration} · ` : ''}
                    {stats.percent}% complete
                  </p>
                </div>
              </div>

              {phase.weeks.map((week) =>
                week.tasks.map((task, i) => {
                  const key = `${phase.id}:${week.id}:${task.id}`;
                  const isNext = key === nextKey;
                  const isMilestone = task.type === 'milestone';
                  const labelLeft = i % 2 === 0;
                  const label = (
                    <NodeLabel
                      task={task}
                      align={labelLeft ? 'right' : 'left'}
                      added={addedKeys.has(key)}
                      onClick={() =>
                        onNodeClick({
                          phaseId: phase.id,
                          weekId: week.id,
                          task,
                          phaseTitle: phase.title,
                          weekTitle: week.title,
                        })
                      }
                    />
                  );
                  return (
                    <div key={task.id} className="relative flex items-center min-h-[60px]">
                      <div className="w-1/2 pr-7 flex justify-end">{labelLeft && label}</div>
                      <button
                        onClick={() =>
                          onNodeClick({
                            phaseId: phase.id,
                            weekId: week.id,
                            task,
                            phaseTitle: phase.title,
                            weekTitle: week.title,
                          })
                        }
                        title={task.title}
                        className={cn(
                          'absolute left-1/2 -translate-x-1/2 z-10 rounded-full flex items-center justify-center transition-all duration-200 ring-2 ring-offset-2 ring-offset-bg active:scale-95',
                          isMilestone ? 'w-12 h-12' : 'w-9 h-9',
                          task.completed
                            ? 'bg-accent text-[var(--accent-text)] ring-accent shadow-md'
                            : cn(
                                'bg-surface text-ink-subtle hover:text-ink hover:scale-105',
                                TYPE_RING[task.type],
                              ),
                          isNext && !task.completed && 'animate-pulse ring-accent shadow-[0_0_0_6px_var(--accent-soft)]',
                        )}
                      >
                        {task.completed ? (
                          isMilestone ? (
                            <Star className="w-5 h-5 fill-current" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )
                        ) : isMilestone ? (
                          <Star className={cn('w-5 h-5', TYPE_TEXT[task.type])} />
                        ) : (
                          <span className={cn('w-2 h-2 rounded-full bg-current', TYPE_TEXT[task.type])} />
                        )}
                      </button>
                      <div className="w-1/2 pl-7 flex justify-start">{!labelLeft && label}</div>
                    </div>
                  );
                }),
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NodeLabel({
  task,
  align,
  added,
  onClick,
}: {
  task: Task;
  align: 'left' | 'right';
  added: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group max-w-[min(280px,100%)] rounded-lg border border-transparent hover:border-border hover:bg-hover px-2.5 py-1.5 transition-colors',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      <p
        className={cn(
          'text-sm leading-snug',
          task.completed ? 'text-ink-subtle line-through' : 'text-ink',
        )}
      >
        {task.title}
      </p>
      <div
        className={cn(
          'flex items-center gap-2 mt-0.5',
          align === 'right' ? 'justify-end' : 'justify-start',
        )}
      >
        <span className={cn('text-[11px] font-semibold uppercase tracking-wider', TYPE_TEXT[task.type])}>
          {task.type}
        </span>
        {added && <span className="text-[11px] text-ink-subtle">· added</span>}
        {task.link && <ExternalLink className="w-3 h-3 text-ink-subtle opacity-0 group-hover:opacity-100" />}
      </div>
    </button>
  );
}
