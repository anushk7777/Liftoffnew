import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Flame, Rocket, Plus, Check, CheckCircle2, Star, Trash2, ChevronDown, ChevronRight, ChevronLeft, Pencil, X, LayoutGrid } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAfterburn, useAppMode, completionMap, dayCompletionKey } from './store';
import ProgramLibrary from './ProgramLibrary';
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

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" onClick={() => onChange(value === i ? 0 : i)} className="p-0.5" aria-label={`Rate ${i} of 5`}>
          <Star className={cn('w-4 h-4', i <= value ? 'text-amber-400 fill-amber-400' : 'text-ink-subtle')} />
        </button>
      ))}
    </div>
  );
}

// Combined intensity target column (mirrors the source program's "%1RM / RPE").
function intensity(ex: ProgramExercise): string {
  const parts = [];
  if (ex.percent1RM) parts.push(ex.percent1RM);
  if (ex.rpe) parts.push(`RPE ${ex.rpe}`);
  return parts.join(' · ') || '—';
}
const setsReps = (ex: ProgramExercise) => `${ex.workingSets} × ${ex.reps}`;
const dash = (v?: string | number) => (v === undefined || v === '' || v === 0 ? '—' : String(v));

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
                <td className="py-2 pr-2 font-medium text-ink">{ex.name}</td>
                <td className="py-2 px-2 text-center text-ink-muted">{dash(ex.warmupSets)}</td>
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
              <p className="flex-1 font-medium text-ink text-sm">{ex.name}</p>
              {editing && (
                <button onClick={() => onRemove(ex.id)} className="p-1 text-ink-subtle hover:text-danger shrink-0" aria-label="Remove exercise">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-xs">
              <Field label="Sets × Reps" value={setsReps(ex)} />
              <Field label="%1RM / RPE" value={intensity(ex)} />
              <Field label="Warm-up" value={dash(ex.warmupSets)} />
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
  return (
    <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-400" />
          <span className="font-display font-bold">Liftoff Afterburn</span>
        </div>
        <button onClick={() => setMode('focus')} className="btn btn-secondary !py-1.5 !px-3 text-xs">
          <Rocket className="w-4 h-4" /> Focus
        </button>
      </div>
    </header>
  );
}

// ---------- program view ----------
function ProgramView({ onStart }: { onStart: () => void }) {
  const program = useAfterburn((s) => s.program);
  const sessions = useAfterburn((s) => s.sessions);
  const currentWeekId = useAfterburn((s) => s.currentWeekId);
  const setCurrentWeek = useAfterburn((s) => s.setCurrentWeek);
  const startDay = useAfterburn((s) => s.startDay);
  const addCustomDay = useAfterburn((s) => s.addCustomDay);
  const resetProgram = useAfterburn((s) => s.resetProgram);
  const [editDay, setEditDay] = useState<string | null>(null);
  const [newDayName, setNewDayName] = useState('');
  const [adding, setAdding] = useState(false);

  const done = useMemo(() => completionMap(sessions), [sessions]);
  const weekIdx = Math.max(0, program.weeks.findIndex((w) => w.id === currentWeekId));
  const week = program.weeks[weekIdx] ?? program.weeks[0];

  const renderDay = (day: ProgramDay, weekId?: string) => (
    <DayCard
      key={day.id}
      day={day}
      lastDone={done.get(dayCompletionKey(weekId, day.id))}
      editing={editDay === day.id}
      onToggleEdit={() => setEditDay(editDay === day.id ? null : day.id)}
      onStart={() => {
        startDay(day.id);
        onStart();
      }}
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

          {week?.days.map((d) => renderDay(d, week?.id))}
        </>
      )}

      {/* User-added workouts */}
      <h2 className="section-label mt-5">My workouts</h2>
      {program.custom.length === 0 && !adding && (
        <p className="text-xs text-ink-subtle">Add your own workout in the same format below.</p>
      )}
      {program.custom.map((d) => renderDay(d))}

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
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('card p-4', lastDone && 'border-success/40')}>
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen((o) => !o)} className="flex-1 flex items-center gap-2 text-left min-w-0">
          {open ? <ChevronDown className="w-4 h-4 text-ink-subtle shrink-0" /> : <ChevronRight className="w-4 h-4 text-ink-subtle shrink-0" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="font-semibold text-ink truncate">{day.name}</p>
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
        <button onClick={onToggleEdit} className="p-2 text-ink-subtle hover:text-ink" aria-label="Edit workout">
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={onStart} className="btn btn-primary !py-1.5 !px-3 text-sm">Start</button>
      </div>

      {(open || editing) && (
        <div className="mt-1">
          {day.note && <p className="text-xs text-orange-400 mt-2">{day.note}</p>}
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
      )}
    </div>
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
function SetRow({ exIdx, setIdx, set, unit }: { exIdx: number; setIdx: number; set: LoggedSet; unit: WeightUnit }) {
  const updateSet = useAfterburn((s) => s.updateSet);
  const u = (patch: Partial<LoggedSet>) => updateSet(exIdx, setIdx, patch);
  return (
    <div className={cn('rounded-lg border p-2', set.done ? 'border-success/50 bg-success/5' : 'border-border bg-elevated')}>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-ink-subtle w-9 shrink-0">#{setIdx + 1}</span>
        <NumInput value={set.weight} onChange={(v) => u({ weight: v })} placeholder={unit} />
        <NumInput value={set.reps} onChange={(v) => u({ reps: v })} placeholder="reps" />
        <NumInput value={set.rpe} onChange={(v) => u({ rpe: v })} placeholder="RPE" />
        <button
          onClick={() => u({ done: !set.done })}
          className={cn('shrink-0 w-8 h-8 rounded-md flex items-center justify-center border', set.done ? 'bg-success text-white border-success' : 'border-border text-ink-subtle hover:text-ink')}
          aria-label="Mark set done"
        >
          <Check className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-1.5 pl-9">
        <Stars value={set.rating} onChange={(v) => u({ rating: v })} />
      </div>
    </div>
  );
}

function Logger({ onFinish }: { onFinish: () => void }) {
  const draft = useAfterburn((s) => s.draft)!;
  const unit = useAfterburn((s) => s.program.unit);
  const cancelDraft = useAfterburn((s) => s.cancelDraft);
  const finishDraft = useAfterburn((s) => s.finishDraft);
  const addSet = useAfterburn((s) => s.addSet);
  const removeSet = useAfterburn((s) => s.removeSet);
  const setExerciseNotes = useAfterburn((s) => s.setExerciseNotes);

  return (
    <div className="space-y-4 pb-32">
      <div>
        {draft.weekName && <p className="text-xs font-semibold text-orange-400">{draft.weekName}</p>}
        <h1 className="font-display text-xl font-bold">{draft.dayName}</h1>
        <p className="text-xs text-ink-subtle">{format(new Date(draft.date), 'EEEE, MMM d · h:mm a')}</p>
      </div>

      {draft.entries.map((ex, exIdx) => (
        <div key={ex.exerciseId} className="card p-4">
          <p className="font-semibold text-ink">{ex.name}</p>
          {/* TARGET (prescribed) */}
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
            <span className="text-ink-subtle">Target:</span>
            <span className="chip !py-0.5">{ex.target.reps} reps</span>
            {ex.target.percent1RM && <span className="chip !py-0.5">{ex.target.percent1RM}</span>}
            {ex.target.rpe && <span className="chip !py-0.5">RPE {ex.target.rpe}</span>}
            {ex.target.tempo && <span className="chip !py-0.5">tempo {ex.target.tempo}</span>}
          </div>

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
                <SetRow key={set.id} exIdx={exIdx} setIdx={setIdx} set={set} unit={unit} />
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
      ))}

      <div
        className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur border-t border-border px-3 pt-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto max-w-2xl flex gap-2">
          <button onClick={cancelDraft} className="btn btn-secondary flex-1">Cancel</button>
          <button onClick={() => { finishDraft(); onFinish(); }} className="btn btn-primary flex-1">
            <Check className="w-4 h-4" /> Finish workout
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- history ----------
function SessionCard({ session }: { session: WorkoutSession }) {
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
          <p className="font-semibold text-ink truncate">
            {session.weekName ? `${session.weekName} · ${session.dayName}` : session.dayName}
          </p>
          <p className="text-xs text-ink-subtle">
            {format(new Date(session.completedAt ?? session.date), 'MMM d, yyyy · h:mm a')} · {doneSets} sets logged
          </p>
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
          {!session.weekId && <span className="text-[11px] text-orange-400">tap to tag this workout</span>}
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

function HistoryView() {
  const sessions = useAfterburn((s) => s.sessions);
  if (sessions.length === 0) {
    return <p className="text-sm text-ink-subtle text-center py-12">No workouts logged yet. Start a day from the Program tab.</p>;
  }
  return (
    <div className="space-y-3">
      {sessions.map((s) => (
        <SessionCard key={s.id} session={s} />
      ))}
    </div>
  );
}

// ---------- root ----------
type Tab = 'workout' | 'history' | 'programs';

export default function Afterburn() {
  const draft = useAfterburn((s) => s.draft);
  const loadWorkouts = useAfterburn((s) => s.loadWorkouts);
  // Start on "Programs" if there's no plan loaded yet, else on "Workout".
  const hasProgram = useAfterburn((s) => s.program.weeks.length > 0 || s.program.custom.length > 0);
  const [tab, setTab] = useState<Tab>(hasProgram ? 'workout' : 'programs');

  // Pull cloud workout data when entering the app (recency-guarded in the store).
  useEffect(() => {
    loadWorkouts();
  }, [loadWorkouts]);

  const TABS: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'workout', label: 'Workout', icon: Flame },
    { id: 'history', label: 'History', icon: Check },
    { id: 'programs', label: 'Programs', icon: LayoutGrid },
  ];

  return (
    <div className="min-h-screen bg-background text-ink relative">
      <div className="fixed inset-0 radial-atmosphere pointer-events-none z-0" />
      <div className="relative z-10">
        <Header />
        {!draft && (
          <div className="mx-auto max-w-2xl px-4 pt-4">
            <div className="flex bg-elevated p-0.5 rounded-lg border border-border w-fit">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn('flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors', tab === t.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted')}
                >
                  <t.icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <main className="mx-auto max-w-2xl px-4 py-4">
          {draft ? (
            <Logger onFinish={() => setTab('history')} />
          ) : tab === 'programs' ? (
            <ProgramLibrary onPicked={() => setTab('workout')} />
          ) : tab === 'history' ? (
            <HistoryView />
          ) : (
            <ProgramView onStart={() => undefined} />
          )}
        </main>
      </div>
    </div>
  );
}
