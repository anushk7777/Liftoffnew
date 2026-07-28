// The in-app half of the morning CO2 nudge.
//
// An OS notification only arrives if permission was granted, and on iOS only
// when the app is installed to the home screen. This banner needs neither, so
// the reminder is never silently absent — it just appears the next time you
// look at the app inside the window.
import { useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Wind, X } from 'lucide-react';
import { useAppMode } from './mode';
import { subscribeCo2Nudge, getCo2Nudge, clearCo2Nudge } from './co2Reminder';
import { requestCo2DeepLink } from './deepLink';
import { useReducedMotion } from '../lib/motion';

export default function Co2Banner() {
  // Read from a store rather than listening for an event. The reminder runs its
  // first check inside the effect that starts its interval, which on a cold load
  // can happen BEFORE this component has mounted — measured in a real browser:
  // the nudge fired, the slot was marked used, and the banner never appeared.
  const nudge = useSyncExternalStore(subscribeCo2Nudge, getCo2Nudge, getCo2Nudge);
  const rm = useReducedMotion();
  const setAppMode = useAppMode((s) => s.setMode);

  return (
    <AnimatePresence>
      {nudge && (
        <motion.div
          initial={rm ? false : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={rm ? undefined : { opacity: 0, y: -16 }}
          transition={{ duration: 0.28, ease: [0.21, 1, 0.4, 1] }}
          className="fixed inset-x-3 z-[70] top-[calc(env(safe-area-inset-top)+0.75rem)] rounded-2xl border border-border bg-surface shadow-lg"
          role="status"
        >
          <div className="flex items-start gap-3 p-3.5">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--ember-soft)' }}
            >
              <Wind className="w-5 h-5 text-ember" />
            </span>
            <button
              onClick={() => {
                clearCo2Nudge();
                // Straight to the test — a reminder you have to go hunting for
                // is a reminder you dismiss. Switching workspace is a no-op when
                // you are already in Afterburn.
                //
                // Latch the intent as well as dispatching it: from Focus the
                // Afterburn tree is lazy and has no listener yet, so the event
                // alone was lost and the tap landed on Programs.
                requestCo2DeepLink();
                setAppMode('afterburn');
                window.dispatchEvent(new Event('afterburn:open-co2'));
              }}
              className="flex-1 min-w-0 text-left"
            >
              <p className="text-sm font-semibold text-ink leading-snug">{nudge.title}</p>
              <p className="text-xs text-ink-muted mt-0.5 leading-snug">{nudge.body}</p>
              <span className="inline-block text-xs font-semibold mt-1.5 text-ember">Take it now →</span>
            </button>
            <button
              onClick={clearCo2Nudge}
              aria-label="Dismiss"
              className="tap-44 p-1 -m-1 text-ink-muted hover:text-ink shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
