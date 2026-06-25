import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2, Scale, TrendingUp } from 'lucide-react';
import { useAfterburn, weeklyVolume } from './store';
import Chart from './Chart';
import type { ChartPoint } from './Chart';

export default function Progress() {
  const unit = useAfterburn((s) => s.program.unit);
  const bodyweight = useAfterburn((s) => s.bodyweight);
  const sessions = useAfterburn((s) => s.sessions);
  const addBodyweight = useAfterburn((s) => s.addBodyweight);
  const deleteBodyweight = useAfterburn((s) => s.deleteBodyweight);

  const [w, setW] = useState('');

  const volume = useMemo(() => weeklyVolume(sessions), [sessions]);
  const volPoints: ChartPoint[] = volume.map((v) => ({ date: v.weekStart, value: v.volume }));
  const latestWeek = volume[volume.length - 1];

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

      {/* Weekly training volume — overall progress, not per-exercise */}
      <section className="space-y-3">
        <h2 className="section-label flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" /> Weekly volume
        </h2>
        {volume.length === 0 ? (
          <p className="text-sm text-ink-subtle">Log some workouts and your total weekly training volume shows up here.</p>
        ) : (
          <div className="card p-4 space-y-2">
            <Chart points={volPoints} unit="" accent="#fb923c" />
            <p className="text-[11px] text-ink-subtle">
              Total load = weight × reps across <span className="text-ink">all</span> lifts, bucketed by week (in {unit}).
              {latestWeek && (
                <> Latest week: <span className="text-ink font-medium">{latestWeek.volume.toLocaleString()} {unit}·reps</span> over {latestWeek.sets} sets.</>
              )}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
