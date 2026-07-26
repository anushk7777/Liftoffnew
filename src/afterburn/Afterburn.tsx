import { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Rocket, Plus, Check, CheckCircle2, Star, Trash2, ChevronDown, ChevronRight, ChevronLeft, Pencil, X, LayoutGrid, TrendingUp, Timer, Calculator, ArrowRight, Search, Sparkles, Dumbbell, Wind } from 'lucide-react';
import { cn } from '../lib/utils';
import { pop, springSoft, fast, useReducedMotion } from '../lib/motion';
import { useAfterburn, useAppMode, completionMap, dayCompletionKey, lastPerformance, restToSeconds, detectPRs } from './store';
import { setVerdict, ghostLabel, exerciseProgress } from './progression';
import { recoveryReadiness } from './recovery';
import { analyzeVolume } from './volume';
import WorkoutCelebration from './WorkoutCelebration';
import WorkoutIgnition from './WorkoutIgnition';
import { randomIgnitionPhrase } from './ignition';
import type { PRHit } from './store';
import ProgramLibrary from './ProgramLibrary';
import Progress from './Progress';
import Coach from './Coach';
import PlateCalc from './PlateCalc';
import { beep } from '../lib/sound';
import { haptics } from '../lib/haptics';
import { notificationsSupported } from '../lib/reminders';
import type { LoggedSet, ProgramDay, ProgramExercise, WeightUnit, WorkoutSession } from './types';

// ---------- small inputs ----------
function NumInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="input !py-1.5 !px-2 text-sm text-center min-w-0 flex-1"
    />
  );
}

function Stars({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className={cn('flex items-center gap-0.5', disabled && 'opacity-40')}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === i ? 0 : i)}
          className={cn('p-0.5', disabled ? 'cursor-default' : '')}
          aria-label={`Rate ${i} of 5`}
          aria-disabled={disabled}
        >
          <Star className={cn('w-4 h-4', i <= value ? 'text-[var(--accent)] fill-[var(--accent)]' : 'text-ink-subtle')} />
        </button>
      ))}
    </div>
  );
}

