import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Check } from 'lucide-react';
import { pop, useReducedMotion } from '../lib/motion';
import { useAfterburn } from './store';
import type { PRHit } from './store';
import { beep } from '../lib/sound';
import { haptics } from '../lib/haptics';

// Brief, friendly post-workout overlay. Shows when a finished session set PRs
// (or just confirms the log). Auto-dismisses; tap anywhere to close early.
// Colors come entirely from the theme tokens — no new palette.
export default function WorkoutCelebration({ prs, onDone, endedEarly }: { prs: PRHit[] | null; onDone: () => void; endedEarly?: boolean }) {
  const rm = useReducedMotion();
  const unit = useAfterburn((s) => s.program.unit);
  const open = prs !== null;

  useEffect(() => {
    if (!open) return;
    haptics.success();
    beep(780);
    const t = setTimeout(onDone, prs && prs.length ? 3200 : 2000);
    return () => clearTimeout(t);
  }, [open, prs, onDone]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}
          initial={rm ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={rm ? undefined : { opacity: 0 }}
          onClick={onDone}
        >
          <motion.div
            className="card p-6 text-center max-w-xs w-full"
            style={{ background: 'var(--card-grad-strong)' }}
            initial={rm ? false : { scale: 0.85, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={rm ? undefined : { scale: 0.96, opacity: 0 }}
            transition={pop}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
              style={{ background: prs && prs.length ? 'var(--accent-soft)' : 'color-mix(in srgb, var(--success) 18%, transparent)' }}
              animate={rm ? undefined : { scale: [1, 1.12, 1] }}
              transition={rm ? undefined : { duration: 0.8, repeat: 1, ease: 'easeInOut' }}
            >
              {prs && prs.length ? (
                <Trophy className="w-8 h-8 text-[var(--accent)]" />
              ) : (
                <Check className="w-8 h-8 text-[var(--success)]" />
              )}
            </motion.div>

            <h2 className="font-display text-2xl font-bold text-ink mt-4">
              {prs && prs.length ? 'New personal record!' : endedEarly ? 'Session logged' : 'Workout logged 💪'}
            </h2>

            {prs && prs.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                {prs.slice(0, 4).map((pr, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm rounded-lg bg-elevated border border-border px-3 py-1.5">
                    <span className="text-ink truncate">{pr.lift}</span>
                    <span className="font-semibold text-[var(--accent)] shrink-0">
                      {pr.kind === 'weight' ? `${pr.value} ${unit}` : `${pr.value} e1RM`}
                      <span className="text-ink-subtle font-normal"> · was {pr.prev}</span>
                    </span>
                  </div>
                ))}
                {prs.length > 4 && <p className="text-xs text-ink-subtle">+{prs.length - 4} more</p>}
              </div>
            ) : (
              <p className="text-sm text-ink-subtle mt-2">{endedEarly ? "Logged what you did — backing off when you're not recovered is smart training." : "Nice work — it's in your history and your trends."}</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
