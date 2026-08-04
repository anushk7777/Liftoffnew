// THE ENGINE'S OWN TRACK RECORD.
//
// Every other panel in Afterburn tells you about your training. This one tells
// you about the app, and it is the only one that can be wrong in a way you can
// check. That asymmetry is the point: a suggestion with a published hit rate is
// a different object from a suggestion without one, and the difference is
// whether you are entitled to ignore it.
//
// Three things, in the order they matter:
//
//   1. **How close it has been.** One number, in reps.
//   2. **Which rung was closest.** Its own curve against a population rule of
//      thumb — so "personal" has to earn the word rather than assume it.
//   3. **What it changed about itself, and what it left alone.** Mostly the
//      latter, which is the part that makes the former believable.
//
// Renders nothing at all until there is something graded. An empty accuracy
// panel is worse than no panel: it implies a measurement that has not happened.
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Gauge } from 'lucide-react';
import { cn } from '../lib/utils';
import { useReducedMotion } from '../lib/motion';
import { useAfterburn } from './store';
import { gradeAll, accuracy, trend, accuracyByBasis, MIN_TREND_SETS } from './innovation/grade';
import { calibrateAll, evolutionSummary } from './innovation/calibrate';
import type { CalibrationEvent } from './innovation/calibrate';

/** Plain names for the rungs of the prescription ladder. The code's word for
 *  each one is a label, not an explanation. */
const BASIS_LABEL: Record<string, string> = {
  personal: 'Your own curve',
  rule: '3%-per-RPE rule',
  repeat: 'Repeat last weight',
  sheet: 'The sheet alone',
  none: 'Nothing to go on',
};

const TONE: Record<string, { color: string; label: string }> = {
  improving: { color: 'var(--success)', label: 'getting closer' },
  worsening: { color: 'var(--danger)', label: 'drifting wider' },
  steady: { color: 'var(--ink-muted)', label: 'holding steady' },
  unknown: { color: 'var(--ink-muted)', label: '' },
};

function Chip({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="text-[11px] font-semibold px-1.5 py-0.5 rounded shrink-0"
      style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}
    >
      {children}
    </span>
  );
}

/** One self-change, with the numbers that justified it. */
function EventRow({ e }: { e: CalibrationEvent }) {
  const [open, setOpen] = useState(false);
  const adopted = e.outcome === 'adopted';
  const pct = Math.round((e.to - 1) * 1000) / 10;
  return (
    <li className="border-t border-border pt-2 first:border-0 first:pt-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-left min-h-[40px]"
      >
        <ChevronRight className={cn('w-3 h-3 shrink-0 text-ink-muted transition-transform', open && 'rotate-90')} />
        <span className="flex-1 min-w-0 text-xs font-medium text-ink truncate">{e.exercise}</span>
        {adopted ? (
          // Deliberately not red-for-down / green-for-up. A correction has no
          // good or bad direction — it is the engine moving towards the truth,
          // and colouring half of those as an alarm would misread them.
          <Chip color="var(--ember)">
            {pct > 0 ? '+' : ''}
            {pct}%
          </Chip>
        ) : (
          <Chip color="var(--ink-muted)">held back</Chip>
        )}
      </button>
      {open && (
        <div className="pl-5 pb-1">
          <p className="text-xs text-ink-muted leading-relaxed">{e.note}</p>
          {/* The held-out numbers, said out loud. The claim "this helped" is
              only worth anything with the sets it was tested on beside it. */}
          <p className="text-[11px] text-ink-subtle mt-1 tabular-nums">
            Tested on {e.holdout} sets it was not fitted to · {e.errorBefore} → {e.errorAfter} RPE · needed to beat{' '}
            {e.threshold}
          </p>
        </div>
      )}
    </li>
  );
}

