import { useMemo } from 'react';
import { cn } from '../lib/utils';
import { useAfterburn } from './store';
import { ACTIVITY, GOALS, DIET_STYLES, computeTargets, allMaintenance, bmiOf, recalibration, computeCycling, bodyFatContext } from './nutrition';
import type { ActivityLevel, BmrMethod, Goal, RateFlag, Sex } from './nutrition';

const RATE_BADGE: Record<RateFlag, { label: string; cls: string } | null> = {
  ideal: { label: 'Ideal pace', cls: 'bg-success/15 text-success' },
  aggressive: { label: 'Aggressive — may cost muscle & strength', cls: 'bg-danger/15 text-danger' },
  slow: { label: 'Very slow', cls: 'bg-elevated text-ink-subtle' },
  none: null,
};

const METHODS: { id: BmrMethod; label: string }[] = [
  { id: 'mifflin', label: 'Mifflin–St Jeor (recommended)' },
  { id: 'katch', label: 'Katch–McArdle (needs body-fat %)' },
  { id: 'harris', label: 'Harris–Benedict' },
  { id: 'etf', label: 'Quick estimate (bodyweight × 14–18)' },
];

function Num({ label, value, onChange, suffix, placeholder }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; suffix?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-1 block">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className="input !py-1.5 text-sm"
        />
        {suffix && <span className="text-xs text-ink-subtle">{suffix}</span>}
      </div>
    </label>
  );
}

