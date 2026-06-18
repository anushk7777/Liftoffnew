import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Map,
  ChevronDown,
  ChevronRight,
  Check,
  Upload,
  Sparkles,
  ExternalLink,
  List,
  Workflow,
  ListPlus,
  Timer,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn, safeSetItem } from '../lib/utils';
import type { Phase, TaskType, Task } from '../store/data';
import { parseRoadmap, countRoadmap } from '../lib/roadmap';
import { PageHeader, ProgressBar, Modal } from '../components/ui';
import RoadmapGraph from '../components/RoadmapGraph';

export interface NodeRef {
  phaseId: string;
  weekId: string;
  task: Task;
  phaseTitle: string;
  weekTitle: string;
}

const TYPE_COLOR: Record<TaskType, string> = {
  dsa: 'text-accent',
  course: 'text-success',
  milestone: 'text-warning',
  project: 'text-accent',
  apply: 'text-danger',
};

const SAMPLE = `PHASE A — Foundations | Weeks 1-4
Week 1
- [course] Learn HTML basics | https://example.com
- [dsa] Arrays & strings
Week 2
- [course] CSS & Flexbox
- [dsa] Sorting
Milestone: deploy a static page

PHASE B — JavaScript | Weeks 5-8
Week 5
- [course] JS fundamentals
- [dsa] Recursion`;

export default function Roadmap() {
  const { phases, toggleRoadmapTask, replaceRoadmap, appendRoadmap, resetRoadmap, tasks, addTaskFromRoadmap } =
    useStore();
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);
  const [view, setView] = useState<'graph' | 'list'>(
    () => (localStorage.getItem('liftoff_roadmap_view') as 'graph' | 'list') || 'graph',
  );
  const [selected, setSelected] = useState<NodeRef | null>(null);

  // Auto-reset if the local storage data is using the old phase format (phase-a) or is incomplete
  useEffect(() => {
    if (phases.length === 0 || phases[0].id === 'phase-a' || phases.length < 3) {
      useStore.getState().resetRoadmap();
    }
  }, [phases]);

  const overall = useMemo(() => countRoadmap(phases), [phases]);

  // Keys of roadmap items that already have a linked daily task.
  const addedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const t of tasks)
      if (t.sourceRoadmap)
        s.add(`${t.sourceRoadmap.phaseId}:${t.sourceRoadmap.weekId}:${t.sourceRoadmap.taskId}`);
    return s;
  }, [tasks]);

  const setViewPersist = (v: 'graph' | 'list') => {
    safeSetItem('liftoff_roadmap_view', v);
    setView(v);
  };

  // Re-read the selected node's live state (completion may change under it).
  const liveSelected = selected ? findLiveNode(phases, selected) : null;

  return (
    <div className="animate-rise">
      <PageHeader
        title="Roadmap"
        subtitle="Your 6-month flight plan. Tap any node to act on it."
        icon={<Map className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-elevated border border-border">
              <ViewBtn active={view === 'graph'} onClick={() => setViewPersist('graph')} icon={<Workflow className="w-4 h-4" />}>
                Graph
              </ViewBtn>
              <ViewBtn active={view === 'list'} onClick={() => setViewPersist('list')} icon={<List className="w-4 h-4" />}>
                List
              </ViewBtn>
            </div>
            <button onClick={() => setImportOpen(true)} className="btn btn-primary">
              <Upload className="w-4 h-4" /> Import
            </button>
          </div>
        }
      />

      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-medium text-ink-muted">Overall progress</span>
          <span className="font-display font-bold text-ink">
            {overall.percent}%
            <span className="text-ink-subtle font-normal ml-2 text-xs">
              {overall.done}/{overall.total} done
            </span>
          </span>
        </div>
        <ProgressBar value={overall.percent} />
      </div>

      {view === 'graph' ? (
        <RoadmapGraph phases={phases} onNodeClick={setSelected} addedKeys={addedKeys} />
      ) : (
        <div className="space-y-3">
          {phases.map((phase, i) => (
            <PhaseCard
              key={phase.id}
              phase={phase}
              defaultOpen={i === 0}
              onToggle={toggleRoadmapTask}
            />
          ))}
        </div>
      )}

      {/* Node action sheet */}
      <Modal open={!!liveSelected} onClose={() => setSelected(null)} maxWidth="max-w-md">
        {liveSelected && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={cn('text-[11px] font-semibold uppercase tracking-wider', TYPE_COLOR[liveSelected.task.type])}>
                  {liveSelected.task.type}
                </span>
                <span className="text-[11px] text-ink-subtle">
                  · {cleanPhaseTitle(liveSelected.phaseTitle)} · {liveSelected.weekTitle}
                </span>
              </div>
              <h2 className="font-display text-xl font-bold text-ink leading-snug">
                {liveSelected.task.title}
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() =>
                  toggleRoadmapTask(liveSelected.phaseId, liveSelected.weekId, liveSelected.task.id)
                }
                className={cn('btn w-full justify-start', liveSelected.task.completed ? 'btn-secondary' : 'btn-primary')}
              >
                <Check className="w-4 h-4" />
                {liveSelected.task.completed ? 'Mark as not done' : 'Mark complete'}
              </button>

              {(() => {
                const key = `${liveSelected.phaseId}:${liveSelected.weekId}:${liveSelected.task.id}`;
                const added = addedKeys.has(key);
                return (
                  <button
                    onClick={() => {
                      addTaskFromRoadmap(
                        liveSelected.phaseId, 
                        liveSelected.weekId, 
                        liveSelected.task.id,
                        liveSelected.task.title,
                        liveSelected.task.type
                      );
                      setSelected(null);
                      navigate('/tasks');
                    }}
                    disabled={added}
                    className="btn btn-secondary w-full justify-start disabled:opacity-50"
                  >
                    <ListPlus className="w-4 h-4" />
                    {added ? 'Already in your tasks' : 'Add to my tasks'}
                  </button>
                );
              })()}

              <button
                onClick={() => {
                  setSelected(null);
                  navigate('/focus');
                }}
                className="btn btn-secondary w-full justify-start"
              >
                <Timer className="w-4 h-4" /> Focus on this
              </button>

              {liveSelected.task.link && (
                <a
                  href={liveSelected.task.link}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary w-full justify-start"
                >
                  <ExternalLink className="w-4 h-4" /> Open resource
                </a>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onReplace={(p) => {
          replaceRoadmap(p);
          setImportOpen(false);
        }}
        onAppend={(p) => {
          appendRoadmap(p);
          setImportOpen(false);
        }}
        onReset={() => {
          if (window.confirm('Reset to the default Liftoff roadmap? Your progress will be lost.')) {
            resetRoadmap();
            setImportOpen(false);
          }
        }}
      />
    </div>
  );
}

const cleanPhaseTitle = (s: string) => s.replace(/^phase\s+[a-z]\s*[—-]\s*/i, '').trim() || s;

// Resolve a selected node against the current phases so the action sheet always
// reflects live completion state.
function findLiveNode(phases: Phase[], selected: NodeRef): NodeRef {
  const p = phases.find((x) => x.id === selected.phaseId);
  const w = p?.weeks.find((x) => x.id === selected.weekId);
  const t = w?.tasks.find((x) => x.id === selected.task.id);
  return t ? { ...selected, task: t } : selected;
}

function ViewBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors',
        active ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
      )}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}

