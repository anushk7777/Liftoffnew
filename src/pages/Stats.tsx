import { useMemo } from 'react';
import { subDays, format, startOfDay, isThisWeek } from 'date-fns';
import {
  BarChart3,
  Plus,
  Minus,
  Flame,
  Trophy,
  Code,
  BookOpen,
  Timer,
  Target,
  ChevronDown,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { stagger, rise, useReducedMotion } from '../lib/motion';
import { countRoadmap } from '../lib/roadmap';
import { getEvidenceStats } from '../lib/metrics';
import { PageHeader, StatCard } from '../components/ui';
import { Sparkline, MiniBars } from '../components/charts';
import { ConsistencyGraph } from '../components/ConsistencyGraph';

export default function Stats() {
  const rm = useReducedMotion();
  const {
    streak,
    longestStreak,
    activityHistory,
    problemsSolved,
    incrementProblems,
    sectionsCompleted,
    incrementSections,
    tasks,
    phases,
    focusSessions,
  } = useStore();

  const roadmap = useMemo(() => countRoadmap(phases), [phases]);

  // Every headline number is derived from real activity — evidence, not taps.
  const evidence = useMemo(
    () =>
      getEvidenceStats({
        phases,
        tasks,
        focusSessions,
        activityHistory,
        problemsSolved,
        sectionsCompleted,
      }),
    [phases, tasks, focusSessions, activityHistory, problemsSolved, sectionsCompleted],
  );
  const focusTotal = evidence.focusMinutes;
  const focusWeek = useMemo(
    () =>
      focusSessions
        .filter((s) => s.kind === 'focus' && isThisWeek(new Date(s.date), { weekStartsOn: 1 }))
        .reduce((a, s) => a + s.durationMins, 0),
    [focusSessions],
  );

  const momentum = useMemo(() => {
    const data: number[] = [];
    let cumulative = 0;
    for (let i = 29; i >= 0; i--) {
      const dateStr = startOfDay(subDays(new Date(), i)).toISOString();
      const log = activityHistory.find((l) => l.date === dateStr);
      if (log) cumulative += log.type === 'full' ? 1 : 0.5;
      data.push(cumulative);
    }
    return data;
  }, [activityHistory]);

  const focusByDay = useMemo(() => {
    const data: { label: string; value: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = subDays(new Date(), i);
      const mins = focusSessions
        .filter((s) => s.kind === 'focus' && format(new Date(s.date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'))
        .reduce((a, s) => a + s.durationMins, 0);
      data.push({ label: format(day, 'EEE'), value: mins });
    }
    return data;
  }, [focusSessions]);

  return (
    <motion.div variants={stagger} initial={rm ? false : 'hidden'} animate="show">
      <PageHeader
        title="Stats"
        subtitle="Proof you're showing up. Measure the climb."
        icon={<BarChart3 className="w-5 h-5" />}
      />

      {/* Headline stats */}
      <motion.div variants={rise} className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <StatCard label="Current streak" value={`${streak}d`} icon={<Flame className="w-4 h-4" />} accent />
        <StatCard label="Longest streak" value={`${longestStreak}d`} icon={<Trophy className="w-4 h-4" />} />
        <StatCard label="Roadmap" value={`${roadmap.percent}%`} icon={<Target className="w-4 h-4" />} />
        <StatCard
          label="Total focus"
          value={`${Math.floor(focusTotal / 60)}h ${focusTotal % 60}m`}
          icon={<Timer className="w-4 h-4" />}
        />
      </motion.div>
      <motion.div variants={rise} className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        <StatCard label="Problems solved" value={evidence.problems} icon={<Code className="w-4 h-4" />} />
        <StatCard label="Sections completed" value={evidence.sections} icon={<BookOpen className="w-4 h-4" />} />
        <StatCard label="Projects shipped" value={evidence.projects} icon={<Trophy className="w-4 h-4" />} />
        <StatCard label="Tasks done" value={evidence.tasksDone} icon={<Code className="w-4 h-4" />} />
        <StatCard label="Days active" value={evidence.activeDays} icon={<Flame className="w-4 h-4" />} />
        <StatCard label="Focus this week" value={`${focusWeek}m`} icon={<Timer className="w-4 h-4" />} />
      </motion.div>

      {/* Manual log tucked away — the headline numbers above are evidence-based. */}
      <motion.details variants={rise} className="card p-4 mb-8">
        <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-medium text-ink">
          <span>Log reps done outside Liftoff</span>
          <ChevronDown className="w-4 h-4 text-ink-subtle" />
        </summary>
        <p className="text-xs text-ink-subtle mt-2 mb-3">
          Problems and sections auto-count from your completed tasks and roadmap. Use these only to
          add reps done elsewhere (e.g. LeetCode).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Counter
            icon={<Code className="w-5 h-5" />}
            label="Manual problems"
            value={problemsSolved}
            onInc={() => incrementProblems(1)}
            onDec={() => incrementProblems(-1)}
          />
          <Counter
            icon={<BookOpen className="w-5 h-5" />}
            label="Manual sections"
            value={sectionsCompleted}
            onInc={() => incrementSections(1)}
            onDec={() => incrementSections(-1)}
          />
        </div>
      </motion.details>

      {/* Charts */}
      <motion.div variants={rise} className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <h3 className="section-label mb-4">30-day momentum</h3>
          <Sparkline data={momentum} height={176} />
        </div>

        <div className="card p-5">
          <h3 className="section-label mb-4">Focus — last 14 days (min)</h3>
          <MiniBars data={focusByDay} height={176} />
        </div>
      </motion.div>

      {/* Consistency */}
      <motion.div variants={rise} className="card p-5 overflow-hidden">
        <h3 className="section-label mb-4">Consistency — last 6 months</h3>
        <ConsistencyGraph history={activityHistory} days={182} streak={streak} />
      </motion.div>
    </motion.div>
  );
}

function Counter({
  icon,
  label,
  value,
  onInc,
  onDec,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onInc: () => void;
  onDec: () => void;
}) {
  return (
    <div className="card p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-elevated border border-border flex items-center justify-center text-ink-muted">
          {icon}
        </div>
        <div>
          <p className="font-display text-2xl font-bold text-ink">{value}</p>
          <p className="text-[11px] uppercase tracking-wider text-ink-muted">{label}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onDec} aria-label={`Decrease ${label}`} className="btn btn-secondary p-2 min-w-[44px] min-h-[44px]">
          <Minus className="w-4 h-4" />
        </button>
        <button onClick={onInc} aria-label={`Increase ${label}`} className="btn btn-primary p-2 min-w-[44px] min-h-[44px]">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
