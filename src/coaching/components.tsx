// Coaching micro-app — shared presentation pieces (used by both the client
// portal and the coach's dashboard so the "template" looks identical).
import { useId, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, Beef, Save, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Metric, MetricInput, Plan } from './api';

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

// ---- Plan card (client-facing; the coach writes it) ----------------------
export function PlanCard({ plan, updatedLive }: { plan: Plan | null; updatedLive?: boolean }) {
  return (
    <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">Your plan</span>
        {updatedLive && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}
          >
            Updated just now
          </motion.span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-xl border border-[var(--border)] p-4 flex items-center gap-3">
          <Flame className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <div>
            <div className="text-[20px] font-bold text-[var(--text)]" style={tnum}>
              {plan?.calorie_target ?? '—'}
            </div>
            <div className="text-[11px] text-[var(--text-subtle)]">kcal / day</div>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] p-4 flex items-center gap-3">
          <Beef className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <div>
            <div className="text-[20px] font-bold text-[var(--text)]" style={tnum}>
              {plan?.protein_target ?? '—'}
            </div>
            <div className="text-[11px] text-[var(--text-subtle)]">g protein / day</div>
          </div>
        </div>
      </div>
      {plan?.diet_plan ? (
        <div className="text-[14.5px] leading-relaxed text-[var(--text)] whitespace-pre-wrap">{plan.diet_plan}</div>
      ) : (
        <p className="text-sm text-[var(--text-subtle)]">Your coach hasn't posted a plan yet — check back soon.</p>
      )}
      {plan?.updated_at && (
        <p className="text-[11px] text-[var(--text-subtle)] mt-4">
          Last updated {new Date(plan.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </p>
      )}
    </section>
  );
}

// ---- Measurement form ----------------------------------------------------
const FIELDS: { key: keyof MetricInput; label: string; unit: string }[] = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg' },
  { key: 'height_cm', label: 'Height', unit: 'cm' },
  { key: 'chest_cm', label: 'Chest', unit: 'cm' },
  { key: 'waist_cm', label: 'Waist', unit: 'cm' },
  { key: 'hips_cm', label: 'Hips', unit: 'cm' },
  { key: 'arm_cm', label: 'Arm', unit: 'cm' },
  { key: 'thigh_cm', label: 'Thigh', unit: 'cm' },
];

export function MetricsForm({ onSubmit, saving }: { onSubmit: (m: Partial<MetricInput>) => void; saving: boolean }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const canSave = useMemo(() => Object.values(values).some((v) => v.trim() !== ''), [values]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || saving) return;
    const m: Partial<MetricInput> = { taken_on: new Date().toISOString().slice(0, 10) };
    for (const f of FIELDS) {
      const raw = values[f.key]?.trim();
      if (raw) {
        const n = Number(raw);
        if (!Number.isNaN(n)) (m as Record<string, unknown>)[f.key] = n;
      }
    }
    if (notes.trim()) m.notes = notes.trim();
    onSubmit(m);
    setValues({});
    setNotes('');
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">
        Log today's check-in
      </span>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {FIELDS.map((f) => (
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
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Notes for your coach (sleep, energy, soreness…)"
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
        <Plus className="w-4 h-4" /> {saving ? 'Saving…' : 'Save check-in'}
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

// ---- Coach plan editor ---------------------------------------------------
export function PlanEditor({
  plan,
  onSave,
  saving,
}: {
  plan: Plan | null;
  onSave: (p: { diet_plan: string; calorie_target: number | null; protein_target: number | null }) => void;
  saving: boolean;
}) {
  const [diet, setDiet] = useState(plan?.diet_plan ?? '');
  const [cal, setCal] = useState(plan?.calorie_target?.toString() ?? '');
  const [protein, setProtein] = useState(plan?.protein_target?.toString() ?? '');
  return (
    <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">
        Plan (what the client sees)
      </span>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <label className="block">
          <span className="text-[11px] text-[var(--text-muted)]">Calories / day</span>
          <input
            type="number"
            value={cal}
            onChange={(e) => setCal(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-[var(--text-muted)]">Protein g / day</span>
          <input
            type="number"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
        </label>
      </div>
      <textarea
        value={diet}
        onChange={(e) => setDiet(e.target.value)}
        rows={10}
        placeholder={'Breakfast — 4 eggs, oats…\nLunch — …\nDinner — …'}
        className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm leading-relaxed text-[var(--text)] outline-none focus:border-[var(--accent)] resize-y"
      />
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onSave({
          diet_plan: diet,
          calorie_target: cal.trim() ? Number(cal) : null,
          protein_target: protein.trim() ? Number(protein) : null,
        })}
        disabled={saving}
        className="mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-[var(--accent-text)] disabled:opacity-50"
        style={{ background: 'var(--accent)' }}
      >
        <Save className="w-4 h-4" /> {saving ? 'Publishing…' : 'Publish to client'}
      </motion.button>
    </section>
  );
}
