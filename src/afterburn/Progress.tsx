import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { Plus, Trash2, Scale, TrendingUp, TrendingDown, Trophy, Activity, Minus, Sparkles, Gauge, Wind, Play, Square } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAfterburn, weeklyVolume, volumeTrend, weekAdherence, detectPRs, formatVolume } from './store';
import { analyzeVolume, MUSCLE_LABEL } from './volume';
import type { MuscleAnalysis, VolumeStatus } from './volume';
import { recoveryReadiness, co2Band } from './recovery';
import type { ReadinessVerdict } from './recovery';
import { GOALS, weightTrendKgPerWeek } from './nutrition';
import { AnimatedNumber } from '../components/ui';
import { useReducedMotion, springSoft } from '../lib/motion';
import Chart from './Chart';
import type { ChartPoint } from './Chart';

const tileVariants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

function MomentumTile({ icon, label, children, tone }: { icon: ReactNode; label: string; children: ReactNode; tone: 'up' | 'down' | 'flat' }) {
  const rm = useReducedMotion();
  return (
    <motion.div
      variants={tileVariants}
      whileHover={rm ? undefined : { y: -3 }}
      transition={springSoft}
      className="rounded-2xl bg-elevated border border-border p-3"
    >
      <div className="flex items-center gap-1.5 text-ink-subtle">
        <span className={cn(tone === 'up' ? 'text-ember' : tone === 'down' ? 'text-[var(--warning)]' : 'text-ink-muted')}>{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-1.5 text-ink font-display text-lg font-bold leading-tight">{children}</div>
    </motion.div>
  );
}

const VOL_STATUS: Record<VolumeStatus, { label: string; color: string; chip: string }> = {
  below: { label: 'Below MEV', color: 'var(--warning)', chip: 'text-[var(--warning)] bg-[var(--accent-soft)]' },
  untrained: { label: 'Untrained', color: 'var(--border)', chip: 'text-ink-subtle bg-elevated' },
  optimal: { label: 'Optimal', color: 'var(--success)', chip: 'text-success bg-success/15' },
  high: { label: 'Near MRV', color: 'var(--ember)', chip: 'text-ember bg-ember-soft' },
  excessive: { label: 'Over MRV', color: 'var(--danger)', chip: 'text-danger bg-danger/15' },
};

/** A horizontal bar of weekly sets, with reference ticks at MEV / MAV / MRV. */
function VolumeBar({ m }: { m: MuscleAnalysis }) {
  const rm = useReducedMotion();
  const scaleMax = m.landmark.mrv * 1.15;
  const pct = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;
  return (
    <div className="relative h-2.5 rounded-full bg-elevated overflow-hidden">
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ backgroundColor: VOL_STATUS[m.status].color }}
        initial={rm ? { width: pct(m.sets) } : { width: 0 }}
        animate={{ width: pct(m.sets) }}
        transition={{ duration: 0.7, ease: [0.21, 1, 0.4, 1], delay: 0.1 }}
      />
      {[m.landmark.mev, m.landmark.mav, m.landmark.mrv].map((v, i) => (
        <div key={i} className="absolute inset-y-0 w-px bg-ink/40" style={{ left: pct(v) }} title={`${['MEV', 'MAV', 'MRV'][i]} ${v}`} />
      ))}
    </div>
  );
}

function VolumeRow({ m }: { m: MuscleAnalysis }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink flex items-center gap-1">
          {m.label}
          {m.dir === 'up' && <TrendingUp className="w-3 h-3 text-ember" />}
          {m.dir === 'down' && <TrendingDown className="w-3 h-3 text-[var(--warning)]" />}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-ink-subtle tabular-nums">{m.sets} sets</span>
          <span className={cn('chip !px-1.5 !py-0.5 text-[10px] font-semibold border-0', VOL_STATUS[m.status].chip)}>{VOL_STATUS[m.status].label}</span>
        </span>
      </div>
      <VolumeBar m={m} />
      {m.status !== 'optimal' && <p className="text-[11px] text-ink-subtle">{m.recommendation}</p>}
    </div>
  );
}

const READINESS: Record<ReadinessVerdict, { label: string; color: string; bg: string }> = {
  recovered: { label: 'Recovered', color: 'text-success', bg: 'var(--success)' },
  moderate: { label: 'Moderate', color: 'text-ember', bg: 'var(--ember)' },
  under: { label: 'Under-recovered', color: 'text-[var(--warning)]', bg: 'var(--warning)' },
  na: { label: 'No data yet', color: 'text-ink-subtle', bg: 'var(--border)' },
};

