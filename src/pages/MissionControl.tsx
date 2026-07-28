// The Focus home screen.
//
// What this replaced, and why — the full reasoning lives in
// innovation/FOCUS_LOGIC.md:
//
//   * A "Recent wins" list of completed tasks. Those already sit on the Tasks
//     page under Completed, so finishing work ADDED to your home screen instead
//     of clearing it. Removed outright.
//   * A "Progress — Not started / Map out your plan" card that ignored tasks,
//     habits, focus time and streak, and told an active user they had not
//     begun, because it could only read a roadmap.
//   * A 120-day countdown, printed twice. Distance remaining is pressure;
//     Amabile & Kramer's diary study (~12,000 entries, 238 people) found
//     progress made is what marks a good day.
//   * A single "Up next" task whose only action was to make it disappear.
//
// What is here instead: TODAY (what is actually due, tickable), MOMENTUM (what
// moved, against your own last week), CONSISTENCY (a rate, not a brittle
// streak), and THIS WEEK (a finish line close enough to pull toward).
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { Check, ChevronRight, Target, Sunrise, TrendingUp, TrendingDown, Minus, CalendarCheck } from 'lucide-react';
import { stagger, rise, useReducedMotion } from '../lib/motion';
import { useStore } from '../store/useStore';
import { todayPlan, consistency, weekMomentum, weekReview } from '../focus/today';
import type { TodayItem } from '../focus/today';

const tnum = { fontVariantNumeric: 'tabular-nums' } as const;

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
        aria-label="Your goal"
        placeholder="What are you working toward? (e.g. Become a senior software engineer)"
        className="w-full bg-transparent resize-none outline-none text-[1.6rem] leading-tight font-semibold tracking-tight text-[var(--text)] placeholder:text-[var(--text-subtle)] mt-2"
      />
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <label htmlFor="goal-target" className="text-xs text-[var(--text-muted)]">Target date</label>
        <input id="goal-target" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 min-h-[44px]" />
        <div className="ml-auto flex gap-2">
          <button onClick={onClose} className="text-sm font-medium px-3 min-h-[44px] rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover)]">Cancel</button>
          <button
            onClick={() => { setMission(text.trim()); setTargetDate(date); onClose(); }}
            className="text-sm font-semibold px-4 min-h-[44px] rounded-lg text-[var(--accent-text)]"
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
  <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-muted)]">{children}</span>
);

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <motion.section
    variants={rise}
    className={`lift rounded-2xl bg-[var(--surface)] border border-[var(--border)] ${className}`}
    style={{ boxShadow: 'var(--shadow-sm)' }}
  >
    {children}
  </motion.section>
);

/** One tickable line of today — a task or a habit, deliberately identical.
 *
 *  A habit and a task feel the same at the moment of doing them, and splitting
 *  them into two lists made the day look longer than it is. */
