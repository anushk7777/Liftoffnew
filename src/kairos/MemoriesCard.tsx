import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';
import { pop, springSoft, useReducedMotion } from '../lib/motion';
import { useAppMode } from '../afterburn/mode';
import { useKairos } from './store';
import { onThisDay, yearsAgoLabel, excerpt, moodMeta } from './moments';
import { usePhotoUrl } from './usePhotoUrl';
import type { Moment } from './types';

function Thumb({ moment }: { moment: Moment }) {
  const url = usePhotoUrl(moment.photo);
  if (!moment.photo) return null;
  return (
    <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-elevated">
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full animate-pulse" />}
    </div>
  );
}

/** "On this day" memories, surfaced on the main Liftoff home — a beautiful box
 *  that returns moments you wrote on this date in earlier years. Hidden when
 *  there are none. Tapping it opens Kairos on its On-This-Day feed.
 *  Add `?memdemo=1` to the URL to preview the box today with your latest moment. */
export default function MemoriesCard() {
  const rm = useReducedMotion();
  const moments = useKairos((s) => s.moments);
  const loadMoments = useKairos((s) => s.loadMoments);
  const setMode = useAppMode((s) => s.setMode);
  const [demo] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('memdemo') === '1';
    } catch {
      return false;
    }
  });

  // Ensure cloud moments are pulled even if the user hasn't opened Kairos on
  // this device yet (recency-guarded + cheap in the store).
  useEffect(() => {
    loadMoments();
  }, [loadMoments]);

  const real = useMemo(() => onThisDay(moments), [moments]);
  const memories = real.length ? real : demo && moments.length ? [{ moment: moments[0], yearsAgo: 1 }] : [];
  if (!memories.length) return null;

  const lead = memories[0];
  const mood = moodMeta(lead.moment.mood);

  const open = () => {
    try {
      sessionStorage.setItem('kairos_tab', 'onthisday');
    } catch {
      /* ignore */
    }
    setMode('kairos');
  };

  return (
    <motion.button
      onClick={open}
      initial={rm ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSoft}
      whileTap={rm ? undefined : { scale: 0.99 }}
      className="group relative w-full text-left rounded-2xl overflow-hidden border p-4 sm:p-5"
      style={{ borderColor: 'color-mix(in srgb, var(--kairos) 35%, transparent)' }}
    >
      {/* dreamy dusk wash */}
      <div className="absolute inset-0 kairos-aura opacity-70 pointer-events-none" />
      <div className="relative flex items-center gap-4">
        <Thumb moment={lead.moment} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: 'var(--kairos)' }} />
            <span className="font-dream text-dream text-lg leading-none">On this day</span>
            {demo && !real.length && (
              <span className="text-[11px] uppercase tracking-wide text-ink-subtle border border-border rounded px-1.5 py-0.5">preview</span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink truncate">
            <span className="font-semibold" style={{ color: 'var(--kairos)' }}>{yearsAgoLabel(lead.yearsAgo)}</span>
            {lead.moment.text ? <span className="text-ink-muted"> — {excerpt(lead.moment.text, 70)}</span> : mood ? <span className="text-ink-muted"> — felt {mood.label.toLowerCase()} {mood.emoji}</span> : null}
          </p>
          {memories.length > 1 && (
            <p className="text-xs text-ink-subtle mt-0.5">and {memories.length - 1} more memory{memories.length - 1 === 1 ? '' : ' moments'} from today</p>
          )}
        </div>
        <motion.span whileHover={rm ? undefined : { x: 3 }} transition={pop} className="shrink-0 text-ink-muted group-hover:text-ink">
          <ArrowRight className="w-5 h-5" />
        </motion.span>
      </div>
    </motion.button>
  );
}