/** The CO2 tolerance test: a guided exhale timer + a manual seconds entry. */
function CO2Test({ onLog }: { onLog: (score: number) => void }) {
  const rm = useReducedMotion();
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const [manual, setManual] = useState('');

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 100);
    return () => clearInterval(id);
  }, [running]);

  const start = () => {
    startRef.current = Date.now();
    setElapsed(0);
    setRunning(true);
  };
  const stop = () => {
    setRunning(false);
    const s = Math.round((Date.now() - startRef.current) / 1000);
    if (s > 0) onLog(s);
  };
  const logManual = () => {
    const s = Math.round(parseFloat(manual));
    if (Number.isFinite(s) && s > 0) {
      onLog(s);
      setManual('');
    }
  };

  return (
    <div className="space-y-3">
      {running ? (
        <motion.button
          onClick={stop}
          className="w-full rounded-xl border border-ember bg-ember-soft py-4 flex flex-col items-center"
          animate={rm ? undefined : { scale: [1, 1.02, 1] }}
          transition={rm ? undefined : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span className="font-mono-data text-4xl font-bold text-ink tabular-nums">{elapsed.toFixed(1)}s</span>
          <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-ember"><Square className="w-3.5 h-3.5" /> Exhale slowly… tap to stop &amp; log</span>
        </motion.button>
      ) : (
        <button onClick={start} className="btn btn-primary w-full">
          <Play className="w-4 h-4" /> Start CO2 test
        </button>
      )}
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && logManual()}
          placeholder="…or enter seconds manually"
          className="input flex-1"
        />
        <button onClick={logManual} disabled={!manual.trim()} className="btn btn-secondary disabled:opacity-50">
          <Plus className="w-4 h-4" /> Log
        </button>
      </div>
      <p className="text-[11px] text-ink-subtle">
        A few easy breaths, then one full inhale — then exhale as slowly and controlled as you can. The timer measures your exhale; longer = better recovery.
      </p>
    </div>
  );
}