export default function SelfCheck() {
  const sessions = useAfterburn((s) => s.sessions);
  const rm = useReducedMotion();
  const [showAll, setShowAll] = useState(false);

  const data = useMemo(() => {
    const graded = gradeAll(sessions);
    const { corrections, events } = calibrateAll(graded);
    return {
      graded,
      acc: accuracy(graded),
      tr: trend(graded),
      byBasis: accuracyByBasis(graded),
      events,
      evo: evolutionSummary(events, corrections),
    };
  }, [sessions]);

  const { acc, tr, byBasis, events, evo } = data;

  // Nothing has been prescribed AND lifted yet, so there is nothing to report.
  if (!acc.n) return null;

  const tone = TONE[tr.direction];
  // Only the decisions worth a line. `rejected-too-few` is just "not enough
  // data yet" repeated once per lift, and printing it would bury the two
  // entries that mean something under a list of non-events.
  const notable = events.filter((e) => e.outcome === 'adopted' || e.outcome === 'rejected-clamped');
  const leftAlone = events.filter((e) => e.outcome === 'rejected-no-gain').length;
  const shown = showAll ? notable : notable.slice(0, 3);

  const bases = Object.entries(byBasis).sort((a, b) => b[1].n - a[1].n);

  return (
    <motion.section
      initial={rm ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.21, 1, 0.4, 1] }}
      className="space-y-3"
    >
      <h2 className="section-label flex items-center gap-1.5">
        <Gauge className="w-3.5 h-3.5" /> How good its numbers are
      </h2>

      <div className="card p-4">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-2xl font-display font-bold text-ink tabular-nums">
            {acc.medianMiss}
            <span className="text-sm font-semibold text-ink-muted"> off</span>
          </p>
          {tr.direction !== 'unknown' && tone.label && <Chip color={tone.color}>{tone.label}</Chip>}
        </div>
        <p className="text-xs text-ink-muted leading-relaxed mt-1">
          Typical gap between the weight it told you to use and what that weight turned out to be worth, across{' '}
          <span className="text-ink font-medium">{acc.n}</span> prescribed sets. One point is about one rep, so{' '}
          {acc.medianMiss <= 1 ? 'this is inside the noise of rating your own effort' : 'it is still guessing wider than a rep'}
          .
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-sm font-bold text-ink tabular-nums">{Math.round(acc.hitRate * 100)}%</p>
            <p className="text-[11px] text-ink-subtle leading-tight mt-0.5">landed within a rep</p>
          </div>
          {/* The magnitude on top and the direction underneath: "heavy 1" on one
              line begs the question "one what", and the caption is the natural
              place to answer it. */}
          <div>
            <p className="text-sm font-bold text-ink tabular-nums">
              {acc.bias === 0 ? 'even' : `${acc.bias > 0 ? '+' : '−'}${Math.abs(acc.bias)}`}
            </p>
            <p className="text-[11px] text-ink-subtle leading-tight mt-0.5">
              {acc.bias === 0 ? 'no lean either way' : acc.bias > 0 ? 'so it runs heavy' : 'so it runs light'}
            </p>
          </div>
          <div>
            <p className="text-sm font-bold text-ink tabular-nums">{Math.round(acc.followRate * 100)}%</p>
            <p className="text-[11px] text-ink-subtle leading-tight mt-0.5">of sets you used its number</p>
          </div>
        </div>

        {tr.direction !== 'unknown' && (
          <p className="text-[11px] text-ink-subtle leading-relaxed mt-2.5 tabular-nums">
            Last {tr.window} sets: {tr.recent} off, against {tr.previous} on the {tr.window} before them.
          </p>
        )}
        {tr.direction === 'unknown' && acc.n < MIN_TREND_SETS * 2 && (
          <p className="text-[11px] text-ink-subtle leading-relaxed mt-2.5">
            Needs {MIN_TREND_SETS * 2} graded sets before it will say whether it is getting better — below that,
            a "trend" is one session's mood.
          </p>
        )}
      </div>

      {/* WHICH RUNG IS ACTUALLY BEST. The honest version of "personalised". */}
      {bases.length > 1 && (
        <div className="card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle mb-2">
            Where the number came from
          </p>
          <ul className="space-y-1.5">
            {bases.map(([basis, a]) => (
              <li key={basis} className="flex items-center gap-2 text-xs">
                <span className="flex-1 min-w-0 truncate text-ink">{BASIS_LABEL[basis] ?? basis}</span>
                <span className="tabular-nums font-semibold text-ink">{a.medianMiss}</span>
                <span className="tabular-nums text-ink-subtle w-16 text-right">{a.n} sets</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-ink-subtle leading-relaxed mt-2">
            Lower is closer. This is how you find out whether your own curve is actually beating a rule of thumb,
            rather than assuming it must because it has your name on it.
          </p>
        </div>
      )}

      {/* WHAT IT CHANGED ABOUT ITSELF. */}
      <div className="card p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle mb-2">
          What it changed about itself
        </p>
        <p className="text-xs text-ink leading-relaxed">
          {evo.adopted === 0 ? (
            <>
              Checked {evo.decisions} {evo.decisions === 1 ? 'lift' : 'lifts'} and changed{' '}
              <span className="font-semibold">nothing</span>. A correction is only adopted when it beats doing
              nothing on sets it was never fitted to, and so far none has.
            </>
          ) : (
            <>
              Changed <span className="font-semibold">{evo.adopted}</span> of {evo.decisions} lifts
              {leftAlone > 0 && <> and left {leftAlone} alone after checking</>}. Each change had to beat doing
              nothing on sets it was never fitted to.
            </>
          )}
        </p>

        {shown.length > 0 && (
          <ul className="mt-3 space-y-2">
            {shown.map((e) => (
              <EventRow key={`${e.exercise}-${e.outcome}`} e={e} />
            ))}
          </ul>
        )}
        {notable.length > shown.length && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-2 text-[11px] font-semibold text-ink-muted hover:text-ink min-h-[40px] -mb-2"
          >
            Show {notable.length - shown.length} more
          </button>
        )}

        {/* The one claim this whole panel exists to support — and the moment it
            stops being true, it says so instead of going quiet. */}
        {evo.adopted > 0 && (
          <p className="text-[11px] leading-relaxed mt-2.5" style={{ color: evo.everyChangeHelped ? 'var(--success)' : 'var(--danger)' }}>
            {evo.everyChangeHelped
              ? `Every change it made measured better on held-out sets, by ${evo.medianGain} RPE on average.`
              : 'At least one adopted change did not measure better on held-out sets. Worth a look.'}
          </p>
        )}
      </div>
    </motion.section>
  );
}
