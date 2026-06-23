import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2, Scale, TrendingUp } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAfterburn, exerciseProgress, loggedExerciseNames } from './store';
import Chart from './Chart';
import type { ChartPoint } from './Chart';

export default function Progress() {
  const unit = useAfterburn((s) => s.program.unit);
  const bodyweight = useAfterburn((s) => s.bodyweight);
  const sessions = useAfterburn((s) => s.sessions);
  const addBodyweight = useAfterburn((s) => s.addBodyweight);
  const deleteBodyweight = useAfterburn((s) => s.deleteBodyweight);

  const [w, setW] = useState('');
  const lifts = useMemo(() => loggedExerciseNames(sessions), [sessions]);
  const [lift, setLift] = useState('');
  const [metric, setMetric] = useState<'weight' | 'est1RM'>('weight');

  const selectedLift = lift || lifts[0] || '';
  const liftSeries = useMemo(() => exerciseProgress(sessions, selectedLift), [sessions, selectedLift]);
  const liftPoints: ChartPoint[] = liftSeries.map((d) => ({ date: d.date, value: metric === 'weight' ? d.weight : d.est1RM }));

  const bwPoints: ChartPoint[] = useMemo(
    () => [...bodyweight].sort((a, b) => a.date.localeCompare(b.date)).map((b) => ({ date: b.date, value: b.weight })),
    [bodyweight],
  );

  const logWeight = () => {
    const n = parseFloat(w);
    if (!Number.isFinite(n) || n <= 0) return;
    addBodyweight(n);
    setW('');
  };

  return (
    <div className="space-y-6">
      {/* Bodyweight */}
      <section className="space-y-3">
        <h2 className="section-label flex items-center gap-1.5">
          <Scale className="w-3.5 h-3.5" /> Bodyweight
        </h2>
        <div className="card p-4 space-y-4">
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={w}
              onChange={(e) => setW(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && logWeight()}
              placeholder={`Today's weight (${unit})`}
              className="input flex-1"
            />
            <button onClick={logWeight} disabled={!w.trim()} className="btn btn-primary disabled:opacity-50">
              <Plus className="w-4 h-4" /> Log
            </button>
          </div>

          {bwPoints.length > 0 ? (
            <Chart points={bwPoints} unit={unit} accent="var(--accent)" />
          ) : (
            <p className="text-sm text-ink-subtle text-center py-4">Log your weight to start a trend.</p>
          )}
        </div>

        {bodyweight.length > 0 && (
          <div className="space-y-1.5">
            {bodyweight.slice(0, 8).map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm card !py-2 px-3">
                <span className="text-ink font-medium">
                  {b.weight} {unit}
                </span>
                <span className="text-xs text-ink-subtle">{format(new Date(b.date), 'EEE, MMM d')}</span>
                <button onClick={() => deleteBodyweight(b.id)} className="p-1 text-ink-subtle hover:text-danger" aria-label="Delete entry">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Per-lift progress */}
      <section className="space-y-3">
        <h2 className="section-label flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" /> Lift progress
        </h2>
        {lifts.length === 0 ? (
          <p className="text-sm text-ink-subtle">Log some workouts and your strength trend per exercise shows up here.</p>
        ) : (
          <div className="card p-4 space-y-3">
            <div className="flex gap-2">
              <select value={selectedLift} onChange={(e) => setLift(e.target.value)} className="input flex-1 text-sm">
                {lifts.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <div className="flex bg-elevated p-0.5 rounded-lg border border-border shrink-0">
                {(['weight', 'est1RM'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetric(m)}
                    className={cn('px-2.5 py-1 rounded-md text-xs font-medium', metric === m ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted')}
                  >
                    {m === 'weight' ? 'Top set' : 'Est 1RM'}
                  </button>
                ))}
              </div>
            </div>
            <Chart points={liftPoints} unit={unit} accent="#fb923c" />
          </div>
        )}
      </section>
    </div>
  );
}