// "Don't know this exercise?" — opens a Google search in a new tab.
function LookupButton({ name, subtle }: { name: string; subtle?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        // Google Images for the exact exercise name. On Android, an intent://
        // link forces the real Chrome browser (a plain google.com URL gets
        // hijacked by the Google app); everywhere else, a normal new tab.
        const q = encodeURIComponent(name);
        const url = `https://www.google.com/search?q=${q}&udm=2`;
        if (/android/i.test(navigator.userAgent)) {
          window.location.href = `intent://www.google.com/search?q=${q}&udm=2#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
        } else {
          window.open(url, '_blank', 'noopener');
        }
      }}
      className={
        subtle
          ? 'inline-flex items-center justify-center w-5 h-5 rounded text-ink-subtle hover:text-ink align-middle'
          : 'shrink-0 w-8 h-8 rounded-md border border-border bg-elevated flex items-center justify-center text-ink-subtle hover:text-ink'
      }
      aria-label={`Look up ${name} on Google`}
      title="Don't know this one? Look it up on Google"
    >
      <Search className={subtle ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
    </button>
  );
}

// Combined intensity target column (mirrors the source program's "%1RM / RPE").
// Shows early→last RPE when the program splits them (Pure Bodybuilding does).
function intensity(ex: ProgramExercise): string {
  const parts = [];
  if (ex.percent1RM) parts.push(ex.percent1RM);
  const early = ex.rpe;
  const last = ex.lastSetRpe;
  if (early && last && early !== last) parts.push(`RPE ${early}→${last}`);
  else if (early || last) parts.push(`RPE ${early || last}`);
  return parts.join(' · ') || '—';
}
const setsReps = (ex: ProgramExercise) => `${ex.workingSets} × ${ex.reps}`;
const dash = (v?: string | number) => (v === undefined || v === '' || v === 0 ? '—' : String(v));
const warmOf = (ex: ProgramExercise) => ex.warmup ?? (ex.warmupSets != null ? String(ex.warmupSets) : undefined);

// One-line "how to do it" for each last-set intensity technique in the program.
const TECHNIQUE_INFO: Record<string, string> = {
  'Myo-reps': 'Take the set to RPE 9-10, rest ~5 deep breaths, then do mini-sets of 3-5 reps (resting 5 breaths between) until you can\'t hit 3.',
  Dropset: 'Hit failure, immediately strip ~20-30% of the weight and rep out again (no rest).',
  'Long-length Partials': 'After full reps, keep doing partial reps in the stretched (bottom) portion of the range until failure.',
  'Integrated Partials': 'Alternate one full-ROM rep with one half-ROM rep (in the stretched half) throughout the set.',
  'Mechanical Dropset': 'At failure, shift to a stronger position/angle of the same movement and keep repping without rest.',
  'Slow Eccentric': 'Use a deliberate 3-4 second lowering (negative) on every rep.',
  'Pec Static Stretch': 'After the set, hold a deep loaded pec stretch for ~30 seconds.',
  'Calf Static Stretch': 'After the set, hold a deep loaded calf stretch for ~30 seconds.',
  'Lat Static Stretch': 'After the set, hold a deep loaded lat stretch for ~30 seconds.',
};
// Look up the explainer by the leading words of the technique label.
const techniqueInfo = (t?: string): string | undefined => {
  if (!t) return undefined;
  const key = Object.keys(TECHNIQUE_INFO).find((k) => t.startsWith(k));
  return key ? TECHNIQUE_INFO[key] : undefined;
};

// The day's exercises laid out like the written program: a true table on wider
// screens, stacked labelled rows on phones (this is a mobile PWA).
function ExerciseTable({
  exercises,
  editing,
  onRemove,
}: {
  exercises: ProgramExercise[];
  editing: boolean;
  onRemove: (exId: string) => void;
}) {
  return (
    <div className="mt-3">
      {/* Wide screens: real table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-ink-subtle text-left border-b border-border">
              <th className="py-1.5 pr-2 font-semibold">Exercise</th>
              <th className="py-1.5 px-2 font-semibold text-center">Warm-up</th>
              <th className="py-1.5 px-2 font-semibold text-center">Sets × Reps</th>
              <th className="py-1.5 px-2 font-semibold text-center">%1RM / RPE</th>
              <th className="py-1.5 px-2 font-semibold text-center">Tempo</th>
              <th className="py-1.5 px-2 font-semibold text-center">Rest</th>
              <th className="py-1.5 pl-2 font-semibold">Notes</th>
              {editing && <th className="py-1.5 pl-2" />}
            </tr>
          </thead>
          <tbody>
            {exercises.map((ex) => (
              <tr key={ex.id} className="border-b border-border/60 align-top">
                <td className="py-2 pr-2 font-medium text-ink">
                  {ex.name} <LookupButton name={ex.name} subtle />
                  {ex.lastSetTechnique && (
                    <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded bg-accent/15 text-accent text-[10px] font-semibold align-middle">{ex.lastSetTechnique}</span>
                  )}
                  {ex.substitutions && ex.substitutions.length > 0 && (
                    <span className="block text-[10px] text-ink-subtle font-normal mt-0.5">or: {ex.substitutions.join(' · ')}</span>
                  )}
                </td>
                <td className="py-2 px-2 text-center text-ink-muted">{dash(warmOf(ex))}</td>
                <td className="py-2 px-2 text-center text-ink whitespace-nowrap">{setsReps(ex)}</td>
                <td className="py-2 px-2 text-center text-ink-muted whitespace-nowrap">{intensity(ex)}</td>
                <td className="py-2 px-2 text-center text-ink-muted">{dash(ex.tempo)}</td>
                <td className="py-2 px-2 text-center text-ink-muted whitespace-nowrap">{dash(ex.rest)}</td>
                <td className="py-2 pl-2 text-ink-subtle italic">{ex.notes || ''}</td>
                {editing && (
                  <td className="py-2 pl-2">
                    <button onClick={() => onRemove(ex.id)} className="p-1 text-ink-subtle hover:text-danger" aria-label="Remove exercise">
                      <X className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: stacked rows */}
      <div className="sm:hidden space-y-2">
        {exercises.map((ex) => (
          <div key={ex.id} className="border-t border-border pt-2">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <p className="font-medium text-ink text-sm">
                  {ex.name} <LookupButton name={ex.name} subtle />
                  {ex.lastSetTechnique && (
                    <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded bg-accent/15 text-accent text-[10px] font-semibold align-middle">{ex.lastSetTechnique}</span>
                  )}
                </p>
                {ex.substitutions && ex.substitutions.length > 0 && (
                  <p className="text-[10px] text-ink-subtle mt-0.5">or: {ex.substitutions.join(' · ')}</p>
                )}
              </div>
              {editing && (
                <button onClick={() => onRemove(ex.id)} className="p-1 text-ink-subtle hover:text-danger shrink-0" aria-label="Remove exercise">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-xs">
              <Field label="Sets × Reps" value={setsReps(ex)} />
              <Field label="%1RM / RPE" value={intensity(ex)} />
              <Field label="Warm-up" value={dash(warmOf(ex))} />
              <Field label="Tempo" value={dash(ex.tempo)} />
              <Field label="Rest" value={dash(ex.rest)} />
            </div>
            {ex.notes && <p className="text-xs text-ink-subtle italic mt-1">{ex.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-ink font-medium text-right">{value}</span>
    </div>
  );
}

// ---------- header ----------
function Header() {
  const setMode = useAppMode((s) => s.setMode);
  const rm = useReducedMotion();
  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-2xl px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode('focus')}
            className="w-9 h-9 rounded-full bg-elevated border border-border flex items-center justify-center text-ink-muted hover:text-ink transition-colors shrink-0"
            aria-label="Back to Liftoff"
            title="Back to Liftoff"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <motion.div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(150deg,#ff8a3d,#ff3d2e)', boxShadow: '0 6px 18px rgba(255,80,30,0.4)' }}
            initial={rm ? false : { scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={pop}
          >
            <Flame className="w-5 h-5 text-white" />
          </motion.div>
          <motion.span
            className="text-[26px] leading-none text-[var(--text)]"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
            initial={rm ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: [0.21, 1, 0.4, 1], delay: 0.08 }}
          >
            Afterburn
          </motion.span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.dispatchEvent(new Event('liftoff:search'))}
            className="w-9 h-9 rounded-full bg-elevated border border-border flex items-center justify-center text-ink-muted hover:text-ink transition-colors"
            aria-label="Search everything"
          >
            <Search className="w-4 h-4" />
          </button>
          <button onClick={() => setMode('focus')} className="mode-switch mode-switch-ink !py-2 !px-3.5 text-xs">
            <Rocket className="w-4 h-4" /> Liftoff
          </button>
        </div>
      </div>
    </header>
  );
}

// ---------- program view ----------
function ProgramView({ onStart }: { onStart: (fresh?: boolean) => void }) {
  const program = useAfterburn((s) => s.program);
  const sessions = useAfterburn((s) => s.sessions);
  const currentWeekId = useAfterburn((s) => s.currentWeekId);
  const setCurrentWeek = useAfterburn((s) => s.setCurrentWeek);
  const startDay = useAfterburn((s) => s.startDay);
  const draft = useAfterburn((s) => s.draft);
  const addCustomDay = useAfterburn((s) => s.addCustomDay);
  const resetProgram = useAfterburn((s) => s.resetProgram);
  const [editDay, setEditDay] = useState<string | null>(null);
  const [newDayName, setNewDayName] = useState('');
  const [adding, setAdding] = useState(false);

  const done = useMemo(() => completionMap(sessions), [sessions]);
  const weekIdx = Math.max(0, program.weeks.findIndex((w) => w.id === currentWeekId));
  const week = program.weeks[weekIdx] ?? program.weeks[0];
  const weekDone = week ? week.days.filter((d) => done.has(dayCompletionKey(week.id, d.id))).length : 0;
  // Phase chip ("Build" / "Deload" / "Novelty") parsed from "Week N · Phase".
  const phase = week?.name.includes('·') ? week.name.split('·').pop()!.trim() : null;
  // Next workout in the async cycle = first day this week not yet logged.
  const nextDay = week?.days.find((d) => !done.has(dayCompletionKey(week.id, d.id)));
  // Pinned "primary" workout floats to the top of its list.
  const sortPrimary = (days: ProgramDay[]) => [...days].sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));

  // Begin/resume a day without clobbering an in-progress workout.
  const begin = (dayId: string) => {
    if (draft) {
      if (draft.dayId === dayId) { onStart(false); return; } // same day → just resume, no ignition
      if (!window.confirm('A workout is already in progress. Start this one instead? Your in-progress sets will be discarded.')) return;
    }
    startDay(dayId);
    onStart(true); // fresh start → ignition
  };

  const renderDay = (day: ProgramDay, weekId?: string) => (
    <DayCard
      key={day.id}
      day={day}
      lastDone={done.get(dayCompletionKey(weekId, day.id))}
      editing={editDay === day.id}
      onToggleEdit={() => setEditDay(editDay === day.id ? null : day.id)}
      onStart={() => begin(day.id)}
    />
  );

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-display text-2xl font-bold">{program.name}</h1>
        <p className="text-xs text-ink-subtle mt-0.5">Logging in {program.unit} · RPE 1–10</p>
      </div>

      {/* Week selector — only when the program ships scheduled weeks. A fresh
          install has none, so users go straight to "My workouts" below. */}
      {program.weeks.length > 0 && (
        <>
          <div className="flex items-center gap-2 card p-2">
            <button
              disabled={weekIdx <= 0}
              onClick={() => setCurrentWeek(program.weeks[weekIdx - 1].id)}
              className="btn btn-secondary !px-2 !py-1.5 disabled:opacity-40"
              aria-label="Previous week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <select
              value={week?.id}
              onChange={(e) => setCurrentWeek(e.target.value)}
              className="input !py-1.5 flex-1 text-center font-medium"
            >
              {program.weeks.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <button
              disabled={weekIdx >= program.weeks.length - 1}
              onClick={() => setCurrentWeek(program.weeks[weekIdx + 1].id)}
              className="btn btn-secondary !px-2 !py-1.5 disabled:opacity-40"
              aria-label="Next week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {week && (
            <p className="text-xs text-ink-subtle px-1 flex items-center gap-2">
              {phase && (
                <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide', phase === 'Deload' ? 'bg-warning/15 text-warning' : 'bg-accent/15 text-accent')}>{phase}</span>
              )}
              {weekDone === week.days.length ? (
                <span className="text-success font-medium">✓ All {week.days.length} days done this week</span>
              ) : (
                <span>{weekDone}/{week.days.length} days done this week</span>
              )}
            </p>
          )}

          {/* Rolling-cycle explainer — an 8-session "week" spans ~9-10 calendar
              days by design; don't skip ahead. Shown until the week is done. */}
          {week && week.days.length > 7 && weekDone < week.days.length && (
            <p className="text-[11px] text-ink-subtle px-1">
              This program runs {week.days.length} sessions per program week on a rolling cycle — do them in
              order at your pace (it's normal for one "week" to take 9–10 days). Finish all{' '}
              {week.days.length} before moving to the next week; volume is tallied per program week, so
              nothing spills over.
            </p>
          )}

          {/* Async-cycle hint: jump straight into the next un-logged day. */}
          {week && nextDay && weekDone < week.days.length && (
            <button
              onClick={() => begin(nextDay.id)}
              className="w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-sm hover:border-accent/40 transition-colors"
            >
              <span className="text-ink-subtle">Next in your cycle</span>
              <span className="font-medium text-ink flex items-center gap-1.5">{nextDay.name} <ArrowRight className="w-4 h-4 text-accent" /></span>
            </button>
          )}

          {/* Auto-advance prompt when the week is complete and another follows. */}
          {week && weekDone === week.days.length && weekIdx < program.weeks.length - 1 && (
            <button
              onClick={() => setCurrentWeek(program.weeks[weekIdx + 1].id)}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent-soft/40 px-3 py-2.5 text-sm font-medium text-ink hover:bg-accent-soft/60 transition-colors"
            >
              Week complete — start {program.weeks[weekIdx + 1].name} <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {week && sortPrimary(week.days).map((d) => renderDay(d, week.id))}
        </>
      )}

      {/* User-added workouts */}
      <h2 className="section-label mt-5">My workouts</h2>
      {program.custom.length === 0 && !adding && (
        <p className="text-xs text-ink-subtle">Add your own workout in the same format below.</p>
      )}
      {sortPrimary(program.custom).map((d) => renderDay(d))}

      {adding ? (
        <div className="card p-4 space-y-3">
          <input
            autoFocus
            value={newDayName}
            onChange={(e) => setNewDayName(e.target.value)}
            placeholder="Workout name (e.g. Day 7 — Legs)"
            className="input"
          />
          <div className="flex gap-2">
            <button
              className="btn btn-primary flex-1 disabled:opacity-50"
              disabled={!newDayName.trim()}
              onClick={() => {
                const id = addCustomDay(newDayName.trim());
                setNewDayName('');
                setAdding(false);
                setEditDay(id);
              }}
            >
              Create
            </button>
            <button className="btn btn-secondary" onClick={() => { setAdding(false); setNewDayName(''); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="btn btn-secondary w-full">
          <Plus className="w-4 h-4" /> Add your own workout
        </button>
      )}

      {(program.weeks.length > 0 || program.custom.length > 0) && (
        <button
          onClick={() => {
            if (
              window.confirm(
                'Clear this program (weeks + custom workouts) and start blank? Your logged workout history is kept.',
              )
            )
              resetProgram();
          }}
          className="btn btn-danger w-full !py-1.5 text-sm mt-2"
        >
          <Trash2 className="w-4 h-4" /> Reset / clear program
        </button>
      )}
    </div>
  );
}

function DayCard({
  day,
  lastDone,
  editing,
  onToggleEdit,
  onStart,
}: {
  day: ProgramDay;
  lastDone?: string;
  editing: boolean;
  onToggleEdit: () => void;
  onStart: () => void;
}) {
  const removeExercise = useAfterburn((s) => s.removeExercise);
  const removeDay = useAfterburn((s) => s.removeDay);
  const setPrimaryDay = useAfterburn((s) => s.setPrimaryDay);
  const [open, setOpen] = useState(false);
  const rm = useReducedMotion();

  return (
    <motion.div
      className={cn('card card-hover p-4', day.isPrimary && 'border-ember ember-glow', !day.isPrimary && lastDone && 'border-success/40')}
      initial={rm ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={rm ? undefined : { y: -2 }}
      transition={springSoft}
    >
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen((o) => !o)} className="flex-1 flex items-center gap-2 text-left min-w-0">
          {open ? <ChevronDown className="w-4 h-4 text-ink-subtle shrink-0" /> : <ChevronRight className="w-4 h-4 text-ink-subtle shrink-0" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="font-semibold text-ink truncate">{day.name}</p>
              {day.isPrimary && (
                <span className="chip text-ember border-ember bg-ember-soft shrink-0 !py-0.5">
                  <Star className="w-3 h-3 fill-[var(--ember)]" /> Primary
                </span>
              )}
              {lastDone && (
                <span className="chip text-success border-success/30 bg-success/10 shrink-0 !py-0.5">
                  <CheckCircle2 className="w-3 h-3" /> Done
                </span>
              )}
            </div>
            <p className="text-xs text-ink-subtle">
              {day.exercises.length} exercises{lastDone ? ` · last done ${format(new Date(lastDone), 'MMM d')}` : ''}
            </p>
          </div>
        </button>
        <button
          onClick={() => setPrimaryDay(day.id)}
          className={cn('p-2 hover:text-ember', day.isPrimary ? 'text-ember' : 'text-ink-subtle')}
          aria-label={day.isPrimary ? 'Unpin primary workout' : 'Make primary workout'}
          title={day.isPrimary ? 'Unpin primary workout' : 'Make this my primary workout'}
        >
          <Star className={cn('w-4 h-4', day.isPrimary && 'fill-[var(--ember)]')} />
        </button>
        <button onClick={onToggleEdit} className="p-2 text-ink-subtle hover:text-ink" aria-label="Edit workout">
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={onStart} className="btn btn-primary !py-1.5 !px-3 text-sm">Start</button>
      </div>

      <AnimatePresence initial={false}>
        {(open || editing) && (
          <motion.div
            initial={rm ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={rm ? undefined : { height: 0, opacity: 0 }}
            transition={fast}
            style={{ overflow: 'hidden' }}
          >
            <div className="mt-1">
              {day.note && <p className="text-xs text-[var(--accent)] mt-2">{day.note}</p>}
              {day.exercises.length > 0 ? (
                <ExerciseTable exercises={day.exercises} editing={editing} onRemove={(exId) => removeExercise(day.id, exId)} />
              ) : (
                <p className="text-xs text-ink-subtle mt-3">No exercises yet — tap the pencil to add some.</p>
              )}

              {editing && (
                <div className="pt-3 space-y-3">
                  <AddExerciseForm dayId={day.id} />
                  {day.source === 'custom' && (
                    <button onClick={() => removeDay(day.id)} className="btn btn-danger w-full !py-1.5 text-sm">
                      <Trash2 className="w-4 h-4" /> Delete this workout
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AddExerciseForm({ dayId }: { dayId: string }) {
  const addExercise = useAfterburn((s) => s.addExercise);
  const [f, setF] = useState({ name: '', workingSets: '3', reps: '', rpe: '', tempo: '', percent1RM: '', rest: '', notes: '' });
  const upd = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="rounded-lg border border-border bg-elevated p-3 space-y-2">
      <p className="section-label">Add exercise</p>
      <input value={f.name} onChange={(e) => upd('name', e.target.value)} placeholder="Exercise name" className="input !py-1.5 text-sm" />
      <div className="grid grid-cols-2 gap-2">
        <input value={f.workingSets} onChange={(e) => upd('workingSets', e.target.value)} placeholder="Working sets" className="input !py-1.5 text-sm" />
        <input value={f.reps} onChange={(e) => upd('reps', e.target.value)} placeholder="Reps (e.g. 8-12)" className="input !py-1.5 text-sm" />
        <input value={f.rpe} onChange={(e) => upd('rpe', e.target.value)} placeholder="Target RPE" className="input !py-1.5 text-sm" />
        <input value={f.rest} onChange={(e) => upd('rest', e.target.value)} placeholder="Rest" className="input !py-1.5 text-sm" />
        <input value={f.tempo} onChange={(e) => upd('tempo', e.target.value)} placeholder="Tempo" className="input !py-1.5 text-sm" />
        <input value={f.percent1RM} onChange={(e) => upd('percent1RM', e.target.value)} placeholder="%1RM" className="input !py-1.5 text-sm" />
      </div>
      <input value={f.notes} onChange={(e) => upd('notes', e.target.value)} placeholder="Notes (optional)" className="input !py-1.5 text-sm" />
      <button
        className="btn btn-secondary w-full !py-1.5 text-sm disabled:opacity-50"
        disabled={!f.name.trim() || !f.reps.trim()}
        onClick={() => {
          addExercise(dayId, {
            name: f.name.trim(),
            workingSets: Math.max(1, parseInt(f.workingSets, 10) || 1),
            reps: f.reps.trim(),
            rpe: f.rpe.trim() || undefined,
            tempo: f.tempo.trim() || undefined,
            percent1RM: f.percent1RM.trim() || undefined,
            rest: f.rest.trim() || undefined,
            notes: f.notes.trim() || undefined,
          });
          setF({ name: '', workingSets: '3', reps: '', rpe: '', tempo: '', percent1RM: '', rest: '', notes: '' });
        }}
      >
        <Plus className="w-4 h-4" /> Add exercise
      </button>
    </div>
  );
}

// ---------- logger ----------
function SetRow({
  exIdx,
  setIdx,
  set,
  unit,
  onDone,
  lastSet,
}: {
  exIdx: number;
  setIdx: number;
  set: LoggedSet;
  unit: WeightUnit;
  onDone: (becameDone: boolean) => void;
  /** The same position last time, for the ghost value and the verdict. */
  lastSet?: LoggedSet;
}) {
  const updateSet = useAfterburn((s) => s.updateSet);
  const u = (patch: Partial<LoggedSet>) => updateSet(exIdx, setIdx, patch);
  // A set is "logged" (and thus rateable) once it has weight, reps, or is done.
  const logged = !!(set.weight.trim() || set.reps.trim() || set.done);
  // Set-for-set, so #3 is judged against #3 rather than against a summary line
  // of the whole exercise.
  const ghost = ghostLabel(lastSet);
  const verdict = setVerdict(set, lastSet, unit);
  return (
    <div className={cn('rounded-lg border p-2', set.done ? 'border-success/50 bg-success/5' : 'border-border bg-elevated')}>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-ink-subtle w-9 shrink-0">#{setIdx + 1}</span>
        <NumInput value={set.weight} onChange={(v) => u({ weight: v })} placeholder={unit} />
        <NumInput value={set.reps} onChange={(v) => u({ reps: v })} placeholder="reps" />
        <NumInput value={set.rpe} onChange={(v) => u({ rpe: v })} placeholder="RPE" />
        <motion.button
          whileTap={{ scale: 0.86 }}
          transition={pop}
          onClick={() => {
            const next = !set.done;
            u({ done: next });
            haptics.tap();
            onDone(next);
          }}
          className={cn('shrink-0 w-8 h-8 rounded-md flex items-center justify-center border', set.done ? 'bg-success text-white border-success' : 'border-border text-ink-subtle hover:text-ink')}
          aria-label="Mark set done"
        >
          <Check className="w-4 h-4" />
        </motion.button>
      </div>
      <div className="mt-1.5 pl-9 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Stars value={set.rating} onChange={(v) => u({ rating: v })} disabled={!logged} />
        {/* Before you type: what this set was last time. After: whether you beat it. */}
        {verdict.kind !== 'none' ? (
          <span
            className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
            style={
              verdict.kind === 'up'
                ? { color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 15%, transparent)' }
                : verdict.kind === 'down'
                  ? { color: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 15%, transparent)' }
                  : { color: 'var(--text-muted)', background: 'var(--elevated)' }
            }
          >
            {verdict.label}
          </span>
        ) : ghost ? (
          <span className="text-[11px] text-ink-subtle" style={{ fontVariantNumeric: 'tabular-nums' }}>
            was {ghost}
          </span>
        ) : (
          !logged && <span className="text-[11px] text-ink-subtle">Log the set to rate it</span>
        )}
      </div>
    </div>
  );
}

// Sticky rest countdown shown above the logger footer. Beeps + vibrates at 0.
// The ember fill shrinks as the rest runs down and the digits pulse each second.
function RestBar({ secondsLeft, total, onAdd, onSkip }: { secondsLeft: number; total: number; onAdd: (d: number) => void; onSkip: () => void }) {
  const rm = useReducedMotion();
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  const pct = total > 0 ? Math.max(0, Math.min(100, (secondsLeft / total) * 100)) : 0;
  return (
    <div className="mx-auto max-w-2xl mb-2 rounded-lg border border-ember bg-ember-soft px-3 py-2">
      <div className="flex items-center gap-2">
        <Timer className="w-4 h-4 text-ember shrink-0" />
        <motion.span
          key={secondsLeft}
          initial={rm ? false : { scale: 1.18 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.18 }}
          className="font-mono-data font-bold text-ink tabular-nums"
        >
          {m}:{String(s).padStart(2, '0')}
        </motion.span>
        <span className="text-xs text-ink-subtle flex-1">rest</span>
        <button onClick={() => onAdd(-15)} className="btn btn-secondary !py-1 !px-2 text-xs">−15s</button>
        <button onClick={() => onAdd(15)} className="btn btn-secondary !py-1 !px-2 text-xs">+15s</button>
        <button onClick={onSkip} className="btn btn-secondary !py-1 !px-2 text-xs">Skip</button>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-[var(--elevated)] overflow-hidden">
        <motion.div
          className="h-full rounded-full ember-grad"
          animate={{ width: `${pct}%` }}
          transition={{ ease: 'linear', duration: 0.25 }}
        />
      </div>
    </div>
  );
}

const END_REASONS = ["Didn't feel recovered", 'Out of time', 'Pain / niggle', 'Other'];
const NO_WEAK_POINTS: never[] = []; // stable identity so selectors/useMemo don't churn

function Logger({ onFinish, onBack }: { onFinish: (opts?: { endedEarly?: boolean; note?: string }) => void; onBack: () => void }) {
  const draft = useAfterburn((s) => s.draft)!;
  const unit = useAfterburn((s) => s.program.unit);
  const sessions = useAfterburn((s) => s.sessions);
  const recovery = useAfterburn((s) => s.recovery);
  const cancelDraft = useAfterburn((s) => s.cancelDraft);
  const addSet = useAfterburn((s) => s.addSet);
  const removeSet = useAfterburn((s) => s.removeSet);
  const setExerciseNotes = useAfterburn((s) => s.setExerciseNotes);
  const swapDraftExercise = useAfterburn((s) => s.swapDraftExercise);
  const updateSet = useAfterburn((s) => s.updateSet);
  const weakPoints = useAfterburn((s) => s.program.weakPoints ?? NO_WEAK_POINTS);
  const [plateOpen, setPlateOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  // Auto-suggest weak points: muscles reading below MEV / untrained in the last
  // 7 days float to the top of the picker, tagged so the pick is obvious.
  const laggingMuscles = useMemo(() => {
    const r = analyzeVolume(sessions);
    return new Set(r.muscles.filter((m) => m.status === 'below' || m.status === 'untrained').map((m) => m.muscle as string));
  }, [sessions]);
  const weakPointsSorted = useMemo(
    () =>
      [...weakPoints].sort(
        (a, b) => Number(laggingMuscles.has(b.volumeKey ?? '')) - Number(laggingMuscles.has(a.volumeKey ?? '')),
      ),
    [weakPoints, laggingMuscles],
  );
  const [mountedAt] = useState(() => Date.now());

  // Recovery-aware autoregulation: warn if today's CO2 tolerance test was low.
  const readiness = useMemo(() => recoveryReadiness(recovery), [recovery]);
  const recentlyTested = readiness.latestDate != null && mountedAt - new Date(readiness.latestDate).getTime() < 36 * 3_600_000;
  const showRecoveryWarning = readiness.verdict === 'under' && recentlyTested;

  // Rest timer: counts down from an endsAt timestamp; alerts once at zero.
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);
  useEffect(() => {
    if (restEndsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [restEndsAt]);
  const secondsLeft = restEndsAt ? Math.max(0, Math.ceil((restEndsAt - now) / 1000)) : 0;
  useEffect(() => {
    if (restEndsAt !== null && secondsLeft === 0 && !firedRef.current) {
      firedRef.current = true;
      beep();
      haptics.success();
      if (notificationsSupported() && Notification.permission === 'granted') {
        try {
          new Notification('Rest over', { body: 'Time for your next set 💪', tag: 'afterburn-rest' });
        } catch {
          /* notification best-effort */
        }
      }
      const t = setTimeout(() => setRestEndsAt(null), 4000); // auto-dismiss the bar
      return () => clearTimeout(t);
    }
  }, [restEndsAt, secondsLeft]);
  const startRest = (sec: number) => {
    if (sec <= 0) return;
    firedRef.current = false;
    setNow(() => Date.now());
    setRestTotal(sec);
    setRestEndsAt(() => Date.now() + sec * 1000);
  };

  return (
    <div className="space-y-4 pb-36">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <button
            onClick={onBack}
            className="mt-0.5 w-9 h-9 rounded-xl bg-elevated border border-border flex items-center justify-center text-ink-muted hover:text-ink shrink-0 transition-colors"
            aria-label="Back — keep this workout and explore"
            title="Back — your workout stays in progress"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            {draft.weekName && <p className="text-xs font-semibold text-[var(--accent)]">{draft.weekName}</p>}
            <h1 className="font-display text-xl font-bold truncate">{draft.dayName}</h1>
            <p className="text-xs text-ink-subtle">{format(new Date(draft.date), 'EEEE, MMM d · h:mm a')}</p>
          </div>
        </div>
        <button onClick={() => setPlateOpen(true)} className="btn btn-secondary !py-1.5 !px-2.5 text-xs shrink-0">
          <Calculator className="w-4 h-4" /> Plates
        </button>
      </div>
      <PlateCalc open={plateOpen} onClose={() => setPlateOpen(false)} unit={unit} />

      {showRecoveryWarning && (
        <div className="rounded-xl border border-[var(--warning)]/40 bg-[var(--accent-soft)] px-3 py-2.5 flex items-start gap-2">
          <Wind className="w-4 h-4 text-[var(--warning)] mt-0.5 shrink-0" />
          <p className="text-xs text-ink">
            <span className="font-semibold text-[var(--warning)]">Recovery low today</span> (CO2 test {readiness.latest}s
            {readiness.deltaPct != null ? `, ${readiness.deltaPct}% vs baseline` : ''}). Autoregulate — trim sets/RPE, rest longer, and stop a lift when speed or form drops. It's fine to end early.
          </p>
        </div>
      )}

      {draft.entries.map((ex, exIdx) => {
        const restSec = restToSeconds(ex.target.rest);
        const last = lastPerformance(sessions, ex.name);
        const prefill = () => {
          if (!last) return;
          ex.sets.forEach((_, setIdx) => {
            const src = last.sets[setIdx];
            if (src) updateSet(exIdx, setIdx, { weight: src.weight, reps: src.reps });
          });
        };
        return (
        <div key={ex.exerciseId} className="card p-4">
          {/* NAME — a picker when the exercise has substitutions or is a weak-point slot */}
          <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
          {ex.target.weakPointSlot ? (
            weakPoints.length > 0 ? (
              <select
                value={ex.name}
                onChange={(e) => swapDraftExercise(exIdx, e.target.value)}
                className="input !py-1.5 text-sm font-semibold w-full"
              >
                <option value={ex.target.baseName}>{ex.target.baseName} — pick a muscle ↓</option>
                {weakPointsSorted.map((g) => (
                  <optgroup key={g.muscle} label={laggingMuscles.has(g.volumeKey ?? '') ? `${g.muscle} ⚑ lagging — good pick` : g.muscle}>
                    {(ex.target.weakPointSlot === 1 ? g.exercise1 : g.exercise2).map((n) => (
                      <option key={g.muscle + n} value={n}>{n}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              <div>
                <input
                  value={ex.name.startsWith('Weak Point Exercise') ? '' : ex.name}
                  onChange={(e) => swapDraftExercise(exIdx, e.target.value.trim() || ex.target.baseName || ex.name)}
                  placeholder="Type your weak-point exercise"
                  className="input !py-1.5 text-sm font-semibold w-full"
                />
                <p className="text-[10px] text-ink-subtle mt-1">Choose from your Weak Point Table — paste the table in to get a dropdown here.</p>
              </div>
            )
          ) : ex.target.substitutions && ex.target.substitutions.length > 0 ? (
            <select
              value={ex.name}
              onChange={(e) => swapDraftExercise(exIdx, e.target.value)}
              className="input !py-1.5 text-sm font-semibold w-full"
              aria-label="Exercise (swap to a substitution)"
            >
              {Array.from(new Set([ex.target.baseName ?? ex.name, ...ex.target.substitutions])).map((n) => (
                <option key={n} value={n}>{n === (ex.target.baseName ?? ex.name) ? n : `${n} (sub)`}</option>
              ))}
            </select>
          ) : (
            <p className="font-semibold text-ink">{ex.name}</p>
          )}
          </div>
          <LookupButton name={ex.name} />
          </div>

          {/* TARGET (prescribed) */}
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <span className="text-ink-subtle">Target:</span>
            <span className="chip !py-0.5">{ex.target.reps} reps</span>
            {ex.target.percent1RM && <span className="chip !py-0.5">{ex.target.percent1RM}</span>}
            {ex.target.rpe && (
              <span className="chip !py-0.5">
                RPE {ex.target.rpe}
                {ex.target.lastSetRpe && ex.target.lastSetRpe !== ex.target.rpe ? `→${ex.target.lastSetRpe}` : ''}
              </span>
            )}
            {!ex.target.rpe && ex.target.lastSetRpe && <span className="chip !py-0.5">RPE {ex.target.lastSetRpe}</span>}
            {ex.target.tempo && <span className="chip !py-0.5">tempo {ex.target.tempo}</span>}
          </div>

          {/* LAST-SET INTENSITY TECHNIQUE + how to do it */}
          {ex.target.lastSetTechnique && (
            <div className="mt-2 text-xs rounded-md bg-accent/10 border border-accent/20 p-2">
              <span className="font-semibold text-[var(--accent)]">Last set: {ex.target.lastSetTechnique}</span>
              {techniqueInfo(ex.target.lastSetTechnique) && (
                <span className="text-ink-subtle"> — {techniqueInfo(ex.target.lastSetTechnique)}</span>
              )}
            </div>
          )}

          {/* LAST TIME (progressive-overload reference) */}
          {last && (
            <div className="mt-2 flex items-start gap-2 text-xs rounded-md bg-elevated border border-border p-2">
              <div className="flex-1 min-w-0">
                <span className="text-ink-subtle">Last ({format(new Date(last.date), 'MMM d')}): </span>
                <span className="text-ink">
                  {last.sets
                    .map((st) => `${st.weight || '–'}×${st.reps || '–'}${st.rpe ? `@${st.rpe}` : ''}`)
                    .join(', ')}
                </span>
              </div>
              {(() => {
                // One honest number for the exercise: total volume against the
                // same positions last time, so a single heavy set can't hide
                // two that dropped.
                const p = exerciseProgress(ex.sets, last.sets);
                if (p.kind === 'none') return null;
                return (
                  <span
                    className="text-[11px] font-semibold px-1.5 py-0.5 rounded shrink-0 self-start"
                    style={
                      p.kind === 'up'
                        ? { color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 15%, transparent)' }
                        : p.kind === 'down'
                          ? { color: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 15%, transparent)' }
                          : { color: 'var(--text-muted)', background: 'var(--elevated)' }
                    }
                  >
                    {p.kind === 'same' ? 'level' : `${p.pct > 0 ? '+' : ''}${p.pct}% volume`}
                  </span>
                );
              })()}
              <button onClick={prefill} className="btn btn-secondary !py-1 !px-2 text-[11px] shrink-0">
                Use last
              </button>
            </div>
          )}

          {/* ACHIEVED (what you logged) */}
          <div className="mt-3">
            <div className="flex items-center gap-1.5 px-0.5 mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
              <span className="w-9 shrink-0">Set</span>
              <span className="flex-1 text-center">{unit}</span>
              <span className="flex-1 text-center">reps</span>
              <span className="flex-1 text-center">RPE</span>
              <span className="w-8 shrink-0 text-center">done</span>
            </div>
            <div className="space-y-2">
              {ex.sets.map((set, setIdx) => (
                <SetRow
                  key={set.id}
                  exIdx={exIdx}
                  setIdx={setIdx}
                  set={set}
                  unit={unit}
                  onDone={(becameDone) => becameDone && startRest(restSec)}
                  lastSet={last?.sets[setIdx]}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 mt-2">
            <button onClick={() => addSet(exIdx)} className="btn btn-secondary !py-1 !px-2.5 text-xs">
              <Plus className="w-3.5 h-3.5" /> Set
            </button>
            {ex.sets.length > 1 && (
              <button onClick={() => removeSet(exIdx)} className="btn btn-secondary !py-1 !px-2.5 text-xs">
                Remove last
              </button>
            )}
          </div>

          <input
            value={ex.notes}
            onChange={(e) => setExerciseNotes(exIdx, e.target.value)}
            placeholder="Notes for this exercise…"
            className="input !py-1.5 text-sm mt-2"
          />
        </div>
        );
      })}

      <div
        className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur border-t border-border px-3 pt-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        {restEndsAt !== null && (
          <RestBar
            secondsLeft={secondsLeft}
            total={restTotal}
            onAdd={(d) => setRestEndsAt((e) => (e === null ? e : Math.max(Date.now(), e + d * 1000)))}
            onSkip={() => setRestEndsAt(null)}
          />
        )}
        {endOpen && (
          <div className="mx-auto max-w-2xl mb-2 rounded-lg border border-border bg-elevated p-3">
            <p className="text-xs font-semibold text-ink mb-2">End here — why are you stopping?</p>
            <div className="flex flex-wrap gap-1.5">
              {END_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => { setEndOpen(false); onFinish({ endedEarly: true, note: reason }); }}
                  className="chip bg-surface border border-border text-ink hover:border-ember !text-xs"
                >
                  {reason}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-subtle mt-2">Only the sets you actually did get saved.</p>
          </div>
        )}
        <div className="mx-auto max-w-2xl flex gap-2">
          <button onClick={cancelDraft} className="btn btn-secondary !px-3">Cancel</button>
          <button onClick={() => setEndOpen((o) => !o)} className={cn('btn btn-secondary !px-3', endOpen && 'border-ember text-ember')}>
            End early
          </button>
          <motion.button whileTap={{ scale: 0.95 }} transition={pop} onClick={() => onFinish()} className="btn btn-primary flex-1">
            <Check className="w-4 h-4" /> Finish
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// ---------- history ----------
function SessionCard({ session, onEdit }: { session: WorkoutSession; onEdit: (id: string) => void }) {
  const deleteSession = useAfterburn((s) => s.deleteSession);
  const setSessionWeek = useAfterburn((s) => s.setSessionWeek);
  const weeks = useAfterburn((s) => s.program.weeks);
  const unit = useAfterburn((s) => s.program.unit);
  const [open, setOpen] = useState(false);
  const doneSets = session.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen((o) => !o)} className="flex-1 text-left min-w-0">
          <p className="font-semibold text-ink truncate flex items-center gap-1.5">
            <span className="truncate">{session.weekName ? `${session.weekName} · ${session.dayName}` : session.dayName}</span>
            {session.endedEarly && (
              <span className="chip !px-1.5 !py-0.5 text-[10px] font-semibold border-0 text-[var(--warning)] bg-[var(--accent-soft)] shrink-0" title={session.endNote || 'Ended early'}>
                Ended early
              </span>
            )}
          </p>
          <p className="text-xs text-ink-subtle">
            {format(new Date(session.completedAt ?? session.date), 'MMM d, yyyy · h:mm a')} · {doneSets} sets logged
            {session.endedEarly && session.endNote ? ` · ${session.endNote}` : ''}
          </p>
        </button>
        <button
          onClick={() => { if (window.confirm('Reopen this workout to edit? It moves back to in-progress.')) onEdit(session.id); }}
          className="p-2 text-ink-subtle hover:text-ink"
          aria-label="Edit session"
          title="Reopen to edit"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={() => deleteSession(session.id)} className="p-2 text-ink-subtle hover:text-danger" aria-label="Delete session">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Which week was this? Setting it labels the log AND marks that week's day done. */}
      {weeks.length > 0 && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-xs text-ink-subtle shrink-0">Week:</span>
          <select
            value={session.weekId ?? ''}
            onChange={(e) => setSessionWeek(session.id, e.target.value)}
            className={cn('input !py-1 !px-2 text-xs !w-auto', !session.weekId && 'text-ink-subtle')}
          >
            <option value="">— set week —</option>
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          {!session.weekId && <span className="text-[11px] text-[var(--accent)]">tap to tag this workout</span>}
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {session.entries.map((e) => (
            <div key={e.exerciseId} className="text-sm">
              <p className="text-ink font-medium">{e.name}</p>
              <div className="text-xs text-ink-muted mt-0.5 space-y-0.5">
                {e.sets.map((s, j) => (
                  <div key={s.id || j}>
                    #{j + 1}: {s.weight || '–'}{unit} × {s.reps || '–'}
                    {s.rpe ? ` @ RPE ${s.rpe}` : ''}
                    {s.rating ? ` · ${'★'.repeat(s.rating)}` : ''}
                  </div>
                ))}
              </div>
              {e.notes && <p className="text-xs text-ink-subtle italic mt-0.5">{e.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryView({ onEdit }: { onEdit: (id: string) => void }) {
  const sessions = useAfterburn((s) => s.sessions);
  const rm = useReducedMotion();
  if (sessions.length === 0) {
    return <p className="text-sm text-ink-subtle text-center py-12">No workouts logged yet. Start a day from the Program tab.</p>;
  }
  return (
    <motion.div
      className="space-y-3"
      initial={rm ? false : 'hidden'}
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
    >
      {sessions.slice(0, 30).map((s) => (
        <motion.div key={s.id} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.21, 1, 0.4, 1] } } }}>
          <SessionCard session={s} onEdit={onEdit} />
        </motion.div>
      ))}
      {sessions.length > 30 && (
        <div className="pt-1">
          {sessions.slice(30).map((s) => (
            <div key={s.id} className="mb-3">
              <SessionCard session={s} onEdit={onEdit} />
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ---------- root ----------
type Tab = 'workout' | 'history' | 'progress' | 'coach' | 'programs';

export default function Afterburn() {
  const draft = useAfterburn((s) => s.draft);
  const sessions = useAfterburn((s) => s.sessions);
  const cancelDraft = useAfterburn((s) => s.cancelDraft);
  const finishDraft = useAfterburn((s) => s.finishDraft);
  const reopenSession = useAfterburn((s) => s.reopenSession);
  const loadWorkouts = useAfterburn((s) => s.loadWorkouts);
  const rm = useReducedMotion();
  // Start on "Programs" if there's no plan loaded yet, else on "Workout".
  const hasProgram = useAfterburn((s) => s.program.weeks.length > 0 || s.program.custom.length > 0);
  const [tab, setTab] = useState<Tab>(hasProgram ? 'workout' : 'programs');
  // "Pause" the active workout to explore other tabs without losing the draft.
  const [minimized, setMinimized] = useState(false);
  // Post-finish overlay (null = hidden): PRs to celebrate + whether ended early
  // + the finished session id (so "Undo — edit" can reopen it).
  const [celebrate, setCelebrate] = useState<{ prs: PRHit[]; endedEarly: boolean; sessionId?: string } | null>(null);
  // Sapphire ignition overlay (the phrase to show), lit when a fresh workout starts.
  const [igniting, setIgniting] = useState<string | null>(null);

  // Pull cloud workout data when entering the app (recency-guarded in the store).
  useEffect(() => {
    loadWorkouts();
  }, [loadWorkouts]);

  const TABS: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'workout', label: 'Workout', icon: Flame },
    { id: 'history', label: 'History', icon: Check },
    { id: 'progress', label: 'Progress', icon: TrendingUp },
    { id: 'coach', label: 'Coach', icon: Sparkles },
    { id: 'programs', label: 'Programs', icon: LayoutGrid },
  ];

  const showLogger = !!draft && !minimized;
  const showTabs = !draft || minimized;
  const loggedSets = draft ? draft.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0) : 0;

  const finishWorkout = (opts?: { endedEarly?: boolean; note?: string }) => {
    // Detect PRs against history BEFORE the draft is committed. Keep the draft
    // id so an accidental finish can be undone (finishDraft keeps the same id).
    const prs = draft ? detectPRs(sessions, draft) : [];
    const sessionId = draft?.id;
    finishDraft(opts);
    setMinimized(false);
    setTab('workout');
    setCelebrate({ prs, endedEarly: !!opts?.endedEarly, sessionId });
  };

  // Reopen a finished session into the logger to edit it. Won't clobber a
  // workout already in progress.
  const reopenAndEdit = (id: string) => {
    if (draft) {
      window.alert('Finish or discard your in-progress workout first, then edit this one.');
      return;
    }
    reopenSession(id);
    setCelebrate(null);
    setMinimized(false);
    setTab('workout');
  };

  return (
    <div className="min-h-screen bg-background text-ink relative">
      <div className="fixed inset-0 radial-atmosphere pointer-events-none z-0" />
      <div className="relative z-10">
        <Header />
        {showTabs && (
          <div className="mx-auto max-w-2xl px-4 pt-4 overflow-x-auto custom-scrollbar">
            <div className="flex bg-elevated p-0.5 rounded-lg border border-border w-max">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn('relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors', tab === t.id ? 'text-ink' : 'text-ink-muted')}
                >
                  {tab === t.id && (
                    <motion.span
                      layoutId="afterburn-tab-pill"
                      transition={rm ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }}
                      className="absolute inset-0 rounded-md bg-surface shadow-sm"
                    />
                  )}
                  <t.icon className="relative z-10 w-3.5 h-3.5" /> <span className="relative z-10">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Paused-workout banner: resume the in-progress draft from anywhere. */}
        <AnimatePresence>
          {draft && minimized && (
            <motion.div
              initial={rm ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={rm ? undefined : { opacity: 0, y: -8 }}
              transition={springSoft}
              className="mx-auto max-w-2xl px-4 pt-3"
            >
              <div className="card !border-accent/40 p-3 flex items-center gap-3" style={{ background: 'var(--card-grad)' }}>
                <span className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center shrink-0">
                  <Dumbbell className="w-4 h-4 text-[var(--accent)]" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">Workout in progress</p>
                  <p className="text-xs text-ink-subtle truncate">{draft.dayName} · {loggedSets} set{loggedSets === 1 ? '' : 's'} logged</p>
                </div>
                <motion.button whileTap={{ scale: 0.93 }} transition={pop} onClick={() => setMinimized(false)} className="btn btn-primary !py-1.5 !px-3 text-sm shrink-0">
                  Resume <ArrowRight className="w-4 h-4" />
                </motion.button>
                <button
                  onClick={() => { if (window.confirm('Discard this in-progress workout? Logged sets will be lost.')) cancelDraft(); }}
                  className="p-2 text-ink-subtle hover:text-danger shrink-0"
                  aria-label="Discard workout"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="mx-auto max-w-2xl px-4 py-4">
          {showLogger ? (
            <Logger onFinish={finishWorkout} onBack={() => setMinimized(true)} />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={rm ? false : { opacity: 0, y: 22, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: springSoft }}
                exit={rm ? undefined : { opacity: 0, y: -10, transition: { duration: 0.14 } }}
              >
                {tab === 'programs' ? (
                  <ProgramLibrary onPicked={() => setTab('workout')} />
                ) : tab === 'history' ? (
                  <HistoryView onEdit={reopenAndEdit} />
                ) : tab === 'progress' ? (
                  <Progress />
                ) : tab === 'coach' ? (
                  <Coach />
                ) : (
                  <ProgramView onStart={(fresh) => { setMinimized(false); if (fresh) setIgniting(randomIgnitionPhrase()); }} />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      <WorkoutIgnition phrase={igniting} onDone={() => setIgniting(null)} />
      <WorkoutCelebration
        prs={celebrate ? celebrate.prs : null}
        endedEarly={celebrate?.endedEarly}
        onUndo={celebrate?.sessionId ? () => reopenAndEdit(celebrate.sessionId!) : undefined}
        onDone={() => setCelebrate(null)}
      />
    </div>
  );
}
