// Coaching micro-app — shared presentation pieces (used by both the client
// portal and the coach's dashboard so the "template" looks identical).
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Bell, X, Volume2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { bmiOf, bmiBand, type Metric, type MetricInput } from './api';
import Chart from '../afterburn/Chart';
import { PhotoSlots } from './photos';
import { DayWheel } from './DayWheel';

const tnum = { fontVariantNumeric: 'tabular-nums' } as const;

// ---- Animated greeting ---------------------------------------------------
// Words rise in one-by-one with a soft blur; an accent underline sweeps in.
export function AnimatedGreeting({ name, subtitle }: { name: string; subtitle: string }) {
  // "Welcome back," and the name are separate lines rather than one wrapping
  // run of words. At phone widths a long name used to break the greeting into
  // three ragged lines mid-phrase ("Welcome" / "back," / "Priyadarshini"); the
  // phrase now holds together and the name gets its own line at any width.
  const words = ['Welcome', 'back,'];
  return (
    // Everything here is inline-block rather than flex, so the greeting simply
    // follows whatever text-align its parent sets. Flex ignores text-align, so
    // a flex row inside the centred sign-in column pinned "Welcome back," hard
    // left while the name and rule centred — the lines disagreed with each
    // other and with the page. Left on the template, centred on sign-in, from
    // one component and no alignment prop.
    <div>
      <h1 className="font-display text-[26px] sm:text-[34px] md:text-[44px] font-bold tracking-[-0.025em] leading-[1.12] text-[var(--text)]">
        <span className="block">
          {words.map((w, i) => (
            <motion.span
              key={i}
              initial={{ y: 26, opacity: 0, filter: 'blur(6px)' }}
              animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
              transition={{ delay: 0.08 * i, type: 'spring', stiffness: 220, damping: 24 }}
              className="inline-block"
              style={{ willChange: 'transform, opacity, filter' }}
            >
              {w}
              {i < words.length - 1 && ' '}
            </motion.span>
          ))}
        </span>
        <motion.span
          initial={{ y: 26, opacity: 0, filter: 'blur(6px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          transition={{ delay: 0.08 * words.length, type: 'spring', stiffness: 220, damping: 24 }}
          // Long single-word names must wrap rather than run off the screen.
          className="block text-[var(--accent)] break-words"
          style={{ willChange: 'transform, opacity, filter' }}
        >
          {name}
        </motion.span>
      </h1>
      {/* inline-block in a block wrapper, so the rule tracks the text alignment */}
      <span className="block mt-3">
        <motion.span
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.08 * words.length + 0.1, duration: 0.5, ease: [0.21, 1, 0.4, 1] }}
          className="inline-block h-[3px] w-24 rounded-full align-middle"
          style={{
            background: 'linear-gradient(90deg, var(--timer-1), var(--timer-3))',
            transformOrigin: 'center',
          }}
        />
      </span>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 * words.length + 0.25 }}
        className="text-[15px] text-[var(--text-muted)] mt-3"
      >
        {subtitle}
      </motion.p>
    </div>
  );
}

// ---- Trend chart ---------------------------------------------------------
// One chart, shared with Afterburn. The coaching side used to have its own,
// weaker copy — no gridlines, no value labels, no scrubbing, and a 100x100
// viewBox stretched with preserveAspectRatio="none" that squashed the marker
// dots into ellipses. This is the same component the workout app uses, in the
// coaching accent, wrapped in the card the portal expects.
export function TrendChart({
  title,
  unit,
  points,
  height = 200,
  marked,
  markedLabel,
  overlay,
  overlayLabel,
  headline,
}: {
  title: string;
  unit: string;
  points: { date: string; value: number }[];
  height?: number;
  /** Dates to flag on the line (e.g. period days, where weight reads high). */
  marked?: Set<string>;
  markedLabel?: string;
  /** A calmer second series on the same axis, e.g. the 7-day average. */
  overlay?: { date: string; value: number }[];
  overlayLabel?: string;
  /** The decision-relevant summary, shown beside the title. */
  headline?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-5"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">
          {title}
        </span>
        {headline}
      </div>
      <Chart
        points={points}
        unit={unit}
        height={height}
        accent="var(--accent)"
        marked={marked}
        markedLabel={markedLabel}
        overlay={overlay}
        overlayLabel={overlayLabel}
        emptyHint={
          points.length === 0
            ? 'No entries yet — your first check-in starts the trend.'
            : 'One entry so far. Log another to see the trend.'
        }
      />
    </div>
  );
}

