import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Sparkles,
  CheckSquare,
  Repeat,
  Timer,
  Lightbulb,
  Map,
  BarChart3,
  Settings,
  CheckCircle2,
  Sun,
  Moon,
  CornerDownLeft,
  Search,
  FileText,
  Dumbbell,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useAfterburn, useAppMode } from '../afterburn/store';
import { cn } from '../lib/utils';

interface Command {
  id: string;
  label: string;
  sublabel?: string;
  group: 'Go to' | 'Actions' | 'Tasks' | 'Notes' | 'Ideas' | 'Workouts';
  keywords?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

// Mounted only while open (see App), so its state starts fresh each time.
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const toggleLogDay = useStore((s) => s.toggleLogDay);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const theme = useStore((s) => s.theme);
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const ideas = useStore((s) => s.ideas);
  const sessions = useAfterburn((s) => s.sessions);
  const setMode = useAppMode((s) => s.setMode);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      navigate(to);
      onClose();
    };
    const act = (fn: () => void) => () => {
      fn();
      onClose();
    };
    return [
      { id: 'go-dash', label: 'Dashboard', group: 'Go to', icon: LayoutDashboard, run: go('/') },
      { id: 'go-coach', label: 'Coach', group: 'Go to', keywords: 'ai suggest', icon: Sparkles, run: go('/coach') },
      { id: 'go-tasks', label: 'Tasks', group: 'Go to', icon: CheckSquare, run: go('/tasks') },
      { id: 'go-habits', label: 'Habits', group: 'Go to', keywords: 'recurring streak', icon: Repeat, run: go('/habits') },
      { id: 'go-focus', label: 'Focus', group: 'Go to', keywords: 'pomodoro timer', icon: Timer, run: go('/focus') },
      { id: 'go-brain', label: 'Brain Dump', group: 'Go to', keywords: 'ideas notes', icon: Lightbulb, run: go('/brain-dump') },
      { id: 'go-road', label: 'Roadmap', group: 'Go to', keywords: 'journey plan', icon: Map, run: go('/roadmap') },
      { id: 'go-stats', label: 'Stats', group: 'Go to', icon: BarChart3, run: go('/stats') },
      { id: 'go-settings', label: 'Settings', group: 'Go to', icon: Settings, run: go('/settings') },
      { id: 'act-log', label: 'Mark today done', group: 'Actions', keywords: 'streak log', icon: CheckCircle2, run: act(() => toggleLogDay('full')) },
      { id: 'act-focus', label: 'Start a focus session', group: 'Actions', icon: Timer, run: go('/focus') },
      {
        id: 'act-task',
        label: 'Add a task',
        group: 'Actions',
        keywords: 'new todo quick',
        icon: CheckSquare,
        run: act(() => window.dispatchEvent(new Event('liftoff:quickadd'))),
      },
      { id: 'act-idea', label: 'Capture an idea', group: 'Actions', icon: Lightbulb, run: go('/brain-dump') },
      {
        id: 'act-theme',
        label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        group: 'Actions',
        keywords: 'theme appearance',
        icon: theme === 'dark' ? Sun : Moon,
        run: act(toggleTheme),
      },
    ];
  }, [navigate, onClose, toggleLogDay, toggleTheme, theme]);

  const q = query.trim().toLowerCase();

  // Content search across BOTH apps — only when there's a query. Tasks/notes/
  // ideas come from the productivity store; workouts from Afterburn. Selecting a
  // result switches workspace as needed.
  const content = useMemo<Command[]>(() => {
    if (!q) return [];
    const out: Command[] = [];
    const goFocus = (to: string) => () => {
      setMode('focus');
      navigate(to);
      onClose();
    };
    tasks
      .filter((t) => `${t.title} ${t.notes ?? ''}`.toLowerCase().includes(q))
      .slice(0, 6)
      .forEach((t) =>
        out.push({ id: `task-${t.id}`, label: t.title, sublabel: t.status, group: 'Tasks', icon: CheckSquare, run: goFocus('/tasks') }),
      );
    notes
      .filter((n) => `${n.title} ${n.content}`.toLowerCase().includes(q))
      .slice(0, 6)
      .forEach((n) =>
        out.push({ id: `note-${n.id}`, label: n.title || 'Untitled note', group: 'Notes', icon: FileText, run: goFocus('/brain-dump') }),
      );
    ideas
      .filter((i) => i.text.toLowerCase().includes(q))
      .slice(0, 6)
      .forEach((i) =>
        out.push({ id: `idea-${i.id}`, label: i.text.slice(0, 60), group: 'Ideas', icon: Lightbulb, run: goFocus('/brain-dump') }),
      );
    sessions
      .filter((s) => `${s.dayName} ${s.weekName ?? ''} ${s.entries.map((e) => e.name).join(' ')}`.toLowerCase().includes(q))
      .slice(0, 6)
      .forEach((s) =>
        out.push({
          id: `workout-${s.id}`,
          label: s.weekName ? `${s.weekName} · ${s.dayName}` : s.dayName,
          group: 'Workouts',
          icon: Dumbbell,
          run: () => {
            setMode('afterburn');
            onClose();
          },
        }),
      );
    return out;
  }, [q, tasks, notes, ideas, sessions, navigate, setMode, onClose]);

  const filtered = useMemo(() => {
    if (!q) return commands;
    const navMatches = commands.filter((c) => (c.label + ' ' + (c.keywords || '')).toLowerCase().includes(q));
    return [...navMatches, ...content];
  }, [commands, q, content]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[active]?.run();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg card shadow-lg overflow-hidden animate-rise" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2 px-4 border-b border-border">
          <Search className="w-4 h-4 text-ink-subtle" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Jump to or run a command…"
            className="flex-1 bg-transparent py-3.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none"
          />
          <kbd className="text-[10px] text-ink-subtle border border-border rounded px-1.5 py-0.5">esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <p className="text-sm text-ink-subtle text-center py-8">No matches.</p>
          )}
          {filtered.map((c, i) => {
            const showGroup = i === 0 || c.group !== filtered[i - 1].group;
            const Icon = c.icon;
            return (
              <div key={c.id}>
                {showGroup && <p className="section-label px-2 pt-2 pb-1">{c.group}</p>}
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => c.run()}
                  className={cn(
                    'w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors',
                    i === active ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:bg-hover',
                  )}
                >
                  <Icon className={cn('w-4 h-4 shrink-0', i === active ? 'text-accent' : 'text-ink-subtle')} />
                  <span className="flex-1 text-sm truncate">{c.label}</span>
                  {c.sublabel && <span className="text-[10px] text-ink-subtle uppercase tracking-wide shrink-0">{c.sublabel}</span>}
                  {i === active && <CornerDownLeft className="w-3.5 h-3.5 text-ink-subtle shrink-0" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