export default function Progress() {
  const unit = useAfterburn((s) => s.program.unit);
  const bodyweight = useAfterburn((s) => s.bodyweight);
  const sessions = useAfterburn((s) => s.sessions);
  const program = useAfterburn((s) => s.program);
  const currentWeekId = useAfterburn((s) => s.currentWeekId);
  const nutrition = useAfterburn((s) => s.nutrition);
  const addBodyweight = useAfterburn((s) => s.addBodyweight);
  const deleteBodyweight = useAfterburn((s) => s.deleteBodyweight);
  const recovery = useAfterburn((s) => s.recovery);
  const addRecovery = useAfterburn((s) => s.addRecovery);
  const deleteRecovery = useAfterburn((s) => s.deleteRecovery);
  const rm = useReducedMotion();

  const [w, setW] = useState('');
  const [mountedAt] = useState(() => Date.now());

  const volume = useMemo(() => weeklyVolume(sessions), [sessions]);
  const volPoints: ChartPoint[] = volume.map((v) => ({ date: v.weekStart, value: v.volume }));
  const latestWeek = volume[volume.length - 1];

  // ---- "Volume IQ" — hard sets per muscle vs scientific landmarks ----
  const vol = useMemo(() => analyzeVolume(sessions), [sessions]);

  // ---- Recovery — CO2 tolerance test readiness ----
  const readiness = useMemo(() => recoveryReadiness(recovery), [recovery]);
  const recoveryPoints: ChartPoint[] = useMemo(
    () => [...recovery].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ date: r.date, value: r.co2Score })),
    [recovery],
  );

  // ---- "Momentum" progress signals ----
  const vt = useMemo(() => volumeTrend(sessions), [sessions]);
  const adh = useMemo(() => weekAdherence(program, sessions, currentWeekId), [program, sessions, currentWeekId]);
  const recentPRs = useMemo(() => (sessions.length ? detectPRs(sessions, sessions[0]) : []), [sessions]);
  const bwPerWeek = useMemo(() => weightTrendKgPerWeek(bodyweight), [bodyweight]);
  const goalPct = GOALS.find((g) => g.id === nutrition.goal)?.pct ?? 0;
  // Does the bodyweight trend point the way the goal wants?
  const bwAligned = bwPerWeek == null
    ? null
    : goalPct < 0
      ? bwPerWeek < -0.05
      : goalPct > 0
        ? bwPerWeek > 0.05
        : Math.abs(bwPerWeek) < 0.15;
  const score =
    (vt.dir === 'up' ? 1 : vt.dir === 'down' ? -1 : 0) +
    (adh.total > 0 && adh.pct >= 80 ? 1 : adh.total > 0 && adh.pct < 50 ? -1 : 0) +
    (recentPRs.length ? 1 : 0) +
    (bwAligned === true ? 1 : bwAligned === false ? -1 : 0);
  const verdict = score >= 2 ? 'Progressing' : score <= -1 ? 'Easing off' : 'Holding steady';
  const verdictHint =
    verdict === 'Progressing'
      ? 'Volume, consistency and strength are trending your way. Keep it up.'
      : verdict === 'Easing off'
        ? 'A few signals dipped — a lighter patch is fine, just keep showing up.'
        : 'Steady work. Small, consistent progress compounds.';
  const hasSignals = sessions.length > 0;

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
      {/* Momentum — are you moving in the right direction? */}
      {hasSignals && (
        <motion.section
          initial={rm ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.21, 1, 0.4, 1] }}
          className="space-y-3"
        >
          <h2 className="section-label flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Momentum
          </h2>
          <div className="neo-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-display-italic text-3xl text-ink">{verdict}</p>
                <p className="text-xs text-ink-subtle mt-0.5 max-w-[22rem]">{verdictHint}</p>
              </div>
              <span
                className={cn(
                  'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0',
                  verdict === 'Progressing' ? 'text-ember' : verdict === 'Easing off' ? 'text-[var(--warning)]' : 'text-[var(--accent)]',
                )}
                style={{ background: verdict === 'Progressing' ? 'var(--ember-soft)' : 'var(--accent-soft)' }}
              >
                {verdict === 'Progressing' ? <TrendingUp className="w-6 h-6" /> : verdict === 'Easing off' ? <TrendingDown className="w-6 h-6" /> : <Activity className="w-6 h-6" />}
              </span>
            </div>

            <motion.div
              className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4"
              initial={rm ? false : 'hidden'}
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } }}
            >
              <MomentumTile icon={vt.dir === 'up' ? <TrendingUp className="w-3.5 h-3.5" /> : vt.dir === 'down' ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />} label="Volume vs last wk" tone={vt.dir === 'up' ? 'up' : vt.dir === 'down' ? 'down' : 'flat'}>
                {vt.deltaPct == null ? '—' : (<><span>{vt.deltaPct > 0 ? '+' : ''}<AnimatedNumber value={vt.deltaPct} />%</span></>)}
              </MomentumTile>
              <MomentumTile icon={<Activity className="w-3.5 h-3.5" />} label="Consistency" tone={adh.pct >= 80 ? 'up' : adh.pct < 50 ? 'down' : 'flat'}>
                {adh.total > 0 ? <><AnimatedNumber value={adh.done} />/{adh.total} <span className="text-xs text-ink-subtle font-normal">days</span></> : '—'}
              </MomentumTile>
              <MomentumTile icon={<Scale className="w-3.5 h-3.5" />} label="Bodyweight/wk" tone={bwAligned ? 'up' : bwAligned === false ? 'down' : 'flat'}>
                {bwPerWeek == null ? '—' : <>{bwPerWeek > 0 ? '+' : ''}{Math.round(bwPerWeek * 10) / 10} <span className="text-xs text-ink-subtle font-normal">{unit}</span></>}
              </MomentumTile>
              <MomentumTile icon={<Trophy className="w-3.5 h-3.5" />} label="PRs last workout" tone={recentPRs.length ? 'up' : 'flat'}>
                <AnimatedNumber value={recentPRs.length} />
              </MomentumTile>
            </motion.div>

            {recentPRs.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {recentPRs.slice(0, 5).map((pr, i) => (
                  <span key={i} className="chip text-ember border-ember bg-ember-soft">
                    <Trophy className="w-3 h-3" /> {pr.lift} {pr.kind === 'weight' ? `${pr.value}${unit}` : `${pr.value} e1RM`}
                  </span>
                ))}
              </div>
            )}
          </div>
        </motion.section>
      )}

      {/* Momentum teaser before any workouts are logged */}
      {!hasSignals && (
        <section className="space-y-3">
          <h2 className="section-label flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Momentum
          </h2>
          <div className="neo-card p-5 text-center">
            <span className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
              <Activity className="w-6 h-6 text-[var(--accent)]" />
            </span>
            <p className="font-display text-lg font-bold text-ink mt-3">Track your direction</p>
            <p className="text-xs text-ink-subtle mt-1 max-w-xs mx-auto">
              Log a workout and this shows whether you're trending up — volume vs last week, consistency, bodyweight direction and any new PRs.
            </p>
          </div>
        </section>
      )}

      {/* Volume IQ — hard sets per muscle vs MEV / MAV / MRV landmarks */}
      {vol.hasData && vol.trained.length > 0 && (
        <motion.section
          initial={rm ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.21, 1, 0.4, 1] }}
          className="space-y-3"
        >
          <h2 className="section-label flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5" /> Volume IQ
          </h2>
          <div className="neo-card p-5 space-y-4">
            <div>
              <p className="text-sm text-ink font-medium">{vol.headline}</p>
              <p className="text-[11px] text-ink-subtle mt-1">
                Hard sets per muscle over your last 7 training days vs your science-based landmarks — ticks mark MEV (start growing), MAV (sweet spot) and MRV (recovery ceiling).
              </p>
            </div>

            <div className="space-y-3.5">
              {vol.trained.map((m) => (
                <VolumeRow key={m.muscle} m={m} />
              ))}
            </div>

            {vol.neglected.length > 0 && (
              <div className="pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle mb-1.5">Not trained (last 7 days)</p>
                <div className="flex flex-wrap gap-1.5">
                  {vol.neglected.map((mu) => (
                    <span key={mu} className="chip text-ink-subtle bg-elevated border-0 !text-[11px]">{MUSCLE_LABEL[mu]}</span>
                  ))}
                </div>
              </div>
            )}

            {vol.unclassified.length > 0 && (
              <p className="text-[11px] text-ink-subtle border-t border-border pt-2">
                Not counted (unrecognized lift): {vol.unclassified.join(', ')}. Rename it to a standard movement and it'll be tracked.
              </p>
            )}
          </div>
        </motion.section>
      )}

      {/* Recovery — CO2 tolerance test */}
      <motion.section
        initial={rm ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.21, 1, 0.4, 1], delay: 0.08 }}
        className="space-y-3"
      >
        <h2 className="section-label flex items-center gap-1.5">
          <Wind className="w-3.5 h-3.5" /> Recovery — CO2 tolerance test
        </h2>
        <div className="card p-4 space-y-4">
          {readiness.verdict !== 'na' && (
            <div className="neo-card p-4 flex items-center justify-between gap-3">
              <div>
                <p className={cn('font-display text-xl font-bold', READINESS[readiness.verdict].color)}>{READINESS[readiness.verdict].label}</p>
                <p className="text-[11px] text-ink-subtle mt-0.5 max-w-[20rem]">{readiness.advice}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-display text-2xl font-bold text-ink tabular-nums">{readiness.latest}s</p>
                <p className="text-[11px] text-ink-subtle">
                  {readiness.band ? co2Band(readiness.latest!).label : ''}
                  {readiness.baseline != null && (
                    <> · {readiness.deltaPct != null && readiness.deltaPct > 0 ? '+' : ''}{readiness.deltaPct}% vs {readiness.baseline}s</>
                  )}
                </p>
              </div>
            </div>
          )}

          <CO2Test onLog={(s) => addRecovery(s)} />

          {recoveryPoints.length > 1 && <Chart points={recoveryPoints} unit="s" accent="var(--ember)" />}
        </div>

        {recovery.length > 0 && (
          <div className="space-y-1.5">
            {recovery.slice(0, 8).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm card !py-2 px-3">
                <span className="text-ink font-medium tabular-nums">
                  {r.co2Score}s <span className="text-xs text-ink-subtle font-normal">· {co2Band(r.co2Score).label}</span>
                </span>
                <span className="text-xs text-ink-subtle">{format(new Date(r.date), 'EEE, MMM d')}</span>
                <button onClick={() => deleteRecovery(r.id)} className="p-1 text-ink-subtle hover:text-danger" aria-label="Delete entry">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </motion.section>

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
            <Chart points={bwPoints} unit={unit} accent="var(--ember)" />
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
            <Chart points={volPoints} unit="" accent="var(--ember)" format={(v) => formatVolume(v, unit)} />
            <p className="text-[11px] text-ink-subtle">
              Total load = weight × reps across <span className="text-ink">all</span> lifts, bucketed by week (in {unit}).
              {latestWeek && (
                <>
                  {' '}Latest week: <span className="text-ink font-medium">{formatVolume(latestWeek.volume, unit)}</span> over {latestWeek.sets} sets
                  {new Date(latestWeek.weekStart).getTime() > mountedAt - 7 * 86_400_000 ? ' · current week still in progress' : ''}.
                </>
              )}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
