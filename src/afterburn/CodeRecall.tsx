// The Code Recall card — the brief, in the ten seconds before you start.
//
// Deliberately shaped as an instruction list rather than a dashboard. Everything
// else in Afterburn is retrospective and can afford charts; this is read
// standing up, once, and then acted on. So each cue leads with what to DO, backs
// it with the lifter's own numbers underneath, and hides the reasoning behind a
// tap — present for anyone who wants to argue with it, out of the way of anyone
// who does not.
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Sparkles, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { useReducedMotion, springSoft } from '../lib/motion';
import { useAfterburn } from './store';
import { codeRecall } from './innovation/codeRecall';
import type { RecallCue } from './innovation/codeRecall';
import type { ProgramDay } from './types';

/**
 * The two taps that make a backtest possible later.
 *
 * Every other engine in Afterburn was calibrated against ground truth. This one
 * has none: nothing recorded whether a pre-session instruction was followed, so
 * there is nothing to check the nine rules against and no way to reconstruct it
 * after the fact. Answering a cue costs one tap and is the only way that dataset
 * ever comes into existence.
 *
 * Kept as text chips at the same weight as "Why" — this is a card read in ten
 * seconds, and a pair of buttons per cue must not out-shout the instruction.
 */
function Verdict({ cue, dayId }: { cue: RecallCue; dayId: string | null }) {
  const answered = useAfterburn((s) => s.cueOutcomes.find((o) => o.cueId === cue.id && o.dayId === dayId));
  const record = useAfterburn((s) => s.recordCueOutcome);
  if (!dayId) return null;

  const chip = (verdict: 'did' | 'skipped', label: string) => (
    <button
      type="button"
      onClick={() => record({ cueId: cue.id, kind: cue.kind, dayId, verdict })}
      aria-pressed={answered?.verdict === verdict}
      className={cn(
        'min-h-[40px] -my-1.5 px-2 rounded-md text-[11px] font-medium transition-colors',
        answered?.verdict === verdict
          ? 'bg-ember/15 text-ember'
          : 'text-ink-muted hover:text-ink',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-1">
      {chip('did', 'Did this')}
      {chip('skipped', 'Not useful')}
    </div>
  );
}

function Cue({ cue, index, dayId }: { cue: RecallCue; index: number; dayId: string | null }) {
  // The disclosure state lives here rather than in a `Why` component so the
  // expanded reasoning can sit BELOW the control row instead of becoming a flex
  // sibling of the verdict chips.
  const [why, setWhy] = useState(false);
  return (
    <li className="flex gap-3">
      <span
        className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-ember/15 text-ember text-[11px] font-bold flex items-center justify-center"
        aria-hidden
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink leading-snug">{cue.headline}</p>
        <p className="text-xs text-ink-muted leading-relaxed mt-1">{cue.evidence}</p>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setWhy((v) => !v)}
            aria-expanded={why}
            className="flex items-center gap-1 min-h-[40px] -my-1.5 text-[11px] font-medium text-ink-muted hover:text-ink transition-colors"
          >
            <ChevronRight className={cn('w-3 h-3 transition-transform', why && 'rotate-90')} />
            Why
          </button>
          <Verdict cue={cue} dayId={dayId} />
        </div>
        {why && <p className="text-xs text-ink-muted leading-relaxed mt-1">{cue.basis}</p>}
      </div>
    </li>
  );
}

/**
 * `compact` is for inside the logger.
 *
 * The brief used to be replaced by the logger the moment you tapped Start —
 * you read "open Incline DB Press lighter", started the workout, and the
 * instruction was gone from the screen at exactly the point you were choosing
 * the weight. Minimising the draft brought it back, which nobody was ever going
 * to discover.
 *
 * So the logger carries a one-line version: the top cue, tappable to open the
 * whole brief. Collapsed by default, because the logger's job is the set in
 * front of you and a three-cue card at the top would push it down the screen.
 */
export default function CodeRecall({
  day,
  compact = false,
}: {
  day: ProgramDay | null | undefined;
  compact?: boolean;
}) {
  const sessions = useAfterburn((s) => s.sessions);
  const program = useAfterburn((s) => s.program);
  const recovery = useAfterburn((s) => s.recovery);
  const noteRecallDays = useAfterburn((s) => s.noteRecallDays);
  const rm = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  // Re-derived only when the inputs change. The engine runs several trend fits,
  // and this sits on a screen that re-renders on every week/day interaction.
  const brief = useMemo(
    () =>
      codeRecall({
        day,
        sessions,
        program,
        recovery,
        unit: program?.unit ?? 'kg',
        noteRecallDays,
      }),
    [day, sessions, program, recovery, noteRecallDays],
  );

  // Nothing true to say — so nothing is said. An empty brief is a better
  // outcome than a padded one, and the card simply is not there.
  if (!brief.cues.length && !brief.spark) return null;

  // In the logger, start collapsed to a single line. The spark is deliberately
  // left out of the collapsed state: mid-workout the instructions are what
  // matter, and there is nothing to be motivated into — you are already here.
  if (compact && !expanded) {
    if (!brief.cues.length) return null;
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        className="w-full flex items-center gap-2.5 rounded-xl border border-border bg-elevated px-3 py-2.5 min-h-[44px] text-left hover:border-ember/40 transition-colors"
      >
        <Zap className="w-4 h-4 text-ember shrink-0" aria-hidden />
        <span className="flex-1 min-w-0 text-xs font-medium text-ink truncate">{brief.cues[0].headline}</span>
        {brief.cues.length > 1 && (
          <span className="text-[11px] font-semibold text-ink-subtle shrink-0">+{brief.cues.length - 1}</span>
        )}
        <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" aria-hidden />
      </button>
    );
  }

  return (
    <motion.section
      initial={rm ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSoft}
      className="card p-4"
      aria-labelledby="code-recall-heading"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 id="code-recall-heading" className="section-label flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-ember" />
          Code Recall
        </h2>
        {compact ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-[11px] font-semibold text-ink-muted hover:text-ink min-h-[40px] -my-2 px-1"
          >
            Hide
          </button>
        ) : (
          brief.dayName && (
            <span className="text-[11px] font-medium text-ink-subtle truncate">{brief.dayName}</span>
          )
        )}
      </div>

      {brief.cues.length > 0 && (
        <ol className="space-y-3.5">
          {brief.cues.map((c, i) => (
            <Cue key={c.id} cue={c} index={i} dayId={day?.id ?? null} />
          ))}
        </ol>
      )}

      {brief.spark && (
        <div className={cn('flex gap-2.5 items-start', brief.cues.length > 0 && 'mt-4 pt-3.5 border-t border-border')}>
          <Sparkles className="w-4 h-4 text-ember shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink leading-snug">{brief.spark.headline}</p>
            <p className="text-xs text-ink-muted leading-relaxed mt-0.5">{brief.spark.detail}</p>
          </div>
        </div>
      )}

      {/* Said plainly rather than dressed up. With no history the cues above are
          the sheet's own instructions, not analysis — and with a handful of
          sessions they are real but thin, which the wording alone would not
          convey. `depth` was computed from the start and only the first case was
          ever surfaced. */}
      {brief.depth === 'none' && (
        <p className="text-[11px] text-ink-subtle leading-relaxed mt-3">
          Nothing logged yet, so this is reading your program rather than your training. It gets
          sharper with every session you record.
        </p>
      )}
      {brief.depth === 'thin' && brief.cues.length > 0 && (
        <p className="text-[11px] text-ink-subtle leading-relaxed mt-3">
          Built on only a few logged sessions — treat these as a starting point rather than a
          verdict.
        </p>
      )}
    </motion.section>
  );
}
