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

/** The reasoning, one tap away. Same pattern the Progress tab uses, so the
 *  gesture is already learned by the time anyone reaches this. */
function Why({ children }: { children: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 min-h-[40px] -my-1.5 text-[11px] font-medium text-ink-muted hover:text-ink transition-colors"
      >
        <ChevronRight className={cn('w-3 h-3 transition-transform', open && 'rotate-90')} />
        Why
      </button>
      {open && <p className="text-xs text-ink-muted leading-relaxed mt-1">{children}</p>}
    </>
  );
}

function Cue({ cue, index }: { cue: RecallCue; index: number }) {
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
        <Why>{cue.basis}</Why>
      </div>
    </li>
  );
}

export default function CodeRecall({ day }: { day: ProgramDay | null | undefined }) {
  const sessions = useAfterburn((s) => s.sessions);
  const program = useAfterburn((s) => s.program);
  const recovery = useAfterburn((s) => s.recovery);
  const noteRecallDays = useAfterburn((s) => s.noteRecallDays);
  const rm = useReducedMotion();

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
        {brief.dayName && (
          <span className="text-[11px] font-medium text-ink-subtle truncate">{brief.dayName}</span>
        )}
      </div>

      {brief.cues.length > 0 && (
        <ol className="space-y-3.5">
          {brief.cues.map((c, i) => (
            <Cue key={c.id} cue={c} index={i} />
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

      {/* Said plainly rather than dressed up: with no history behind it, the
          cues above are the sheet's own instructions, not analysis. */}
      {brief.depth === 'none' && (
        <p className="text-[11px] text-ink-subtle leading-relaxed mt-3">
          Nothing logged yet, so this is reading your program rather than your training. It gets
          sharper with every session you record.
        </p>
      )}
    </motion.section>
  );
}
