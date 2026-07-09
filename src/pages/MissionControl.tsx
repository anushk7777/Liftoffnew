import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import { Rocket, Target, Check, ArrowUpRight, Pencil, Radio, Zap, ChevronRight } from 'lucide-react';
import { useStore } from '../store/useStore';
import { getBriefing } from '../lib/coach';
import type { CoachState } from '../lib/coach';
import { nextMission, recentWins, trajectoryTone } from '../lib/mission';
import { AnimatedNumber } from '../components/ui';
import { stagger, rise, pop, springSoft, useReducedMotion } from '../lib/motion';
import MemoriesCard from '../kairos/MemoriesCard';

function MissionEditor({ onClose }: { onClose: () => void }) {
  const { mission, setMission, targetDate, setTargetDate } = useStore();
  const [text, setText] = useState(mission);
  const [date, setDate] = useState(targetDate);
  return (
    <div className="card p-5" style={{ background: 'var(--card-grad)' }}>
      <label className="section-label">Your mission</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        autoFocus
        placeholder="What are you launching toward? (e.g. Land a senior engineer role)"
        className="w-full bg-transparent resize-none outline-none font-display text-2xl leading-tight text-ink placeholder:text-ink-subtle mt-1"
      />
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <label className="text-xs text-ink-muted">Launch date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input !py-1.5 !px-2 text-sm w-auto" />
        <div className="ml-auto flex gap-2">
          <button onClick={onClose} className="btn btn-secondary !py-1.5 !px-3 text-sm">Cancel</button>
          <button
            onClick={() => { setMission(text.trim()); setTargetDate(date); onClose(); }}
            className="btn !py-1.5 !px-4 text-sm text-white"
            style={{ background: 'var(--mission-grad)' }}
          >
            Set mission
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MissionControl() {
  const rm = useReducedMotion();
  const navigate = useNavigate();
  const {
    mission, targetDate, phases, tasks, setTaskStatus, toggleRoadmapTask,
    focusSessions, ideas, activityHistory, streak, pomodoro, habits, habitLog, journeyStart,
  } = useStore();

  const [editing, setEditing] = useState(false);
  const [burst, setBurst] = useState(false);

  const briefing = useMemo(() => {
    const state: CoachState = { phases, tasks, focusSessions, ideas, activityHistory, streak, pomodoro, habits, habitLog, targetDate, journeyStart };
    return getBriefing(state);
  }, [phases, tasks, focusSessions, ideas, activityHistory, streak, pomodoro, habits, habitLog, targetDate, journeyStart]);

  const step = useMemo(() => nextMission(phases, tasks), [phases, tasks]);
  const wins = useMemo(() => recentWins(tasks), [tasks]);
  const tone = trajectoryTone(briefing.status);
  const daysLeft = briefing.daysLeft;
  const actual = Math.round(briefing.actualPct);
  const expected = Math.round(briefing.expectedPct);
  const hasRoadmap = briefing.status !== 'idle';

  const completeStep = () => {
    if (!step) return;
    if (step.kind === 'roadmap' && step.roadmap) toggleRoadmapTask(step.roadmap.phaseId, step.roadmap.weekId, step.roadmap.taskId);
    else if (step.taskId) setTaskStatus(step.taskId, 'done');
    setBurst(true);
    setTimeout(() => setBurst(false), 1300);
  };

  return (
    <div className="relative">
      <div className="fixed inset-0 mission-aura pointer-events-none opacity-90 z-0" />
      <motion.div
        variants={rm ? undefined : stagger}
        initial={rm ? undefined : 'hidden'}
        animate={rm ? undefined : 'show'}
        className="relative z-10 w-full flex flex-col gap-6 pb-16 max-w-3xl mx-auto"
      >
        {/* Eyebrow */}
        <motion.div variants={rm ? undefined : rise} className="flex items-center gap-2 pt-2">
          <Radio className="w-4 h-4" style={{ color: 'var(--mission)' }} />
          <span className="text-[11px] font-bold tracking-[0.22em] uppercase text-ink-muted">Mission Control</span>
          <span className="ml-auto text-[11px] font-medium tracking-wide uppercase text-ink-subtle">{format(new Date(), 'EEE · MMM d')}</span>
        </motion.div>

        {/* The Mission */}
        {editing ? (
          <motion.div variants={rm ? undefined : rise}>
            <MissionEditor onClose={() => setEditing(false)} />
          </motion.div>
        ) : mission ? (
          <motion.button
            variants={rm ? undefined : rise}
            onClick={() => setEditing(true)}
            className="text-left group"
          >
            <div className="flex items-start gap-2">
              <h1 className="font-display text-3xl sm:text-4xl leading-[1.1] text-ink flex-1">{mission}</h1>
              <Pencil className="w-4 h-4 mt-2 text-ink-subtle opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              <span className="font-mono-data font-semibold" style={{ color: 'var(--mission)' }}>T‑minus {daysLeft} days</span>
              {' '}to launch · {format(new Date(targetDate), 'MMM d, yyyy')}
            </p>
          </motion.button>
        ) : (
          <motion.button
            variants={rm ? undefined : rise}
            onClick={() => setEditing(true)}
            className="card p-6 text-left hover:border-[var(--border-strong)] transition-colors"
            style={{ background: 'var(--card-grad)' }}
          >
            <Target className="w-7 h-7 mb-3" style={{ color: 'var(--mission)' }} />
            <h1 className="font-display text-2xl text-ink">Name your mission</h1>
            <p className="text-sm text-ink-muted mt-1">One goal you're launching toward. Everything here orients to it.</p>
          </motion.button>
        )}

        {/* Trajectory */}
        <motion.div variants={rm ? undefined : rise} className="card p-5" style={{ background: 'var(--card-grad)' }}>
          <div className="flex items-center justify-between">
            <span className="section-label">Trajectory</span>
            <span className="text-sm font-semibold" style={{ color: tone.color }}>{tone.label}</span>
          </div>

          {hasRoadmap ? (
            <>
              <div className="flex items-end gap-2 mt-3">
                <span className="font-display text-5xl leading-none" style={{ color: 'var(--mission)' }}>
                  <AnimatedNumber value={actual} />%
                </span>
                <span className="text-sm text-ink-muted mb-1">to launch</span>
              </div>
              {/* Ascent track: fill = actual, marker = on-pace expected */}
              <div className="relative mt-4 h-3 rounded-full bg-elevated overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'var(--mission-grad)' }}
                  initial={rm ? { width: `${actual}%` } : { width: 0 }}
                  animate={{ width: `${actual}%` }}
                  transition={{ duration: 0.9, ease: [0.21, 1, 0.4, 1] }}
                />
              </div>
              <div className="relative h-4">
                <div className="absolute top-0 -translate-x-1/2 flex flex-col items-center" style={{ left: `${Math.min(100, expected)}%` }}>
                  <div className="w-px h-2 bg-[var(--border-strong)]" />
                  <span className="text-[10px] text-ink-subtle whitespace-nowrap">on‑pace {expected}%</span>
                </div>
              </div>
              <p className="text-xs text-ink-muted mt-1">{briefing.detail}</p>
            </>
          ) : (
            <button onClick={() => navigate('/roadmap')} className="mt-3 w-full text-left flex items-center gap-3 group">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--mission-soft)' }}>
                <Rocket className="w-5 h-5" style={{ color: 'var(--mission)' }} />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-ink">Chart your trajectory</span>
                <span className="block text-xs text-ink-muted">Break the mission into a roadmap so I can track your pace.</span>
              </span>
              <ChevronRight className="w-5 h-5 text-ink-subtle group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
        </motion.div>

        {/* Today's mission — the single next step */}
        <motion.div variants={rm ? undefined : rise} className="card p-5 relative overflow-hidden" style={{ borderColor: 'color-mix(in srgb, var(--mission) 30%, transparent)' }}>
          <span className="section-label">Today's mission</span>
          {step ? (
            <div className="mt-2 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl text-ink leading-snug">{step.title}</p>
                {step.context && <p className="text-xs text-ink-subtle mt-1 truncate">{step.context}</p>}
              </div>
              <motion.button
                whileTap={rm ? undefined : { scale: 0.92 }}
                transition={pop}
                onClick={completeStep}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white"
                style={{ background: 'var(--mission-grad)' }}
              >
                <Check className="w-4 h-4" /> Complete
              </motion.button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">All systems go — nothing queued. <button onClick={() => navigate('/roadmap')} className="font-semibold" style={{ color: 'var(--mission)' }}>Add your next step →</button></p>
          )}
          <AnimatePresence>
            {burst && (
              <motion.div
                initial={rm ? { opacity: 1 } : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={springSoft}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ background: 'color-mix(in srgb, var(--mission) 10%, transparent)' }}
              >
                <span className="inline-flex items-center gap-1.5 font-display text-2xl" style={{ color: 'var(--mission)' }}>
                  <Zap className="w-6 h-6" /> Logged — climbing
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Engage (focus) + Launch log */}
        <motion.button
          variants={rm ? undefined : rise}
          onClick={() => navigate('/focus')}
          className="card p-4 flex items-center gap-3 hover:border-[var(--border-strong)] transition-colors text-left"
        >
          <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--mission-soft)' }}>
            <Zap className="w-5 h-5" style={{ color: 'var(--mission)' }} />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold text-ink">Engage — deep work</span>
            <span className="block text-xs text-ink-muted">{pomodoro.focusMins}-minute focus block on the mission</span>
          </span>
          <ArrowUpRight className="w-5 h-5 text-ink-subtle" />
        </motion.button>

        <MemoriesCard />

        <motion.div variants={rm ? undefined : rise}>
          <span className="section-label">Launch log</span>
          {wins.length ? (
            <div className="mt-2 space-y-1.5">
              {wins.map((w) => (
                <div key={w.id} className="flex items-center gap-2.5 text-sm">
                  <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--success)' }} />
                  <span className="text-ink truncate flex-1">{w.title}</span>
                  <span className="text-xs text-ink-subtle shrink-0">{formatDistanceToNow(new Date(w.at), { addSuffix: true })}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-subtle">Your completed steps will log here — proof of the climb.</p>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
