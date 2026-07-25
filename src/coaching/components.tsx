// Coaching micro-app — shared presentation pieces (used by both the client
// portal and the coach's dashboard so the "template" looks identical).
import { useId, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Bell, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { bmiOf, bmiBand, type Metric, type MetricInput } from './api';
import { PhotoSlots } from './photos';

const tnum = { fontVariantNumeric: 'tabular-nums' } as const;

// ---- Animated greeting ---------------------------------------------------
// Words rise in one-by-one with a soft blur; an accent underline sweeps in.
export function AnimatedGreeting({ name, subtitle }: { name: string; subtitle: string }) {
  const words = `Welcome back, ${name}`.split(' ');
  return (
    <div>
      <h1 className="font-display text-[34px] sm:text-[44px] font-bold tracking-[-0.025em] leading-[1.08] text-[var(--text)] flex flex-wrap gap-x-[0.28em]">
        {words.map((w, i) => (
          <motion.span
            key={i}
            initial={{ y: 26, opacity: 0, filter: 'blur(6px)' }}
            animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
            transition={{ delay: 0.08 * i, type: 'spring', stiffness: 220, damping: 24 }}
            className={cn(i === words.length - 1 && 'text-[var(--accent)]')}
          >
            {w}
          </motion.span>
        ))}
      </h1>
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.08 * words.length + 0.1, duration: 0.5, ease: [0.21, 1, 0.4, 1] }}
        className="origin-left mt-3 h-[3px] w-24 rounded-full"
        style={{ background: 'linear-gradient(90deg, var(--timer-1), var(--timer-3))' }}
      />
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
// Dependency-free SVG line chart with an area fill and end-point glow.
export function TrendChart({
  title,
  unit,
  points,
  height = 190,
}: {
  title: string;
  unit: string;
  points: { date: string; value: number }[];
  height?: number;
}) {
  const id = useId();
  const w = 100;
  const h = 100;
  const pad = 8;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const x = (i: number) => (points.length <= 1 ? w / 2 : pad + (i / (points.length - 1)) * (w - pad * 2));
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  const area = `${path} L${x(points.length - 1)},${h} L${x(0)},${h} Z`;
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;

  return (
    <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">{title}</span>
        {points.length > 1 && (
          <span
            className="text-[12px] font-semibold"
            style={{ color: delta <= 0 ? 'var(--success)' : 'var(--warning)', ...tnum }}
          >
            {delta > 0 ? '+' : ''}{delta.toFixed(1)} {unit}
          </span>
        )}
      </div>
      {points.length === 0 ? (
        <p className="text-sm text-[var(--text-subtle)] py-8 text-center">No entries yet.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="text-[26px] font-bold tracking-tight text-[var(--text)]" style={tnum}>{last}</span>
            <span className="text-[13px] text-[var(--text-muted)]">{unit}</span>
          </div>
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
            <defs>
              <linearGradient id={`tc-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#tc-${id})`} />
            <motion.path
              d={path}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, ease: [0.21, 1, 0.4, 1] }}
            />
            <circle cx={x(points.length - 1)} cy={y(last)} r={2.4} fill="var(--accent)" />
          </svg>
          <div className="flex justify-between mt-1.5 text-[10px] text-[var(--text-subtle)]">
            <span>{points[0].date.slice(5)}</span>
            <span>{points[points.length - 1].date.slice(5)}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Measurement form ----------------------------------------------------
// Height/age deliberately absent — they live on the profile and are asked once.
const FIELDS: { key: keyof MetricInput; label: string; unit: string }[] = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg' },
  { key: 'chest_cm', label: 'Chest', unit: 'cm' },
  { key: 'waist_cm', label: 'Waist', unit: 'cm' },
  { key: 'hips_cm', label: 'Hips', unit: 'cm' },
  { key: 'arm_cm', label: 'Arm', unit: 'cm' },
  { key: 'thigh_cm', label: 'Thigh', unit: 'cm' },
];

export function MetricsForm({
  onSubmit,
  saving,
  measureDay = true,
  dailyWeight = true,
}: {
  onSubmit: (m: Partial<MetricInput>, photos: { front: File | null; side: File | null }) => void;
  saving: boolean;
  /** On a scheduled measurement day the full set is asked for; otherwise weight only. */
  measureDay?: boolean;
  dailyWeight?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<{ front: File | null; side: File | null }>({ front: null, side: null });
  // Weight every day; the rest only on scheduled measurement days.
  const fields = useMemo(
    () => (measureDay ? FIELDS : FIELDS.filter((f) => f.key === 'weight_kg')),
    [measureDay],
  );
  const canSave = useMemo(
    () => Object.values(values).some((v) => v.trim() !== '') || !!photos.front || !!photos.side,
    [values, photos],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || saving) return;
    const d = new Date();
    const local = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
    const m: Partial<MetricInput> = { taken_on: local };
    for (const f of fields) {
      const raw = values[f.key]?.trim();
      if (raw) {
        const n = Number(raw);
        if (!Number.isNaN(n)) (m as Record<string, unknown>)[f.key] = n;
      }
    }
    if (notes.trim()) m.notes = notes.trim();
    onSubmit(m, photos);
    setValues({});
    setNotes('');
    setPhotos({ front: null, side: null });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">
          {measureDay ? "Today's full check-in" : "Today's weigh-in"}
        </span>
        {measureDay && (
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
          >
            Measurement day
          </span>
        )}
      </div>
      {!measureDay && (
        <p className="text-[12.5px] text-[var(--text-muted)] mt-1">
          {dailyWeight
            ? 'Just your weight today — measurements and photos come on your scheduled day.'
            : 'Measurements come on your scheduled day.'}
        </p>
      )}
      <div className={cn('grid gap-3 mt-4', measureDay ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2')}>
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="text-[11px] text-[var(--text-muted)]">{f.label} ({f.unit})</span>
            <input
              type="number"
              step="0.1"
              inputMode="decimal"
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
              style={tnum}
            />
          </label>
        ))}
      </div>
      {measureDay && (
        <div className="mt-4">
          <span className="text-[11px] text-[var(--text-muted)]">Progress photos (optional)</span>
          <div className="mt-1.5">
            <PhotoSlots files={photos} onChange={(slot, file) => setPhotos((p) => ({ ...p, [slot]: file }))} />
          </div>
        </div>
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
        <Plus className="w-4 h-4" /> {saving ? 'Saving…' : measureDay ? 'Save check-in' : 'Save weight'}
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
