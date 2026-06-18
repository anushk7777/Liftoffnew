import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, SkipForward, Timer, Coffee, Brain } from 'lucide-react';
import { isToday } from 'date-fns';
import { useStore } from '../store/useStore';
import { cn, safeSetItem } from '../lib/utils';
import { beep } from '../lib/sound';
import { PageHeader, StatCard } from '../components/ui';

type Mode = 'focus' | 'shortBreak' | 'longBreak';

const MODE_META: Record<Mode, { label: string; icon: React.ReactNode }> = {
  focus: { label: 'Focus', icon: <Brain className="w-4 h-4" /> },
  shortBreak: { label: 'Short break', icon: <Coffee className="w-4 h-4" /> },
  longBreak: { label: 'Long break', icon: <Coffee className="w-4 h-4" /> },
};

const FOCUS_KEY = 'liftoff_focus';
interface SavedFocus {
  endsAt: number;
  mode: Mode;
  round: number;
  taskLabel: string;
}
function readSavedFocus(): SavedFocus | null {
  try {
    const raw = localStorage.getItem(FOCUS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && typeof v.endsAt === 'number') return v as SavedFocus;
  } catch {
    /* ignore */
  }
  return null;
}

export default function Focus() {
  const { pomodoro, focusSessions, logFocusSession } = useStore();

  const [saved] = useState<SavedFocus | null>(() => readSavedFocus());

  const [mode, setMode] = useState<Mode>(saved?.mode ?? 'focus');
  const [round, setRound] = useState(saved?.round ?? 1);
  const [taskLabel, setTaskLabel] = useState(saved?.taskLabel ?? '');
  const [endsAt, setEndsAt] = useState<number | null>(() =>
    saved && saved.endsAt > Date.now() ? saved.endsAt : null,
  );
  const [running, setRunning] = useState(() => !!(saved && saved.endsAt > Date.now()));

  const modeMinutes = useCallback(
    (m: Mode) =>
      m === 'focus'
        ? pomodoro.focusMins
        : m === 'shortBreak'
          ? pomodoro.shortBreakMins
          : pomodoro.longBreakMins,
    [pomodoro],
  );

  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (saved && saved.endsAt > Date.now()) return Math.round((saved.endsAt - Date.now()) / 1000);
    const m = saved?.mode ?? 'focus';
    const mins =
      m === 'focus' ? pomodoro.focusMins : m === 'shortBreak' ? pomodoro.shortBreakMins : pomodoro.longBreakMins;
    return mins * 60;
  });

  const total = modeMinutes(mode) * 60;
  const progress = total > 0 ? 1 - secondsLeft / total : 0;

  const switchMode = useCallback(
    (next: Mode, nextRound: number) => {
      setMode(next);
      setRound(nextRound);
      setEndsAt(null);
      setRunning(false);
      setSecondsLeft(modeMinutes(next) * 60);
    },
    [modeMinutes],
  );

  const handleComplete = useCallback(() => {
    beep();
    if (mode === 'focus') {
      logFocusSession(pomodoro.focusMins, 'focus', taskLabel.trim() || undefined);
      const isLong = round % pomodoro.roundsBeforeLong === 0;
      switchMode(isLong ? 'longBreak' : 'shortBreak', round);
    } else {
      logFocusSession(modeMinutes(mode), 'break');
      switchMode('focus', round + 1);
    }
  }, [mode, round, pomodoro, taskLabel, logFocusSession, switchMode, modeMinutes]);

  const completeRef = useRef(handleComplete);
  useEffect(() => {
    completeRef.current = handleComplete;
  });

  // Timestamp-based tick: derive remaining time from a target end-time so the
  // timer is immune to background-tab throttling and stays accurate.
  useEffect(() => {
    if (!running || endsAt == null) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(id);
        completeRef.current();
      }
    }, 250);
    return () => clearInterval(id);
  }, [running, endsAt]);

  // Persist a running timer so a page reload resumes it.
  useEffect(() => {
    if (running && endsAt) {
      safeSetItem(FOCUS_KEY, JSON.stringify({ endsAt, mode, round, taskLabel }));
    } else {
      localStorage.removeItem(FOCUS_KEY);
    }
  }, [running, endsAt, mode, round, taskLabel]);

  // Document title countdown
  useEffect(() => {
    const m = Math.floor(secondsLeft / 60);
    const s = (secondsLeft % 60).toString().padStart(2, '0');
    document.title = running ? `${m}:${s} · ${MODE_META[mode].label} — Liftoff` : 'Liftoff';
    return () => {
      document.title = 'Liftoff';
    };
  }, [secondsLeft, running, mode]);

  const start = () => {
    setEndsAt(Date.now() + secondsLeft * 1000);
    setRunning(true);
  };
  const pause = () => {
    setRunning(false);
    setEndsAt(null);
  };
  const reset = () => {
    setRunning(false);
    setEndsAt(null);
    setSecondsLeft(modeMinutes(mode) * 60);
  };
  const skip = () => {
    if (mode === 'focus') {
      const isLong = round % pomodoro.roundsBeforeLong === 0;
      switchMode(isLong ? 'longBreak' : 'shortBreak', round);
    } else {
      switchMode('focus', round + 1);
    }
  };

  const mm = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
  const ss = (secondsLeft % 60).toString().padStart(2, '0');

  // Stats
  const focusToday = focusSessions
    .filter((s) => s.kind === 'focus' && isToday(new Date(s.date)))
    .reduce((acc, s) => acc + s.durationMins, 0);
  const sessionsToday = focusSessions.filter(
    (s) => s.kind === 'focus' && isToday(new Date(s.date)),
  ).length;
  const totalFocus = focusSessions
    .filter((s) => s.kind === 'focus')
    .reduce((acc, s) => acc + s.durationMins, 0);

  // Ring geometry
  const R = 130;
  const C = 2 * Math.PI * R;

  return (
    <div className="animate-rise">
      <PageHeader
        title="Focus"
        subtitle="Deep work in focused intervals. No distractions."
        icon={<Timer className="w-5 h-5" />}
      />

      {/* Mode switch */}
      <div className="flex items-center justify-center gap-1 mb-8 p-1 rounded-lg bg-elevated border border-border w-fit mx-auto">
        {(Object.keys(MODE_META) as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m, round)}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors',
              mode === m ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
            )}
          >
            {MODE_META[m].icon}
            {MODE_META[m].label}
          </button>
        ))}
      </div>

      {/* Timer ring */}
      <div className="flex flex-col items-center">
        <div className="relative w-80 h-80 flex items-center justify-center mb-10 neo-dial mx-auto">
          <div className="absolute inset-4 neo-dial-inner flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 300 300">
              <circle cx="150" cy="150" r={R} fill="none" stroke="var(--border)" strokeWidth="8" />
              <circle
                cx="150"
                cy="150"
                r={R}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - progress)}
                style={{ transition: 'stroke-dashoffset 0.5s linear', filter: 'drop-shadow(0 0 8px var(--glow-color))' }}
              />
            </svg>
            <div className="flex flex-col items-center z-10">
              <p className="font-display text-7xl font-extrabold tabular-nums tracking-tight">
                {mm}<span className="opacity-50">:</span>{ss}
              </p>
              <p className="text-sm text-[var(--accent)] font-bold mt-2 flex items-center gap-1.5 uppercase tracking-widest">
                {MODE_META[mode].icon}
                {MODE_META[mode].label} · R{round}
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 mt-8">
          <button onClick={reset} className="btn btn-secondary p-3" aria-label="Reset">
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            onClick={running ? pause : start}
            className="btn btn-primary px-8 py-3.5 text-base"
          >
            {running ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            {running ? 'Pause' : 'Start'}
          </button>
          <button onClick={skip} className="btn btn-secondary p-3" aria-label="Skip">
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {mode === 'focus' && (
          <input
            value={taskLabel}
            onChange={(e) => setTaskLabel(e.target.value)}
            placeholder="What are you working on?"
            className="input max-w-sm mt-6 text-center"
          />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mt-12 max-w-2xl mx-auto">
        <StatCard label="Focus today" value={`${focusToday}m`} icon={<Timer className="w-4 h-4" />} />
        <StatCard label="Sessions today" value={sessionsToday} icon={<Brain className="w-4 h-4" />} />
        <StatCard
          label="Total focus"
          value={`${Math.floor(totalFocus / 60)}h ${totalFocus % 60}m`}
          icon={<Timer className="w-4 h-4" />}
        />
      </div>
    </div>
  );
}
