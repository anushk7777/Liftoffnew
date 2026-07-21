import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, SkipForward, Timer, Coffee, Brain } from 'lucide-react';
import { isToday } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/useStore';
import { cn, safeSetItem } from '../lib/utils';
import { beep } from '../lib/sound';
import { stagger, rise, useReducedMotion } from '../lib/motion';
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
  const rm = useReducedMotion();
  const { pomodoro, focusSessions, logFocusSession, tasks, focusTaskId, setFocusTaskId } = useStore();

  const [saved] = useState<SavedFocus | null>(() => readSavedFocus());

  const [mode, setMode] = useState<Mode>(saved?.mode ?? 'focus');
  const [round, setRound] = useState(saved?.round ?? 1);
  // Consume a task pushed from the Tasks page ("Focus on this") at mount.
  const [taskId, setTaskId] = useState<string | null>(() => useStore.getState().focusTaskId ?? null);
  const [taskLabel, setTaskLabel] = useState(() => {
    if (saved?.taskLabel) return saved.taskLabel;
    const id = useStore.getState().focusTaskId;
    return (id && useStore.getState().tasks.find((t) => t.id === id)?.title) || '';
  });
  const openTasks = tasks.filter((t) => t.status !== 'done');

  // Clear the one-shot push marker once consumed.
  useEffect(() => {
    if (focusTaskId) setFocusTaskId(null);
  }, [focusTaskId, setFocusTaskId]);
  const [endsAt, setEndsAt] = useState<number | null>(() =>
    saved && saved.endsAt > Date.now() ? saved.endsAt : null,
  );
  const [running, setRunning] = useState(() => !!(saved && saved.endsAt > Date.now()));
  const [celebrate, setCelebrate] = useState(false);
  const [now] = useState(() => Date.now());

  // Auto-clear the finish celebration.
  useEffect(() => {
    if (!celebrate) return;
    const id = setTimeout(() => setCelebrate(false), 2600);
    return () => clearTimeout(id);
  }, [celebrate]);

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
      setCelebrate(true);
      logFocusSession(pomodoro.focusMins, 'focus', taskLabel.trim() || undefined, taskId ?? undefined);
      const isLong = round % pomodoro.roundsBeforeLong === 0;
      switchMode(isLong ? 'longBreak' : 'shortBreak', round);
    } else {
      logFocusSession(modeMinutes(mode), 'break');
      switchMode('focus', round + 1);
    }
  }, [mode, round, pomodoro, taskLabel, taskId, logFocusSession, switchMode, modeMinutes]);

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
  // Rolling 7-day total — refreshes daily instead of accumulating forever.
  const weekCut = now - 7 * 86400000;
  const focusWeek = focusSessions
    .filter((s) => s.kind === 'focus' && new Date(s.date).getTime() >= weekCut)
    .reduce((acc, s) => acc + s.durationMins, 0);

  // Ring geometry (viewBox 400×400, centre 200)
  const R = 160;
  const C = 2 * Math.PI * R;

  return (
    <motion.div variants={stagger} initial={rm ? false : 'hidden'} animate="show">
      <AnimatePresence>{celebrate && !rm && <Celebration />}</AnimatePresence>

      <PageHeader
        title="Focus"
        subtitle="Deep work in focused intervals. No distractions."
        icon={<Timer className="w-5 h-5" />}
      />

      {/* Mode switch */}
      <motion.div variants={rise} className="flex items-center justify-center gap-1 mb-8 p-1 rounded-lg bg-elevated border border-border w-fit mx-auto">
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
      </motion.div>

      {/* Cosmic timer */}
      <motion.div variants={rise} className="flex flex-col items-center">
        <motion.div layout className="relative w-[340px] h-[340px] flex items-center justify-center mb-10 mx-auto">
          {/* Static ambient glow — composited once, so the ring stays 60fps. */}
          <div
            className="absolute w-[300px] h-[300px] rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, color-mix(in srgb, var(--timer-glow) 20%, transparent) 0%, transparent 68%)',
              filter: 'blur(24px)',
              opacity: running ? 0.9 : 0.5,
              transition: 'opacity 0.4s ease',
            }}
          />
          <svg width="340" height="340" viewBox="0 0 400 400" className="absolute -rotate-90">
            <defs>
              <linearGradient id="timer-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--timer-1)" />
                <stop offset="50%" stopColor="var(--timer-2)" />
                <stop offset="100%" stopColor="var(--timer-3)" />
              </linearGradient>
            </defs>

            <circle cx="200" cy="200" r={R} fill="none" stroke="var(--border)" strokeWidth="6" />

            <circle
              cx="200"
              cy="200"
              r={R}
              fill="none"
              stroke="url(#timer-gradient)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              style={{ transition: 'stroke-dashoffset 0.95s linear' }}
            />

            {running && !celebrate && (
              <motion.circle
                cx="200"
                cy="200"
                r={R}
                fill="none"
                stroke="var(--timer-2)"
                strokeWidth="2"
                initial={{ scale: 1, opacity: 0.35 }}
                animate={{ scale: 1.12, opacity: 0 }}
                transition={{ repeat: Infinity, duration: 1.6, ease: 'easeOut' }}
                style={{ transformOrigin: '200px 200px' }}
              />
            )}
          </svg>

          <div className="absolute z-10 flex flex-col items-center justify-center pointer-events-none">
            <TimeDisplay timeString={`${mm}:${ss}`} />
            <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--text-muted)]">
              {MODE_META[mode].icon}
              {running ? MODE_META[mode].label : `${MODE_META[mode].label} · R${round}`}
            </p>
          </div>
        </motion.div>

        {/* Controls */}
        <div className="flex items-center gap-6">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={reset}
            aria-label="Reset"
            className="p-4 rounded-full text-[var(--text-muted)] hover:text-[var(--text)] border border-border bg-[var(--elevated)] transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={running ? pause : start}
            aria-label={running ? 'Pause' : 'Start'}
            className="p-6 rounded-full text-white flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, var(--timer-1), var(--timer-2), var(--timer-3))',
              boxShadow: '0 10px 34px -6px var(--timer-glow)',
            }}
          >
            {running ? (
              <Pause className="w-8 h-8" fill="currentColor" />
            ) : (
              <Play className="w-8 h-8 ml-1" fill="currentColor" />
            )}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={skip}
            aria-label="Skip"
            className="p-4 rounded-full text-[var(--text-muted)] hover:text-[var(--text)] border border-border bg-[var(--elevated)] transition-colors"
          >
            <SkipForward className="w-5 h-5" />
          </motion.button>
        </div>

        {mode === 'focus' && (
          <div className="w-full max-w-sm mt-6 space-y-2">
            <input
              value={taskLabel}
              onChange={(e) => {
                setTaskLabel(e.target.value);
                setTaskId(null); // free-form text unlinks any picked task
              }}
              placeholder="What are you working on?"
              className="input w-full text-center"
            />
            {openTasks.length > 0 && (
              <select
                value={taskId ?? ''}
                onChange={(e) => {
                  const t = openTasks.find((x) => x.id === e.target.value);
                  setTaskId(t ? t.id : null);
                  if (t) setTaskLabel(t.title);
                }}
                className="input w-full text-sm"
              >
                <option value="">— or pick one of your tasks —</option>
                {openTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            )}
            {taskId && <p className="text-[11px] text-accent text-center">Linked to a task · time logs against it</p>}
          </div>
        )}
      </motion.div>

      {/* Stats */}
      <motion.div variants={rise} className="grid grid-cols-3 gap-3 mt-12 max-w-2xl mx-auto">
        <StatCard label="Focus today" value={`${focusToday}m`} icon={<Timer className="w-4 h-4" />} />
        <StatCard label="Sessions today" value={sessionsToday} icon={<Brain className="w-4 h-4" />} />
        <StatCard
          label="This week"
          value={`${Math.floor(focusWeek / 60)}h ${focusWeek % 60}m`}
          icon={<Timer className="w-4 h-4" />}
        />
      </motion.div>
    </motion.div>
  );
}

