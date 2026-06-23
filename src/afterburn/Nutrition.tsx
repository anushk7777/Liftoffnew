import { useMemo } from 'react';
import { cn } from '../lib/utils';
import { useAfterburn } from './store';
import { ACTIVITY, GOALS, computeTargets, allBmr, recalibration } from './nutrition';
import type { ActivityLevel, BmrMethod, Goal, Sex } from './nutrition';

const METHODS: { id: BmrMethod; label: string }[] = [
  { id: 'mifflin', label: 'Mifflin–St Jeor' },
  { id: 'katch', label: 'Katch–McArdle (needs body-fat %)' },
  { id: 'harris', label: 'Harris–Benedict' },
  { id: 'etf', label: 'ETF quick (22 × kg)' },
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
  const bmrs = useMemo(() => allBmr(n), [n]);
  const recal = useMemo(
    () => (targets ? recalibration(bodyweight, targets.weeklyDeltaKg) : null),
    [bodyweight, targets],
  );

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
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-1 block">Goal</span>
          <select value={n.goal} onChange={(e) => setNutrition({ goal: e.target.value as Goal })} className="input !py-1.5 text-sm">
            {GOALS.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </label>

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
                <p>BMR {targets.bmr}</p>
                <p>Maintenance {targets.tdee}</p>
              </div>
            </div>

            {/* Macro bars */}
            <div className="mt-4 space-y-2">
              <MacroRow label="Protein" grams={targets.proteinG} kcal={targets.proteinG * 4} total={targets.goalCalories} color="#fb923c" />
              <MacroRow label="Carbs" grams={targets.carbG} kcal={targets.carbG * 4} total={targets.goalCalories} color="#60a5fa" />
              <MacroRow label="Fat" grams={targets.fatG} kcal={targets.fatG * 9} total={targets.goalCalories} color="#facc15" />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-subtle">
              <p>Fiber target: <span className="text-ink font-medium">{targets.fiberG} g</span></p>
              <p>Protein/meal (×4): <span className="text-ink font-medium">{targets.proteinPerMeal} g</span></p>
              <p>Protein basis: <span className="text-ink font-medium">{targets.proteinPerKgUsed} g/kg {targets.basis}</span></p>
              <p>Projected: <span className={cn('font-medium', targets.weeklyDeltaKg < 0 ? 'text-orange-400' : targets.weeklyDeltaKg > 0 ? 'text-success' : 'text-ink')}>{targets.weeklyDeltaKg > 0 ? '+' : ''}{targets.weeklyDeltaKg} kg/wk</span></p>
            </div>
            <p className="text-[11px] text-ink-subtle mt-2">
              Using <span className="text-ink">{METHODS.find((m) => m.id === targets.method)?.label}</span>. Projection is a START estimate — a 500 kcal deficit doesn't equal a fixed weight change (metabolic adaptation), so recalibrate from your real weight trend below.
            </p>
          </div>

          {/* Cross-check: all BMR methods */}
          <div className="card p-4">
            <p className="section-label mb-2">BMR cross-check (all methods)</p>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {METHODS.map((m) => (
                <div key={m.id} className="flex justify-between">
                  <span className="text-ink-subtle">{m.label.split(' (')[0]}</span>
                  <span className="text-ink font-medium">{bmrs[m.id] != null ? Math.round(bmrs[m.id]!) : '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Auto-recalibration from the weight log */}
          <div className="card p-4">
            <p className="section-label mb-1">Auto-recalibration</p>
            {recal ? (
              <div className="text-sm space-y-1">
                <p className="text-ink-subtle">
                  Your weight is trending <span className="text-ink font-medium">{recal.observedWeeklyKg > 0 ? '+' : ''}{recal.observedWeeklyKg} kg/wk</span>; your goal targets{' '}
                  <span className="text-ink font-medium">{targets.weeklyDeltaKg > 0 ? '+' : ''}{targets.weeklyDeltaKg} kg/wk</span>.
                </p>
                {Math.abs(recal.suggestedKcalChange) >= 50 ? (
                  <p className="text-ink">
                    Suggestion: <span className={cn('font-semibold', recal.suggestedKcalChange < 0 ? 'text-orange-400' : 'text-success')}>{recal.suggestedKcalChange > 0 ? 'add' : 'cut'} {Math.abs(recal.suggestedKcalChange)} kcal/day</span> (≈ {targets.goalCalories + recal.suggestedKcalChange} kcal). Assumes you've been eating near your target.
                  </p>
                ) : (
                  <p className="text-success">On track — no change needed.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-subtle">Log your weight for ~1–2 weeks (Progress tab) and I'll compare your real trend to the target and suggest an adjustment.</p>
            )}
          </div>
        </>
      ) : (
        <p className="card p-4 text-sm text-ink-subtle">Enter your age, height and weight to calculate.</p>
      )}
    </div>
  );
}

function MacroRow({ label, grams, kcal, total, color }: { label: string; grams: number; kcal: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((kcal / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-ink font-medium">{label}</span>
        <span className="text-ink-subtle">{grams} g · {pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-elevated overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