function PhaseCard({
  phase,
  defaultOpen,
  onToggle,
}: {
  phase: Phase;
  defaultOpen: boolean;
  onToggle: (p: string, w: string, t: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const stats = useMemo(() => countRoadmap([phase]), [phase]);
  const done = stats.percent === 100 && stats.total > 0;

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-hover transition-colors"
      >
        <span className="text-ink-subtle">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <h3
            className={cn(
              'font-display font-semibold text-[15px]',
              done ? 'text-ink-subtle line-through' : 'text-ink',
            )}
          >
            {phase.title}
          </h3>
          {phase.duration && <p className="text-xs text-ink-subtle mt-0.5">{phase.duration}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-medium text-ink-muted tabular-nums">{stats.percent}%</span>
          <div className="w-20 hidden sm:block">
            <ProgressBar value={stats.percent} className="h-1.5" />
          </div>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border space-y-5">
          {phase.weeks.map((week) => (
            <div key={week.id} className="pt-3">
              <h4 className="section-label mb-2">{week.title}</h4>
              <div className="space-y-0.5">
                {week.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="group flex items-start gap-3 p-2 rounded-lg hover:bg-hover transition-colors"
                  >
                    <button
                      onClick={() => onToggle(phase.id, week.id, task.id)}
                      className={cn(
                        'mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0',
                        task.completed
                          ? 'bg-accent border-accent text-[var(--accent-text)]'
                          : 'border-ink-subtle hover:border-ink text-transparent',
                      )}
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'text-sm',
                          task.completed ? 'text-ink-subtle line-through' : 'text-ink',
                        )}
                      >
                        {task.title}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'text-[10px] font-semibold uppercase tracking-wider shrink-0',
                        TYPE_COLOR[task.type] || 'text-ink-subtle',
                      )}
                    >
                      {task.type}
                    </span>
                    {task.link && (
                      <a
                        href={task.link}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="opacity-0 group-hover:opacity-100 text-ink-subtle hover:text-accent"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImportModal({
  open,
  onClose,
  onReplace,
  onAppend,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  onReplace: (p: Phase[]) => void;
  onAppend: (p: Phase[]) => void;
  onReset: () => void;
}) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => (text.trim() ? parseRoadmap(text) : []), [text]);
  const stats = useMemo(() => countRoadmap(parsed), [parsed]);

  return (
    <Modal open={open} onClose={onClose} title="Import a roadmap" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Paste any plan — phases, weeks, and tasks. Liftoff parses it into your roadmap so it
          integrates with your daily work and stats.
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={SAMPLE}
          rows={12}
          className="input font-mono text-xs leading-relaxed resize-none"
        />
        <div className="flex items-center justify-between">
          <button
            onClick={() => setText(SAMPLE)}
            className="text-xs font-medium text-ink-muted hover:text-accent flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" /> Use sample format
          </button>
          {parsed.length > 0 && (
            <span className="text-xs text-ink-subtle">
              Detected {parsed.length} phase{parsed.length > 1 ? 's' : ''}, {stats.total} tasks
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
          <button onClick={onReset} className="btn btn-ghost text-xs text-danger">
            Reset to default
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => onAppend(parsed)}
              disabled={parsed.length === 0}
              className="btn btn-secondary disabled:opacity-40"
            >
              Append
            </button>
            <button
              onClick={() => onReplace(parsed)}
              disabled={parsed.length === 0}
              className="btn btn-primary disabled:opacity-40"
            >
              Replace roadmap
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