// One flip-in digit — springs up from below with a soft blur as it changes.
function Digit({ char }: { char: string }) {
  return (
    <div className="relative flex justify-center items-center w-[52px] h-[84px] overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={char}
          initial={{ y: '55%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '-55%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
          className="absolute text-7xl font-bold tracking-tighter text-[var(--text)] font-mono tabular-nums will-change-transform"
        >
          {char}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function TimeDisplay({ timeString }: { timeString: string }) {
  return (
    <div className="flex items-center justify-center">
      {timeString.split('').map((char, i) =>
        char === ':' ? (
          <span key={`c-${i}`} className="text-6xl font-bold text-[var(--text-subtle)] mx-0.5 -mt-4">
            :
          </span>
        ) : (
          <Digit key={`d-${i}`} char={char} />
        ),
      )}
    </div>
  );
}

// Precomputed once at module load — keeps render pure (no Math.random in the
// component body) and the burst pattern is indistinguishable between runs.
const CELEBRATION_COLORS = ['#ff7a5c', '#ffb07a', '#ff5c8a', '#ffd08a', '#ff9e7a', '#ffe0a3'];
const CELEBRATION_PARTICLES = Array.from({ length: 130 }).map((_, i) => ({
  angle: (Math.PI * 2 * i) / 130 + (Math.random() * 0.2 - 0.1),
  targetDistance: 120 + Math.random() * 1000,
  size: Math.random() * 11 + 4,
  duration: 1 + Math.random() * 2.4,
  color: CELEBRATION_COLORS[Math.floor(Math.random() * CELEBRATION_COLORS.length)],
  delay: Math.random() * 0.2,
}));

// A one-shot particle burst when a focus session completes.
function Celebration() {
  const particles = CELEBRATION_PARTICLES;

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] flex items-center justify-center overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 1 }}
        animate={{ opacity: [0, 0.45, 0], scale: [1, 1.1] }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
        className="absolute inset-0 mix-blend-screen backdrop-blur-[2px]"
        style={{
          background:
            'linear-gradient(120deg, color-mix(in srgb, var(--timer-1) 30%, transparent), color-mix(in srgb, var(--timer-2) 30%, transparent), color-mix(in srgb, var(--timer-3) 30%, transparent))',
        }}
      />
      <motion.div
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: 4, opacity: 0 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
        className="absolute w-64 h-64 rounded-full blur-[80px] mix-blend-screen"
        style={{ background: 'linear-gradient(90deg, var(--timer-2), var(--timer-3))' }}
      />
      <motion.div
        initial={{ scale: 0.5, opacity: 1, borderWidth: '20px' }}
        animate={{ scale: 6, opacity: 0, borderWidth: '1px' }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
        className="absolute w-64 h-64 rounded-full mix-blend-screen"
        style={{ borderStyle: 'solid', borderColor: 'var(--timer-2)' }}
      />
      {particles.map((p, i) => (
        <motion.div
          key={i}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
          animate={{
            x: Math.cos(p.angle) * p.targetDistance,
            y: Math.sin(p.angle) * p.targetDistance,
            scale: [0, 1.2, 0],
            opacity: [1, 1, 0],
          }}
          transition={{ duration: p.duration, delay: p.delay, ease: [0.19, 1, 0.22, 1] }}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}, 0 0 ${p.size * 6}px ${p.color}`,
          }}
        />
      ))}
    </div>
  );
}