function TodayRow({ item, onToggle }: { item: TodayItem; onToggle: () => void }) {
  const late = !item.done && (item.overdueBy ?? 0) > 0;
  return (
    <button
      onClick={onToggle}
      aria-pressed={item.done}
      className="w-full flex items-center gap-3 px-4 min-h-[52px] py-2 text-left hover:bg-[var(--hover)] transition-colors"
    >
      <span
        className="w-[22px] h-[22px] rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
        style={{
          borderColor: item.done ? 'var(--success)' : 'var(--border-strong)',
          background: item.done ? 'var(--success)' : 'transparent',
        }}
      >
        {item.done && <Check className="w-3 h-3" style={{ color: 'var(--bg)' }} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] leading-snug ${item.done ? 'line-through text-[var(--text-subtle)]' : 'text-[var(--text)]'}`}>
          {item.emoji ? `${item.emoji} ` : ''}{item.title}
        </span>
        {(item.at || late || item.category) && (
          <span className="block text-[12px] mt-0.5 text-[var(--text-muted)]">
            {item.at && <span style={tnum}>{item.at}</span>}
            {item.at && (late || item.category) && ' · '}
            {late && (
              <span style={{ color: 'var(--danger)' }}>
                {item.overdueBy === 1 ? '1 day late' : `${item.overdueBy} days late`}
              </span>
            )}
            {late && item.category && ' · '}
            {item.category}
          </span>
        )}
      </span>
    </button>
  );
}

export default function MissionControl() {
  const navigate = useNavigate();
  const rm = useReducedMotion();
  const {
    mission, targetDate, tasks, setTaskStatus, focusSessions,
    activityHistory, habits, habitLog, toggleHabitToday,
  } = useStore();
  const [editing, setEditing] = useState(false);
  const [now] = useState(() => new Date());

  const plan = useMemo(() => todayPlan(tasks, habits, habitLog, now), [tasks, habits, habitLog, now]);
  const streak14 = useMemo(() => consistency(activityHistory, 14, now), [activityHistory, now]);
  const momentum = useMemo(() => weekMomentum(tasks, focusSessions, habitLog, now), [tasks, focusSessions, habitLog, now]);
  const week = useMemo(() => weekReview(tasks, focusSessions, habits, habitLog, now), [tasks, focusSessions, habits, habitLog, now]);

  const toggle = (item: TodayItem) => {
    if (item.kind === 'habit') toggleHabitToday(item.id);
    else setTaskStatus(item.id, item.done ? 'todo' : 'done');
  };

  const allDone = plan.total > 0 && plan.done === plan.total;

  return (
    <motion.div
      variants={stagger}
      initial={rm ? false : 'hidden'}
      animate="show"
      className="w-full max-w-2xl mx-auto flex flex-col gap-5 pb-10"
    >
      <motion.div variants={rise} className="flex items-center justify-between pt-1">
        <Label>Today</Label>
        <span className="text-xs text-[var(--text-muted)]" style={tnum}>{format(now, 'EEE, MMM d')}</span>
      </motion.div>

      {/* The goal, stated once. The countdown that used to sit here has moved
          to the week card — 120 days is not a finish line you can pull toward. */}
      {editing ? (
        <MissionEditor onClose={() => setEditing(false)} />
      ) : mission ? (
        <button onClick={() => setEditing(true)} className="text-left -mt-1">
          <h1 className="text-[1.7rem] sm:text-[2rem] leading-[1.15] font-semibold tracking-tight text-[var(--text)] text-balance">{mission}</h1>
          {targetDate && (
            <p className="mt-2 text-[13px] text-[var(--text-muted)]">by {format(new Date(targetDate), 'MMM yyyy')}</p>
          )}
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

      {/* TODAY — the plan. Masicampo & Baumeister (2011): a specific plan for an
          unfinished goal removes the intrusive-thought cost of carrying it. */}
      <Card>
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <Label>Your day</Label>
          {plan.total > 0 && (
            <span className="text-[12.5px] font-semibold text-[var(--text-muted)]" style={tnum}>
              {plan.done}/{plan.total}
            </span>
          )}
        </div>
        {plan.total > 0 && (
          <div className="mx-4 mb-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--elevated)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: allDone ? 'var(--success)' : 'var(--cozy)' }}
              initial={rm ? { width: `${(plan.done / plan.total) * 100}%` } : { width: 0 }}
              animate={{ width: `${(plan.done / plan.total) * 100}%` }}
              transition={{ duration: 0.5, ease: [0.21, 1, 0.4, 1] }}
            />
          </div>
        )}
        {plan.empty ? (
          <div className="px-4 pb-5">
            <p className="text-[15px] text-[var(--text)]">Nothing scheduled today.</p>
            <p className="text-[13px] text-[var(--text-muted)] mt-1">
              Give a task a due date, or add a habit, and it shows up here.
            </p>
            <button
              onClick={() => navigate('/tasks')}
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold min-h-[40px]"
              style={{ color: 'var(--cozy)' }}
            >
              Plan today <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
              {plan.items.map((i) => (
                <TodayRow key={`${i.kind}-${i.id}`} item={i} onToggle={() => toggle(i)} />
              ))}
            </div>
            {allDone && (
              <p className="px-4 py-3 text-[13px] font-medium border-t border-[var(--border)]" style={{ color: 'var(--success)' }}>
                <Sunrise className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                That's everything you planned for today.
              </p>
            )}
          </>
        )}
      </Card>

      {/* MOMENTUM — progress made, against your own previous week. Never a
          target set months ago, which mostly measures how optimistic you were
          that day. */}
      <Card className="p-4">
        <Label>This week vs last</Label>
        <div className="grid grid-cols-3 gap-2 mt-3">
          {momentum.map((s) => {
            const Icon = s.dir === 'up' ? TrendingUp : s.dir === 'down' ? TrendingDown : Minus;
            const color = s.dir === 'up' ? 'var(--success)' : s.dir === 'down' ? 'var(--text-muted)' : 'var(--text-muted)';
            return (
              <div key={s.label} className="rounded-xl px-3 py-3" style={{ background: 'var(--elevated)' }}>
                <div className="text-[21px] font-bold tracking-tight text-[var(--text)] leading-none" style={tnum}>
                  {s.value}
                  {s.unit && <span className="text-[13px] text-[var(--text-muted)] font-medium">{s.unit}</span>}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-1.5 leading-tight">{s.label}</div>
                {/* No arrow at all until there is a real week behind you —
                    inventing a direction from one week of data is the same
                    mistake the training side had to be rebuilt to stop. */}
                {s.dir && (
                  <div className="flex items-center gap-1 mt-1 text-[11px]" style={{ color }}>
                    <Icon className="w-3 h-3" />
                    <span style={tnum}>{s.prev}{s.unit} last</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* CONSISTENCY — a rate, not a streak. Lally et al. (2010) found missing a
          single day leaves the habit curve intact, so a counter that resets to
          zero states something false on the day it hurts most. */}
      <Card className="p-4">
        <div className="flex items-baseline justify-between">
          <Label>Consistency</Label>
          <span className="text-[12.5px] text-[var(--text-muted)]">last 14 days</span>
        </div>
        <p className="mt-2 text-[19px] font-semibold tracking-tight text-[var(--text)]" style={tnum}>
          {streak14.hit}<span className="text-[var(--text-muted)] font-normal"> of {streak14.total} days</span>
        </p>
        <div className="mt-3 flex gap-[3px]" aria-label={`${streak14.hit} of the last ${streak14.total} days active`}>
          {streak14.days.map((d) => (
            <span
              key={d.key}
              title={d.key}
              className="flex-1 h-6 rounded-[3px]"
              style={{ background: d.hit ? 'var(--cozy)' : 'var(--elevated)' }}
            />
          ))}
        </div>
        <p className="mt-2.5 text-[12px] text-[var(--text-muted)] leading-relaxed">
          One missed day doesn't undo anything — habit strength builds over months, not days.
        </p>
      </Card>

      {/* THIS WEEK — a finish line near enough to pull toward. Kivetz et al.
          (2006): effort accelerates as a reachable goal approaches. */}
      <Card className="p-4">
        <div className="flex items-baseline justify-between">
          <Label>This week</Label>
          <span className="text-[12.5px] text-[var(--text-muted)]" style={tnum}>
            {format(new Date(`${week.from}T12:00:00`), 'MMM d')} – {format(now, 'MMM d')}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
          <span className="text-[var(--text-muted)]">
            <b className="text-[var(--text)] text-[15px]" style={tnum}>{week.closed}</b> closed
          </span>
          <span className="text-[var(--text-muted)]">
            <b className="text-[var(--text)] text-[15px]" style={tnum}>{week.focusHours}</b>h focused
          </span>
          {week.habitDue > 0 && (
            <span className="text-[var(--text-muted)]">
              <b className="text-[var(--text)] text-[15px]" style={tnum}>{week.habitHits}</b>/{week.habitDue} habits
            </span>
          )}
        </div>
        {week.slipped > 0 ? (
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <p className="text-[13px] text-[var(--text-muted)]">
              <b className="text-[var(--text)]">{week.slipped}</b> {week.slipped === 1 ? 'task' : 'tasks'} slipped past their day
              {week.slippedTitles.length > 0 && <> — {week.slippedTitles.join(', ')}</>}
            </p>
            <button
              onClick={() => navigate('/tasks')}
              className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold min-h-[40px]"
              style={{ color: 'var(--cozy)' }}
            >
              Reschedule them <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          week.closed > 0 && (
            <p className="mt-3 pt-3 border-t border-[var(--border)] text-[13px] flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
              <CalendarCheck className="w-4 h-4" /> Nothing has slipped this week.
            </p>
          )
        )}
      </Card>
    </motion.div>
  );
}