export default function Nutrition() {
  const n = useAfterburn((s) => s.nutrition);
  const setNutrition = useAfterburn((s) => s.setNutrition);
  const bodyweight = useAfterburn((s) => s.bodyweight);

  const latest = bodyweight[0]?.weight;
  const targets = useMemo(() => computeTargets(n), [n]);
  const maint = useMemo(() => allMaintenance(n), [n]);
  const bmi = useMemo(() => bmiOf(n), [n]);
  const showBfTip = bmi != null && bmi >= 30 && n.bodyFatPct == null;
  const recal = useMemo(
    () => (targets ? recalibration(bodyweight, targets.weeklyDeltaKg, targets.goalCalories, n.weightKg) : null),
    [bodyweight, targets, n.weightKg],
  );
  const cycling = useMemo(
    () => (targets && n.cycling ? computeCycling(targets, n.trainingDays ?? 4) : null),
    [targets, n.cycling, n.trainingDays],
  );
  const bfCtx = n.bodyFatPct ? bodyFatContext(n.bodyFatPct, n.sex) : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold">Calorie & macro finder</h2>
        <p className="text-xs text-ink-subtle mt-0.5">Evidence-based, from your nutrition guides. Adjust and it recalculates live.</p>
      </div>

      {/* Inputs */}
      <div className="card p-4 space-y-3">
        <div className="flex gap-2">
          {(['male', 'female'] as Sex[]).map((s) => (
            <button
              key={s}
              onClick={() => setNutrition({ sex: s })}
              className={cn('flex-1 btn !py-1.5 text-sm capitalize', n.sex === s ? 'btn-primary' : 'btn-secondary')}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Num label="Age" value={n.age} onChange={(v) => setNutrition({ age: v ?? 0 })} />
          <Num label="Height" value={n.heightCm} onChange={(v) => setNutrition({ heightCm: v ?? 0 })} suffix="cm" />
          <Num label="Weight" value={n.weightKg} onChange={(v) => setNutrition({ weightKg: v ?? 0 })} suffix="kg" />
        </div>
        {latest != null && Math.abs(latest - n.weightKg) > 0.05 && (
          <button onClick={() => setNutrition({ weightKg: latest })} className="text-xs text-accent underline underline-offset-2">
            Use latest logged weight ({latest} kg)
          </button>
        )}

        <Num label="Body fat % (optional — improves accuracy)" value={n.bodyFatPct} onChange={(v) => setNutrition({ bodyFatPct: v })} suffix="%" placeholder="e.g. 18" />

        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-1 block">Activity</span>
          <select value={n.activity} onChange={(e) => setNutrition({ activity: e.target.value as ActivityLevel })} className="input !py-1.5 text-sm">
            {ACTIVITY.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
          <p className="text-[11px] text-ink-subtle mt-1">Be honest — most people overestimate. Picking "Moderate" when you're really "Light" can add 300–400 kcal. This is a starting estimate; refine it from your real weight trend below.</p>
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-1 block">Goal</span>
          <select value={n.goal} onChange={(e) => setNutrition({ goal: e.target.value as Goal })} className="input !py-1.5 text-sm">
            {GOALS.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </label>

        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-1 block">Diet style (carb : fat split)</span>
          <div className="flex gap-2">
            {DIET_STYLES.map((d) => (
              <button
                key={d.id}
                onClick={() => setNutrition({ dietStyle: d.id })}
                className={cn('flex-1 btn !py-1.5 text-xs', (n.dietStyle ?? 'balanced') === d.id ? 'btn-primary' : 'btn-secondary')}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-subtle mt-1">{DIET_STYLES.find((d) => d.id === (n.dietStyle ?? 'balanced'))?.hint}</p>
        </div>

        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-1 block">BMR formula</span>
          <select value={n.method} onChange={(e) => setNutrition({ method: e.target.value as BmrMethod })} className="input !py-1.5 text-sm">
            {METHODS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Results */}
      {targets ? (
        <>
          <div className="card p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="section-label">Daily target</p>
                <p className="font-display text-4xl font-bold text-ink">
                  {targets.goalCalories}
                  <span className="text-base text-ink-subtle font-normal ml-1">kcal</span>
                </p>
              </div>
              <div className="text-right text-xs text-ink-subtle">
                <p>BMR {targets.method === 'etf' ? '—' : targets.bmr}</p>
                <p>Maintenance {targets.tdee}</p>
              </div>
            </div>

            {showBfTip && (
              <p className="mt-3 text-[11px] text-orange-400">
                At higher body fat, prediction equations over-estimate (they assume average body composition). Enter your body-fat % above to use Katch–McArdle (lean-mass based) — and treat this as a starting estimate to refine from your weight trend.
              </p>
            )}

            {/* Macro bars */}
            <div className="mt-4 space-y-2">
              <MacroRow label="Protein" grams={targets.proteinG} kcal={targets.proteinG * 4} total={targets.goalCalories} perKg={targets.proteinPerKgUsed} color="#fb923c" />
              <MacroRow label="Carbs" grams={targets.carbG} kcal={targets.carbG * 4} total={targets.goalCalories} perKg={targets.carbPerKg} color="#60a5fa" />
              <MacroRow label="Fat" grams={targets.fatG} kcal={targets.fatG * 9} total={targets.goalCalories} perKg={targets.fatPerKg} color="#facc15" />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-subtle">
              <p>Fiber target: <span className="text-ink font-medium">{targets.fiberG} g</span></p>
              <p>Protein/meal (×{targets.recommendedMeals}): <span className="text-ink font-medium">{targets.proteinPerMealG} g</span></p>
              <p>Protein basis: <span className="text-ink font-medium">{targets.proteinPerKgUsed} g/kg {targets.basis}</span></p>
              <p>Projected: <span className={cn('font-medium', targets.weeklyDeltaKg < 0 ? 'text-orange-400' : targets.weeklyDeltaKg > 0 ? 'text-success' : 'text-ink')}>{targets.weeklyDeltaKg > 0 ? '+' : ''}{targets.weeklyDeltaKg} kg/wk ({targets.weeklyDeltaPctBW > 0 ? '+' : ''}{targets.weeklyDeltaPctBW}% BW)</span></p>
            </div>

            {targets.warnings.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {targets.warnings.map((w) => (
                  <p key={w} className="text-[11px] text-orange-300 bg-orange-500/10 rounded-md px-2 py-1.5">{w}</p>
                ))}
              </div>
            )}

            {RATE_BADGE[targets.rateFlag] && (
              <span className={cn('inline-block mt-3 px-2 py-1 rounded-md text-[11px] font-semibold', RATE_BADGE[targets.rateFlag]!.cls)}>
                {RATE_BADGE[targets.rateFlag]!.label}
              </span>
            )}
            {bfCtx && (
              <p className={cn('text-[11px] mt-2', bfCtx.status === 'healthy' ? 'text-success' : 'text-ink-subtle')}>Body fat {n.bodyFatPct}%: {bfCtx.note}</p>
            )}
            <p className="text-[11px] text-ink-subtle mt-2">
              Using <span className="text-ink">{METHODS.find((m) => m.id === targets.method)?.label}</span>. Projection is a START estimate — a 500 kcal deficit doesn't equal a fixed weight change (metabolic adaptation), so recalibrate from your real weight trend below.
            </p>
          </div>

          {/* Calorie cycling (zig-zag) */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="section-label">Calorie cycling</p>
                <p className="text-[11px] text-ink-subtle mt-0.5">Higher carbs on training days, lower on rest — same weekly average.</p>
              </div>
              <button
                onClick={() => setNutrition({ cycling: !n.cycling })}
                className={cn('relative w-11 h-6 rounded-full transition-colors shrink-0', n.cycling ? 'bg-accent' : 'bg-elevated')}
                aria-pressed={n.cycling}
                aria-label="Toggle calorie cycling"
              >
                <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform', n.cycling && 'translate-x-5')} />
              </button>
            </div>
            {n.cycling && cycling && (
              <>
                <label className="flex items-center gap-2 mt-3 text-xs text-ink-subtle">
                  Training days/week
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={n.trainingDays ?? 4}
                    onChange={(e) => setNutrition({ trainingDays: Math.min(6, Math.max(1, Number(e.target.value) || 4)) })}
                    className="input !py-1 !w-16 text-sm"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <CycleCard title={`Training (${cycling.trainingDays}×)`} d={cycling.training} />
                  <CycleCard title={`Rest (${cycling.restDays}×)`} d={cycling.rest} />
                </div>
              </>
            )}
          </div>

          {/* Cross-check: estimated maintenance by every method */}
          <div className="card p-4">
            <p className="section-label mb-2">Estimated maintenance (all methods)</p>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {METHODS.map((m) => (
                <div key={m.id} className={cn('flex justify-between', m.id === targets.method && 'text-accent')}>
                  <span className={m.id === targets.method ? 'text-accent' : 'text-ink-subtle'}>{m.label.split(' (')[0]}</span>
                  <span className="font-medium">{maint[m.id] != null ? Math.round(maint[m.id]!) : '—'}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-ink-subtle mt-2">Equations disagree by design — they're estimates. Mifflin–St Jeor is the validated best starting point; your real weight trend is the source of truth.</p>
          </div>

          {/* Auto-recalibration from the weight log */}
          <div className="card p-4">
            <p className="section-label mb-1">Auto-recalibration</p>
            {recal ? (
              <div className="text-sm space-y-1">
                <p className="text-ink-subtle">
                  Your 7-day trend is <span className="text-ink font-medium">{recal.observedWeeklyKg > 0 ? '+' : ''}{recal.observedWeeklyKg} kg/wk</span>; goal targets{' '}
                  <span className="text-ink font-medium">{targets.weeklyDeltaKg > 0 ? '+' : ''}{targets.weeklyDeltaKg} kg/wk</span>. Estimated true maintenance ≈ <span className="text-ink font-medium">{recal.estMaintenanceKcal} kcal</span>.
                </p>
                {recal.onTrack ? (
                  <p className="text-success">On track (within 0.3% BW/wk) — no change needed.</p>
                ) : (
                  <p className="text-ink">
                    Suggestion: <span className={cn('font-semibold', recal.suggestedKcalChange < 0 ? 'text-orange-400' : 'text-success')}>{recal.suggestedKcalChange > 0 ? 'add' : 'cut'} {Math.abs(recal.suggestedKcalChange)} kcal/day</span> (≈ {targets.goalCalories + recal.suggestedKcalChange} kcal). Assumes you've eaten near your target.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-subtle">Log your weight for ~1–2 weeks (Progress tab) and I'll compare your real 7-day trend to the target and suggest an adjustment.</p>
            )}
          </div>
        </>
      ) : (
        <p className="card p-4 text-sm text-ink-subtle">Enter your age, height and weight to calculate.</p>
      )}
    </div>
  );
}

function CycleCard({ title, d }: { title: string; d: { kcal: number; proteinG: number; carbG: number; fatG: number } }) {
  return (
    <div className="rounded-lg bg-elevated p-3">
      <p className="text-xs font-semibold text-ink">{title}</p>
      <p className="font-display text-2xl font-bold text-ink mt-0.5">{d.kcal}<span className="text-xs text-ink-subtle font-normal ml-1">kcal</span></p>
      <p className="text-[11px] text-ink-subtle mt-1">P {d.proteinG} · C {d.carbG} · F {d.fatG} g</p>
    </div>
  );
}

function MacroRow({ label, grams, kcal, total, perKg, color }: { label: string; grams: number; kcal: number; total: number; perKg?: number; color: string }) {
  const pct = total > 0 ? Math.round((kcal / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-ink font-medium">{label}</span>
        <span className="text-ink-subtle">{grams} g{perKg != null ? ` · ${perKg} g/kg` : ''} · {pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-elevated overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
