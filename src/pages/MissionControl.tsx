import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { Check, Clock, ChevronRight, Target, Map } from 'lucide-react';
import { stagger, rise, useReducedMotion } from '../lib/motion';
import { useStore } from '../store/useStore';
import { getBriefing } from '../lib/coach';
import type { CoachState } from '../lib/coach';
import { nextMission, recentWins, trajectoryTone } from '../lib/mission';

const tnum = { fontVariantNumeric: 'tabular-nums' } as const;

function relTime(iso: string, now: number): string {
  const days = Math.floor((now - Date.parse(iso)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const w = Math.floor(days / 7);
  return w === 1 ? '1 week ago' : `${w} weeks ago`;
}

function MissionEditor({ onClose }: { onClose: () => void }) {
  const { mission, setMission, targetDate, setTargetDate } = useStore();
  const [text, setText] = useState(mission);
  const [date, setDate] = useState(targetDate);
  return (
    <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5" style={{ boxShadow: 'var(--shadow-md)' }}>
      <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">Your goal</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        autoFocus
        placeholder="What are you working toward? (e.g. Become a senior software engineer)"
        className="w-full bg-transparent resize-none outline-none text-[1.6rem] leading-tight font-semibold tracking-tight text-[var(--text)] placeholder:text-[var(--text-subtle)] mt-2"
      />
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <label className="text-xs text-[var(--text-muted)]">Target date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5" />
        <div className="ml-auto flex gap-2">
          <button onClick={onClose} className="text-sm font-medium px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover)]">Cancel</button>
          <button
            onClick={() => { setMission(text.trim()); setTargetDate(date); onClose(); }}
            className="text-sm font-semibold px-4 py-1.5 rounded-lg text-[var(--accent-text)]"
            style={{ background: 'var(--accent)' }}
          >
            Set goal
          </button>
        </div>
      </div>
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">{children}</span>
);

export default function MissionControl() {
  const navigate = useNavigate();
  const rm = useReducedMotion();
  const {
    mission, targetDate, phases, tasks, setTaskStatus, toggleRoadmapTask,
    focusSessions, ideas, activityHistory, streak, pomodoro, habits, habitLog, journeyStart,
  } = useStore();
  const [editing, setEditing] = useState(false);
  const [now] = useState(() => Date.now());

  const briefing = useMemo(() => {
    const state: CoachState = { phases, tasks, focusSessions, ideas, activityHistory, streak, pomodoro, habits, habitLog, targetDate, journeyStart };
    return getBriefing(state);
  }, [phases, tasks, focusSessions, ideas, activityHistory, streak, pomodoro, habits, habitLog, targetDate, journeyStart]);

  const step = useMemo(() => nextMission(phases, tasks), [phases, tasks]);
  const wins = useMemo(() => recentWins(tasks), [tasks]);
  const focus7d = useMemo(() => {
    const cut = now - 7 * 86400000;
    return focusSessions.filter((s) => s.kind === 'focus' && Date.parse(s.date) >= cut).reduce((a, s) => a + (s.durationMins || 0), 0);
  }, [focusSessions, now]);

  const tone = trajectoryTone(briefing.status);
  const actual = Math.round(briefing.actualPct);
  const expected = Math.round(briefing.expectedPct);
  const daysLeft = briefing.daysLeft;
  const hasRoadmap = briefing.status !== 'idle';

  // ring geometry
  const R = 45;
  const C = 2 * Math.PI * R;

  const completeStep = () => {
    if (!step) return;
    if (step.kind === 'roadmap' && step.roadmap) toggleRoadmapTask(step.roadmap.phaseId, step.roadmap.weekId, step.roadmap.taskId);
    else if (step.taskId) setTaskStatus(step.taskId, 'done');
  };

  return (
    <motion.div
      variants={stagger}
      initial={rm ? false : 'hidden'}
      animate="show"
      className="w-full max-w-2xl mx-auto flex flex-col gap-6 pb-10"
    >
      {/* top row */}
      <motion.div variants={rise} className="flex items-center justify-between pt-1">
        <Label>Today</Label>
        <span className="text-xs text-[var(--text-subtle)]" style={tnum}>{format(now, 'EEE, MMM d')}</span>
      </motion.div>

      {/* mission statement */}
      {editing ? (
        <MissionEditor onClose={() => setEditing(false)} />
      ) : mission ? (
        <button onClick={() => setEditing(true)} className="text-left -mt-2">
          <h1 className="text-[1.85rem] sm:text-[2.1rem] leading-[1.15] font-semibold tracking-tight text-[var(--text)] text-balance">{mission}</h1>
          <p className="mt-3 text-[15px] text-[var(--text-muted)]">
            <b className="text-[var(--text)] font-semibold" style={tnum}>{daysLeft} days</b> to go · {format(new Date(targetDate), 'MMM d, yyyy')}
          </p>
        </button>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-left rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 hover:border-[var(--border-strong)] transition-colors"
          style={{ boxShadow: 'var(--shadow-sm)' }}
        >
          <span className="inline-flex w-10 h-10 rounded-xl items-center justify-center mb-3" style={{ background: 'var(--accent-soft)' }}>
            <Target className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Set your goal</h1>
          <p className="text-[15px] text-[var(--text-muted)] mt-1">One thing you're working toward. Everything here orients to it.</p>
        </button>
      )}

      {/* trajectory */}
      <motion.section variants={rise} className="lift rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center justify-between mb-4">
          <Label>Progress</Label>
          <span className="text-[12.5px] font-semibold flex items-center gap-1.5" style={{ color: tone.color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.color }} />
            {tone.label}
          </span>
        </div>
        {hasRoadmap ? (
          <div className="flex items-center gap-5">
            <div className="relative w-[104px] h-[104px] shrink-0">
              <svg viewBox="0 0 104 104" width="104" height="104">
                <circle cx="52" cy="52" r={R} fill="none" stroke="var(--border)" strokeWidth="8" />
                <circle cx="52" cy="52" r={R} fill="none" stroke="var(--cozy)" strokeWidth="8" strokeLinecap="round" transform="rotate(-90 52 52)" strokeDasharray={C} strokeDashoffset={C * (1 - actual / 100)} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[26px] font-bold tracking-tight text-[var(--text)]" style={tnum}>{actual}<span className="text-[15px]">%</span></span>
                <span className="text-[10px] text-[var(--text-muted)]">complete</span>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-3">
              <div className="flex justify-between items-baseline text-[13px]">
                <span className="text-[var(--text-muted)]">On-pace target</span>
                <span className="font-semibold" style={tnum}>{expected}%</span>
              </div>
              <div className="flex justify-between items-baseline text-[13px]">
                <span className="text-[var(--text-muted)]">Days remaining</span>
                <span className="font-semibold" style={tnum}>{daysLeft}</span>
              </div>
              <p className="text-[12.5px] text-[var(--text-muted)] leading-relaxed">{briefing.detail}</p>
            </div>
          </div>
        ) : (
          <button onClick={() => navigate('/roadmap')} className="w-full text-left flex items-center gap-3 group">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--accent-soft)' }}>
              <Map className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-[var(--text)]">Map out your plan</span>
              <span className="block text-[13px] text-[var(--text-muted)]">Break your goal into a roadmap to track your pace.</span>
            </span>
            <ChevronRight className="w-5 h-5 text-[var(--text-subtle)] group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}
      </motion.section>

      {/* next objective */}
      <motion.section variants={rise} className="lift rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center justify-between mb-3">
          <Label>Up next</Label>
          {step?.context && <span className="text-xs text-[var(--text-subtle)]">{step.context}</span>}
        </div>
        {step ? (
          <>
            <p className="text-[19px] font-semibold tracking-tight leading-snug text-[var(--text)]">{step.title}</p>
            <button
              onClick={completeStep}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold text-[var(--accent-text)] active:scale-[0.99] transition-transform"
              style={{ background: 'var(--accent)' }}
            >
              <Check className="w-4 h-4" /> Mark complete
            </button>
          </>
        ) : (
          <p className="text-[15px] text-[var(--text-muted)]">Nothing queued. <button onClick={() => navigate('/roadmap')} className="font-semibold" style={{ color: 'var(--cozy)' }}>Add your next step →</button></p>
        )}
      </motion.section>

      {/* telemetry */}
      <motion.section variants={rise} className="lift rounded-2xl bg-[var(--surface)] border border-[var(--border)] grid grid-cols-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
        {[
          { n: String(daysLeft), s: '', l: 'Days left' },
          { n: String(streak), s: ' day', l: 'Streak' },
          { n: (focus7d / 60).toFixed(1), s: ' h', l: 'Focus · 7d' },
        ].map((c, i) => (
          <div key={c.l} className={`px-4 py-4 ${i > 0 ? 'border-l border-[var(--border)]' : ''}`}>
            <div className="text-[22px] font-bold tracking-tight text-[var(--text)]" style={tnum}>{c.n}<span className="text-[13px] text-[var(--text-muted)] font-medium">{c.s}</span></div>
            <div className="text-[11px] text-[var(--text-subtle)] mt-1">{c.l}</div>
          </div>
        ))}
      </motion.section>

      {/* launch log */}
      <motion.section variants={rise} className="lift rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <h4 className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)] mb-4 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Recent wins
        </h4>
        {wins.length ? (
          <div className="flex flex-col gap-4">
            {wins.map((w) => (
              <div key={w.id} className="flex gap-3">
                <span className="w-[7px] h-[7px] rounded-full mt-[7px] shrink-0" style={{ background: 'var(--success)' }} />
                <div>
                  <div className="text-sm text-[var(--text)] leading-snug">{w.title}</div>
                  <div className="text-[11.5px] text-[var(--text-subtle)] mt-0.5">{relTime(w.at, now)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-subtle)]">Your completed steps will appear here.</p>
        )}
      </motion.section>
    </motion.div>
  );
}
