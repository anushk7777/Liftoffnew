import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { Plus, Trash2, Scale, TrendingUp, TrendingDown, Trophy, Activity, Minus, Sparkles, Gauge, Wind, Play, Square } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAfterburn, volumeByProgramWeek, volumeTrend, weekAdherence, detectPRs, formatVolume } from './store';
import { analyzeVolume, MUSCLE_LABEL } from './volume';
import type { MuscleAnalysis, VolumeStatus } from './volume';
import { liftReturns, deadWeight } from './innovation/returns';
import { blockReport } from './innovation/blockReport';
import type { LiftReturn, ReturnVerdict } from './innovation/returns';
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

const RETURN_STATUS: Record<ReturnVerdict, { label: string; chip: string }> = {
  strong: { label: 'Paying off', chip: 'text-success bg-success/15' },
  working: { label: 'Working', chip: 'text-success bg-success/15' },
  flat: { label: 'Flat', chip: 'text-[var(--warning)] bg-[var(--accent-soft)]' },
  declining: { label: 'Going back', chip: 'text-danger bg-danger/15' },
  unknown: { label: 'Too early', chip: 'text-ink-subtle bg-elevated' },
};

/** One lift's return on the sets invested in it. */
function ReturnRow({ r, unit }: { r: LiftReturn; unit: string }) {
  const judged = r.verdict !== 'unknown';
  const stuck = r.verdict === 'flat' || r.verdict === 'declining';
  return (
    <div className="space-y-1">
      {/* The name gets the full row and is allowed to wrap. Sharing the line
          with the numbers truncated it to "High-Bar Back S…", and which lift
          it is happens to be the one thing you cannot infer. */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-ink leading-snug">{r.name}</span>
        <span className={cn('chip !px-1.5 !py-0.5 text-[10px] font-semibold border-0 shrink-0 mt-0.5', RETURN_STATUS[r.verdict].chip)}>
          {RETURN_STATUS[r.verdict].label}
        </span>
      </div>
      {judged ? (
        <>
          <p className="text-[11px] text-ink-subtle">
            <span className="text-ink font-medium tabular-nums">
              {r.perTenSets > 0 ? '+' : ''}{r.perTenSets}{unit} per 10 sets
            </span>
            {' · '}{r.sets} sets in · {r.from}→{r.to}{unit} e1RM over {r.spanDays} days
          </p>
          {/* Effort and load are checked BEFORE the exercise is blamed. The
              evidence says how hard you push and how much you do matter more
              than which movement you picked — and swapping a lift you train
              too easily just gets you a new lift you train too easily. */}
          {stuck && r.diagnosis && (
            <p className="text-[11px] text-ink-subtle">
              {r.diagnosis.cause === 'effort' ? (
                <>
                  Your sets averaged <span className="text-ink">RPE {r.diagnosis.meanRpe}</span> against a
                  target of {r.diagnosis.targetRpe} — about{' '}
                  {Math.round(10 - (r.diagnosis.meanRpe ?? 0))} reps from failure.{' '}
                  <span className="text-ink">Push closer before changing anything.</span>
                </>
              ) : r.diagnosis.cause === 'load-dropping' ? (
                <>
                  The weight has come down {Math.abs(r.diagnosis.loadChange)}{unit} over {r.spanDays} days.
                  If that wasn't deliberate,{' '}
                  <span className="text-ink">that is the decline, not the exercise.</span>
                </>
              ) : r.diagnosis.cause === 'load-static' ? (
                <>
                  The weight hasn't moved in {r.spanDays} days.{' '}
                  <span className="text-ink">Try adding load or reps</span> before blaming the exercise.
                </>
              ) : r.diagnosis.cause === 'volume' ? (
                <>
                  Only {r.diagnosis.setsPerSession} set{r.diagnosis.setsPerSession === 1 ? '' : 's'} a session —
                  there may not be enough work here to grow from.
                </>
              ) : r.substitutions.length > 0 ? (
                <>
                  Effort and load were both there, so the movement itself is the best guess left. The sheet
                  offers{' '}
                  {r.substitutions.map((sub, i) => (
                    <span key={sub}>
                      {i > 0 && ' or '}
                      <span className="text-ink">{sub}</span>
                    </span>
                  ))}
                  .
                </>
              ) : (
                <>Effort and load were both there — this movement may just not suit you.</>
              )}
            </p>
          )}
        </>
      ) : (
        <p className="text-[11px] text-ink-subtle">
          {r.typicalError > 0 ? (
            <>
              Your sessions on this scatter by ±{r.typicalError}{unit}, which is wider than a gain worth
              finding — nothing could be read either way yet.
            </>
          ) : (
            <>
              {r.sessions} session{r.sessions === 1 ? '' : 's'} logged — needs 4 across 2 weeks before this
              can say anything.
            </>
          )}
        </p>
      )}
    </div>
  );
}

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
      {/* A zero MEV (an optional muscle) has no tick — it would sit on the left
          edge of the bar and mark nothing. */}
      {([['MEV', m.landmark.mev], ['MAV', m.landmark.mav], ['MRV', m.landmark.mrv]] as const)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => (
          <div key={k} className="absolute inset-y-0 w-px bg-ink/40" style={{ left: pct(v) }} title={`${k} ${v}`} />
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
          {/* The rate is what the landmarks are measured in; the raw tally is
              kept beside it so the number is never a black box. */}
          <span className="text-xs text-ink-subtle tabular-nums">
            {m.sets} sets/wk
            {m.rawSets !== m.sets && <span className="opacity-60"> · {m.rawSets} logged</span>}
          </span>
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

  // Volume per PROGRAM week (microcycle): a "week" of the async 8-day cycle can
  // span ~9-10 calendar days — its volume concludes when its sessions do, and
  // the next program week starts from zero.
  const volume = useMemo(() => volumeByProgramWeek(sessions), [sessions]);
  const volPoints: ChartPoint[] = volume.map((v) => ({ date: v.start, value: v.volume }));
  const latestWeek = volume[volume.length - 1];
  const latestAdherence = useMemo(
    () => (latestWeek?.weekId ? weekAdherence(program, sessions, latestWeek.weekId) : null),
    [latestWeek, program, sessions],
  );
  // Latest bucket is "in progress" while its program week still has undone days.
  const latestInProgress = useMemo(() => {
    if (!latestWeek) return false;
    if (latestAdherence) return latestAdherence.total > 0 && latestAdherence.done < latestAdherence.total;
    return new Date(latestWeek.start).getTime() > mountedAt - 7 * 86_400_000;
  }, [latestWeek, latestAdherence, mountedAt]);

  // A program week's point only reaches its real height once every day in it is
  // logged. Plotted plain, the first session of a new week looks like volume
  // collapsed — it drops from a finished week's total to one day's. So the
  // partial is drawn dashed, and where it lands at the current pace is shown
  // beside it, which is the figure that compares with the weeks before it.
  const volProjection = useMemo(() => {
    if (!latestInProgress || !latestWeek || !latestAdherence || latestAdherence.done < 1) return undefined;
    const { done, total } = latestAdherence;
    if (total <= done) return undefined;
    const value = Math.round((latestWeek.volume / done) * total);
    return { value, label: `day ${done} of ${total} · on pace for ${formatVolume(value, unit)}` };
  }, [latestInProgress, latestWeek, latestAdherence, unit]);

  // ---- "Volume IQ" — hard sets per muscle vs scientific landmarks ----
  const vol = useMemo(() => analyzeVolume(sessions), [sessions]);

  // ---- Block report — the ten weeks added up ----
  const block = useMemo(() => blockReport(sessions, program), [sessions, program]);

  // ---- Return on volume — which lifts are earning their sets ----
  const returns = useMemo(() => liftReturns(sessions, program), [sessions, program]);
  const judged = returns.filter((r) => r.verdict !== 'unknown');
  const stuck = useMemo(() => deadWeight(judged), [judged]);

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
                Hard sets per muscle for <span className="text-ink">{vol.windowLabel}</span> vs your science-based landmarks — ticks mark MEV (start growing), MAV (sweet spot) and MRV (recovery ceiling). Counted per program week, so a new week starts the tally fresh.
                {vol.windowDays !== 7 && (
                  <>
                    {' '}Your microcycle runs <span className="text-ink">{vol.windowDays} days</span>, so sets are
                    shown as a weekly rate — the landmarks are per 7 days, and comparing a longer
                    cycle against them straight would read high.
                  </>
                )}
              </p>
            </div>

            <div className="space-y-3.5">
              {vol.trained.map((m) => (
                <VolumeRow key={m.muscle} m={m} />
              ))}
            </div>

            {vol.neglected.length > 0 && (
              <div className="pt-1">
                {/* Was hardcoded to "last 7 days" even in microcycle mode,
                    where the window above is a program week of 10-11 days. */}
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle mb-1.5">Not trained ({vol.windowLabel})</p>
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

      {/* Return on volume — which lifts are earning the sets you spend on them */}
      {judged.length > 0 && (
        <motion.section
          initial={rm ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.21, 1, 0.4, 1] }}
          className="space-y-3"
        >
          <h2 className="section-label flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" /> What's paying off
          </h2>
          <div className="neo-card p-5 space-y-4">
            <div>
              <p className="text-sm text-ink font-medium">
                {stuck.length === 0
                  ? `All ${judged.length} of your tracked lifts are moving.`
                  : `${stuck.length} lift${stuck.length === 1 ? '' : 's'} ${stuck.length === 1 ? 'has' : 'have'} returned nothing for ${stuck.reduce((n, r) => n + r.sets, 0)} sets.`}
              </p>
              <p className="text-[11px] text-ink-subtle mt-1">
                Estimated 1RM gained per set invested, over the last 90 days. Your set budget is
                finite — this is what each lift bought with its share. A lift needs 4 sessions
                across 2 weeks before it gets a verdict, and rough days are left out.
              </p>
            </div>

            <div className="space-y-3.5">
              {judged.map((r) => (
                <ReturnRow key={r.name} r={r} unit={unit} />
              ))}
            </div>

            {returns.length > judged.length && (
              <p className="text-[11px] text-ink-subtle border-t border-border pt-2">
                {returns.length - judged.length} more lift
                {returns.length - judged.length === 1 ? '' : 's'} logged too recently to judge.
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

      {/* Block report — what the whole program actually bought. A block ends
          and nothing happens: you close the app on the last session of week 10
          exactly as you closed it on the first of week 1. Every number here was
          already in the log, just never added up. */}
      {block.hasData && block.sessions >= 3 && (
        <motion.section
          initial={rm ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.21, 1, 0.4, 1] }}
          className="space-y-3"
        >
          <h2 className="section-label flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> {block.complete ? 'Block complete' : 'Block so far'}
          </h2>
          <div
            className={cn('neo-card p-5 space-y-4', block.complete && 'border-ember')}
            style={block.complete ? { boxShadow: '0 0 0 1px var(--ember), 0 8px 30px -12px var(--ember)' } : undefined}
          >
            <div>
              <p className="font-display text-2xl font-bold text-ink leading-tight">
                {block.complete ? `${block.programName} — done.` : block.programName}
              </p>
              <p className="text-sm text-ink mt-1">
                <span className="font-medium">{block.weeks.length}</span> week
                {block.weeks.length === 1 ? '' : 's'} ·{' '}
                <span className="font-medium">{block.sessions}</span> session
                {block.sessions === 1 ? '' : 's'} ·{' '}
                <span className="font-medium">{formatVolume(block.tonnage, unit)}</span> moved
              </p>
              <p className="text-[11px] text-ink-subtle mt-1">
                {block.spanDays} days · {block.sets} sets across {block.lifts} lifts ·{' '}
                {block.daysDone} of {block.daysPlanned} prescribed days ({block.adherencePct}%)
              </p>
            </div>

            {/* Per-week tonnage, so the shape of the block is visible at a glance */}
            {block.weeks.length > 1 && (
              <div className="space-y-1.5">
                {block.weeks.map((w) => {
                  const peak = Math.max(...block.weeks.map((x) => x.tonnage), 1);
                  return (
                    <div key={w.id} className="flex items-center gap-2">
                      <span className="text-[11px] text-ink-subtle w-24 shrink-0 truncate">{w.name}</span>
                      <div className="flex-1 h-2 rounded-full bg-elevated overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: 'var(--ember)' }}
                          initial={rm ? { width: `${(w.tonnage / peak) * 100}%` } : { width: 0 }}
                          animate={{ width: `${(w.tonnage / peak) * 100}%` }}
                          transition={{ duration: 0.6, ease: [0.21, 1, 0.4, 1] }}
                        />
                      </div>
                      <span className="text-[11px] text-ink-subtle tabular-nums w-20 text-right shrink-0">
                        {formatVolume(w.tonnage, unit)}
                        {w.done < w.planned && <span className="opacity-60"> · {w.done}/{w.planned}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 pt-1">
              {block.bestLift && (
                <div className="rounded-xl bg-elevated border border-border p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">Biggest gain</p>
                  <p className="text-sm text-ink font-medium mt-0.5">{block.bestLift.name}</p>
                  <p className="text-[11px] text-ink-subtle mt-0.5">
                    <span className="text-ember font-medium">
                      +{block.bestLift.gain}{unit}
                    </span>{' '}
                    estimated 1RM over {block.bestLift.spanDays} days, on {block.bestLift.sets} sets
                  </p>
                </div>
              )}

              {block.stalledLift && (
                <div className="rounded-xl bg-elevated border border-border p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">Bought the least</p>
                  <p className="text-sm text-ink font-medium mt-0.5">{block.stalledLift.name}</p>
                  <p className="text-[11px] text-ink-subtle mt-0.5">
                    {block.stalledLift.sets} sets, no movement it could measure.
                    {block.wastedSets > block.stalledLift.sets && (
                      <> {block.wastedSets} sets across every stalled lift.</>
                    )}
                  </p>
                </div>
              )}

              {block.prs.length > 0 && (
                <div className="rounded-xl bg-elevated border border-border p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                    {block.prs.length} personal best{block.prs.length === 1 ? '' : 's'}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {block.prs.map((pr, i) => (
                      <span key={i} className="chip text-ember border-ember bg-ember-soft !text-[11px]">
                        <Trophy className="w-3 h-3" /> {pr.lift} {pr.value}
                        {pr.kind === 'weight' ? unit : ' e1RM'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <p className="text-[11px] text-ink-subtle border-t border-border pt-2">
              {block.complete
                ? 'Every prescribed day logged. Everything here is read from your own sessions — nothing is estimated on your behalf.'
                : 'Updates as you log. "Biggest gain" and "bought the least" stay empty until there is enough to say either honestly.'}
            </p>
          </div>
        </motion.section>
      )}

      {/* Weekly training volume — overall progress, not per-exercise */}
      <section className="space-y-3">
        <h2 className="section-label flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" /> Volume by program week
        </h2>
        {volume.length === 0 ? (
          <p className="text-sm text-ink-subtle">Log some workouts and your total weekly training volume shows up here.</p>
        ) : (
          <div className="card p-4 space-y-2">
            <Chart
              points={volPoints}
              unit=""
              accent="var(--ember)"
              format={(v) => formatVolume(v, unit)}
              provisionalLast={latestInProgress}
              projection={volProjection}
            />
            <p className="text-[11px] text-ink-subtle">
              Total load = weight × reps across <span className="text-ink">all</span> lifts, tallied per <span className="text-ink">program week</span> (a week ends when all its sessions are done — even past 7 calendar days; in {unit}).
              {latestWeek && (
                <>
                  {' '}{latestWeek.label || 'Latest week'}: <span className="text-ink font-medium">{formatVolume(latestWeek.volume, unit)}</span> over {latestWeek.sets} sets
                  {latestInProgress
                    ? latestAdherence
                      ? ` so far — ${latestAdherence.done} of ${latestAdherence.total} days done, so this point is still climbing.`
                      : ' · still in progress.'
                    : '.'}
                </>
              )}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