// ---- Measurement form ----------------------------------------------------
// Height/age deliberately absent — they live on the profile and are asked once.
// Bounds are deliberately generous — wide enough to accept any real person,
// tight enough to catch a slipped decimal. An unnoticed 640 instead of 64 is
// worse than a missing entry: the chart scales to min and max, so one bad value
// flattens the whole trend line and the rate is read off it.
const FIELDS: { key: keyof MetricInput; label: string; unit: string; min: number; max: number }[] = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg', min: 20, max: 400 },
  { key: 'chest_cm', label: 'Chest', unit: 'cm', min: 40, max: 200 },
  { key: 'waist_cm', label: 'Waist', unit: 'cm', min: 30, max: 200 },
  { key: 'hips_cm', label: 'Hips', unit: 'cm', min: 40, max: 200 },
  { key: 'arm_cm', label: 'Arm', unit: 'cm', min: 10, max: 80 },
  { key: 'thigh_cm', label: 'Thigh', unit: 'cm', min: 20, max: 120 },
];

export function MetricsForm({
  onSubmit,
  saving,
  recentMeasurement,
  previous,
  day,
  onDayChange,
  loggedDays,
  dailyWeight = true,
  showCycle = false,
  existing,
  editingDate,
  onCancelEdit,
}: {
  onSubmit: (m: Partial<MetricInput>, photos: { front: File | null; side: File | null }) => void;
  saving: boolean;
  /** How long since the last measurements, for the "give it time" note. */
  recentMeasurement?: { daysSince: number | null; tooSoon: boolean };
  /** Last recorded value per field, shown as the placeholder. */
  previous?: Partial<Record<keyof MetricInput, number>>;
  /** The day being logged (yyyy-mm-dd) and its picker. */
  day?: string;
  onDayChange?: (d: string) => void;
  loggedDays?: Set<string>;
  dailyWeight?: boolean;
  /** Offer the period toggle (shown to clients who aren't recorded as male). */
  showCycle?: boolean;
  /** The entry already saved for this date — pre-fills so it can be corrected. */
  existing?: Metric;
  /** yyyy-mm-dd being edited; defaults to today. */
  editingDate?: string;
  onCancelEdit?: () => void;
}) {
  // Two jobs, two tabs. Weight is a daily ten-second thing; measurements are
  // occasional and involve tape and photos. One combined form meant opening a
  // six-field sheet to type a single number, so the daily habit felt like a
  // chore. Weight leads because it is the one done most often.
  const [tab, setTab] = useState<'weight' | 'measure'>('weight');
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<{ front: File | null; side: File | null }>({ front: null, side: null });
  const [onPeriod, setOnPeriod] = useState(false);

  // Re-seed whenever the day (or its saved entry) changes, so switching days
  // in the calendar loads that day's numbers instead of stale ones.
  useEffect(() => {
    const seed: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = existing?.[f.key as keyof Metric];
      if (typeof v === 'number') seed[f.key] = String(v);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing the form to the selected day's saved entry
    setValues(seed);
    setNotes(existing?.notes ?? '');
    setOnPeriod(!!existing?.menstruating);
    setPhotos({ front: null, side: null });
  }, [existing, editingDate]);
  const measuring = tab === 'measure';
  const fields = useMemo(
    () => (measuring ? FIELDS.filter((f) => f.key !== 'weight_kg') : FIELDS.filter((f) => f.key === 'weight_kg')),
    [measuring],
  );
  /** Fields typed but outside a plausible range, named for the message. */
  const outOfRange = useMemo(
    () =>
      FIELDS.filter((f) => {
        const raw = values[f.key];
        if (!raw || !raw.trim()) return false;
        const n = Number(raw);
        return !Number.isNaN(n) && (n < f.min || n > f.max);
      }),
    [values],
  );

  const canSave = useMemo(
    () =>
      (Object.values(values).some((v) => v.trim() !== '') || !!photos.front || !!photos.side) &&
      outOfRange.length === 0,
    [values, photos, outOfRange],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || saving) return;
    const d = new Date();
    const local =
      editingDate ??
      `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
    const m: Partial<MetricInput> = { taken_on: local };
    for (const f of fields) {
      const raw = values[f.key]?.trim();
      if (raw) {
        const n = Number(raw);
        if (!Number.isNaN(n)) (m as Record<string, unknown>)[f.key] = n;
      }
    }
    if (notes.trim()) m.notes = notes.trim();
    m.menstruating = onPeriod;
    onSubmit(m, photos);
    setValues({});
    setNotes('');
    setPhotos({ front: null, side: null });
    setOnPeriod(false);
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">
          {editingDate
            ? `Editing ${new Date(`${editingDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
            : measuring
              ? 'Measurements'
              : "Today's weigh-in"}
        </span>
        <span className="flex items-center gap-2">
          {onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              Back to today
            </button>
          )}
        </span>
      </div>
      {/* Which day is being logged — kept beside the fields, not buried in a
          calendar further down the page. */}
      {day && onDayChange && (
        <div className="mt-3">
          <DayWheel value={day} onChange={onDayChange} logged={loggedDays} />
        </div>
      )}

      {/* Segmented switch — the daily number, or the occasional full set. */}
      <div
        className="relative grid grid-cols-2 gap-1 p-1 mt-3 rounded-xl"
        style={{ background: 'var(--elevated)' }}
        role="tablist"
      >
        {([
          { id: 'weight', label: 'Weight', hint: 'daily' },
          { id: 'measure', label: 'Measurements', hint: 'now and then' },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="relative py-2 rounded-lg text-[13px] font-semibold transition-colors"
            style={{ color: tab === t.id ? 'var(--accent-text)' : 'var(--text-muted)' }}
          >
            {tab === t.id && (
              <motion.span
                layoutId="checkin-tab"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-lg"
                style={{ background: 'var(--accent)' }}
              />
            )}
            <span className="relative">
              {t.label}
              <span className="block text-[10px] font-medium opacity-70">{t.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {!measuring && (
        <p className="text-[12.5px] text-[var(--text-muted)] mt-3">
          {dailyWeight
            ? 'Type it and go — that is the whole check-in.'
            : 'Just your weight. Type it and go.'}
        </p>
      )}

      {/* The only measurement prompt there is: you measured a few days ago and
          are about to again. Advice, not a gate — the form stays fully usable. */}
      <AnimatePresence initial={false}>
        {measuring && recentMeasurement?.tooSoon && (
          <motion.p
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.24, ease: [0.2, 0.7, 0.2, 1] }}
            className="text-[12.5px] mt-2 overflow-hidden"
            style={{ color: 'var(--text-muted)' }}
          >
            You measured{' '}
            <b className="text-[var(--text)] font-semibold">
              {recentMeasurement.daysSince === 0
                ? 'earlier today'
                : recentMeasurement.daysSince === 1
                  ? 'yesterday'
                  : `${recentMeasurement.daysSince} days ago`}
            </b>
            . Around two weeks apart shows real change — day-to-day swings are mostly
            water and food. Log it anyway if you want to.
          </motion.p>
        )}
      </AnimatePresence>
      <div className={cn('grid gap-3 mt-4', measuring ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1')}>
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="text-[11px] text-[var(--text-muted)]">{f.label} ({f.unit})</span>
            {/* Last time's number as the placeholder — a reference point while
                typing, and it leaves the field genuinely empty. Placeholders are
                dimmed globally so this can never be mistaken for a saved value. */}
            <input
              type="number"
              step="0.1"
              inputMode="decimal"
              placeholder={previous?.[f.key] != null ? String(previous[f.key]) : undefined}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              aria-invalid={outOfRange.some((o) => o.key === f.key)}
              className="mt-1 w-full rounded-lg border bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none transition-colors"
              style={{
                ...tnum,
                borderColor: outOfRange.some((o) => o.key === f.key)
                  ? 'var(--danger, #ef4444)'
                  : 'var(--border)',
              }}
            />
          </label>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {outOfRange.length > 0 && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[12.5px] mt-2 overflow-hidden"
            style={{ color: 'var(--danger, #ef4444)' }}
          >
            {outOfRange[0].label} of {values[outOfRange[0].key]} {outOfRange[0].unit} looks like a
            slip — expected between {outOfRange[0].min} and {outOfRange[0].max}. Fix it and the save
            will unlock.
          </motion.p>
        )}
      </AnimatePresence>

      {measuring && (
        <div className="mt-4">
          <span className="text-[11px] text-[var(--text-muted)]">Progress photos (optional)</span>
          <div className="mt-1.5">
            <PhotoSlots files={photos} onChange={(slot, file) => setPhotos((p) => ({ ...p, [slot]: file }))} />
          </div>
        </div>
      )}
      {showCycle && (
        <button
          type="button"
          onClick={() => setOnPeriod((v) => !v)}
          aria-pressed={onPeriod}
          className="w-full flex items-center justify-between mt-4 p-3 rounded-xl border transition-colors text-left"
          style={{
            borderColor: onPeriod ? 'var(--accent)' : 'var(--border)',
            background: onPeriod ? 'var(--accent-soft)' : 'transparent',
          }}
        >
          <span className="min-w-0 pr-3">
            <span className="block text-[13.5px] font-semibold text-[var(--text)]">On my period today</span>
            <span className="block text-[12px] text-[var(--text-muted)]">
              Water weight is normal — this keeps your trend honest.
            </span>
          </span>
          <span
            className="switch-track relative w-11 h-6 rounded-full shrink-0 transition-colors"
            style={{ background: onPeriod ? 'var(--accent)' : 'var(--elevated)' }}
          >
            <motion.span
              layout
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white"
              style={{ left: onPeriod ? 22 : 2 }}
            />
          </span>
        </button>
      )}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="How did the week feel? (sleep, energy, soreness…)"
        className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors resize-none"
      />
      <motion.button
        whileHover={{ scale: canSave ? 1.02 : 1 }}
        whileTap={{ scale: canSave ? 0.98 : 1 }}
        type="submit"
        disabled={!canSave || saving}
        className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-semibold text-[var(--accent-text)] disabled:opacity-40 transition-opacity"
        style={{ background: 'var(--accent)' }}
      >
        <Plus className="w-4 h-4" />{' '}
        {saving ? 'Saving…' : existing ? 'Update entry' : measuring ? 'Save measurements' : 'Save weight'}
      </motion.button>
    </form>
  );
}

// ---- History table -------------------------------------------------------
export function MetricsHistory({ metrics }: { metrics: Metric[] }) {
  if (!metrics.length) return null;
  const recent = [...metrics].reverse().slice(0, 8);
  return (
    <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 overflow-x-auto" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">History</span>
      <table className="w-full mt-3 text-sm" style={tnum}>
        <thead>
          <tr className="text-left text-[11px] text-[var(--text-subtle)]">
            <th className="py-1.5 pr-3 font-medium">Date</th>
            <th className="py-1.5 pr-3 font-medium">Weight</th>
            <th className="py-1.5 pr-3 font-medium" title="On their period">Cycle</th>
            <th className="py-1.5 pr-3 font-medium">Waist</th>
            <th className="py-1.5 pr-3 font-medium">Chest</th>
            <th className="py-1.5 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((m) => (
            <tr key={m.id} className="border-t border-[var(--border)] text-[var(--text)]">
              <td className="py-2 pr-3 text-[var(--text-muted)]">{m.taken_on.slice(5)}</td>
              <td className="py-2 pr-3">{m.weight_kg ?? '—'}</td>
              <td className="py-2 pr-3">
                {m.menstruating ? (
                  <span
                    className="inline-block w-2 h-2 rounded-full border-2"
                    style={{ borderColor: 'var(--cozy)' }}
                    title="On their period"
                  />
                ) : (
                  <span className="text-[var(--text-subtle)]">·</span>
                )}
              </td>
              <td className="py-2 pr-3">{m.waist_cm ?? '—'}</td>
              <td className="py-2 pr-3">{m.chest_cm ?? '—'}</td>
              <td className="py-2 text-[var(--text-muted)] max-w-[220px] truncate">{m.notes ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---- Check-in reminder banner -------------------------------------------
export function CheckinDueBanner({ days, onDismiss }: { days: number | null; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="rounded-2xl border p-4 flex items-center gap-3"
      style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}
    >
      <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--accent)' }}>
        <Bell className="w-[18px] h-[18px]" style={{ color: 'var(--accent-text)' }} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-[var(--text)]">Time for your check-in</p>
        <p className="text-[12.5px] text-[var(--text-muted)]">
          {days === null ? 'Log your first measurements to start tracking.' : `It's been ${days} days since your last one.`}
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="p-1.5 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

// ---- BMI card ------------------------------------------------------------
export function BmiCard({ metrics, heightCm }: { metrics: Metric[]; heightCm: number | null }) {
  const points = metrics
    .filter((m) => m.weight_kg != null)
    .map((m) => ({ date: m.taken_on, value: bmiOf(m.weight_kg, heightCm) }))
    .filter((p): p is { date: string; value: number } => p.value != null);

  if (!heightCm) return null;
  const latest = points[points.length - 1]?.value ?? null;
  const band = latest != null ? bmiBand(latest) : null;

  return (
    <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">BMI</span>
        {band && (
          <span className="text-[12px] font-semibold" style={{ color: band.color }}>
            {band.label}
          </span>
        )}
      </div>
      {latest == null ? (
        <p className="text-sm text-[var(--text-subtle)] py-8 text-center">Log a weight to see this.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="text-[26px] font-bold tracking-tight text-[var(--text)]" style={tnum}>{latest}</span>
            <span className="text-[13px] text-[var(--text-muted)]">kg/m²</span>
          </div>
          {/* Healthy-range scale, 15 → 35 */}
          <div className="relative h-2 rounded-full overflow-hidden mt-4" style={{ background: 'var(--elevated)' }}>
            <div
              className="absolute inset-y-0 rounded-full"
              style={{ left: '17.5%', width: '32.5%', background: 'color-mix(in srgb, var(--success) 45%, transparent)' }}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2"
              style={{
                left: `${Math.min(100, Math.max(0, ((latest - 15) / 20) * 100))}%`,
                background: 'var(--accent)',
                borderColor: 'var(--surface)',
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-[var(--text-subtle)]">
            <span>15</span>
            <span style={{ color: 'var(--success)' }}>healthy 18.5–25</span>
            <span>35</span>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Weigh-in alarm settings --------------------------------------------
export function AlarmCard({
  time,
  enabled,
  onSave,
  onTest,
  saving,
}: {
  time: string | null;
  enabled: boolean;
  onSave: (p: { alarm_time: string | null; alarm_enabled: boolean }) => void;
  onTest: () => void;
  saving: boolean;
}) {
  const [t, setT] = useState(time ?? '07:30');
  const [on, setOn] = useState(enabled);
  const dirty = t !== (time ?? '07:30') || on !== enabled;

  return (
    <section
      className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">
          Weigh-in alarm
        </span>
        <button
          onClick={() => setOn((v) => !v)}
          aria-pressed={on}
          className="switch-track relative w-11 h-6 rounded-full shrink-0 transition-colors"
          style={{ background: on ? 'var(--accent)' : 'var(--elevated)' }}
          aria-label="Toggle alarm"
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white"
            style={{ left: on ? 22 : 2 }}
          />
        </button>
      </div>

      <p className="text-[12.5px] text-[var(--text-muted)] mt-1.5">
        A loud alarm at the same time daily, so weighing in becomes automatic.
      </p>

      <div className="flex items-center gap-2 mt-4">
        <input
          type="time"
          value={t}
          onChange={(e) => setT(e.target.value)}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[15px] font-semibold text-[var(--text)] outline-none focus:border-[var(--accent)]"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        />
        <button
          onClick={onTest}
          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-[var(--border)] text-[13px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border-strong)] transition-colors"
        >
          <Volume2 className="w-4 h-4" /> Test
        </button>
      </div>

      <motion.button
        whileHover={{ scale: dirty ? 1.02 : 1 }}
        whileTap={{ scale: dirty ? 0.98 : 1 }}
        disabled={!dirty || saving}
        onClick={() => onSave({ alarm_time: t, alarm_enabled: on })}
        className="mt-3 w-full py-2.5 rounded-xl text-[14px] font-semibold text-[var(--accent-text)] disabled:opacity-40 transition-opacity"
        style={{ background: 'var(--accent)' }}
      >
        {saving ? 'Saving…' : dirty ? 'Save alarm' : 'Alarm saved'}
      </motion.button>

      <p className="text-[11px] text-[var(--text-subtle)] mt-2.5">
        Rings while the app is open. Install it to your home screen so it can reach you reliably.
      </p>
    </section>
  );
}

// ---- Ringing overlay -----------------------------------------------------
export function AlarmRinging({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="relative w-full max-w-sm rounded-3xl border border-[var(--border)] p-8 text-center"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}
      >
        <motion.div
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ repeat: Infinity, duration: 1 }}
          className="w-20 h-20 rounded-full mx-auto flex items-center justify-center"
          style={{ background: 'var(--accent)' }}
        >
          <Bell className="w-10 h-10" style={{ color: 'var(--accent-text)' }} />
        </motion.div>
        <h2 className="font-display text-[26px] font-bold tracking-tight text-[var(--text)] mt-5">
          Time to weigh in
        </h2>
        <p className="text-[14px] text-[var(--text-muted)] mt-1.5">
          Same time, same scale, before breakfast — that's what makes the trend readable.
        </p>
        <button
          onClick={onDismiss}
          className="mt-6 w-full py-3.5 rounded-xl text-[15px] font-semibold text-[var(--accent-text)]"
          style={{ background: 'var(--accent)' }}
        >
          Stop alarm
        </button>
      </motion.div>
    </div>
  );
}
