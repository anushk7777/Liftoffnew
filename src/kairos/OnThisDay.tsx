import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { stagger, useReducedMotion } from '../lib/motion';
import { useKairos } from './store';
import { onThisDay, yearsAgoLabel } from './moments';
import MomentCard from './MomentCard';
import { EmptyState } from '../components/ui';

export default function OnThisDay() {
  const rm = useReducedMotion();
  const moments = useKairos((s) => s.moments);
  const deleteMoment = useKairos((s) => s.deleteMoment);
  // Anchor to "now" once per render pass via a stable date (fine for a feed).
  const resurfaced = useMemo(() => onThisDay(moments), [moments]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-5">
        <h2 className="font-display text-2xl text-ink">On this day</h2>
        <p className="text-sm text-ink-muted mt-0.5">
          The same date in years past — resurfaced so you can meet your past self.
        </p>
      </div>

      {resurfaced.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="w-10 h-10" style={{ color: 'var(--kairos)' }} />}
          title="Nothing from this day — yet"
          hint="Keep capturing moments. A year from now, today comes back to you. On milestone anniversaries you'll get an email and a nudge, too."
        />
      ) : (
        <motion.div
          variants={rm ? undefined : stagger}
          initial={rm ? undefined : 'hidden'}
          animate={rm ? undefined : 'show'}
          className="space-y-4"
        >
          {resurfaced.map((r) => (
            <MomentCard key={r.moment.id} moment={r.moment} lead={yearsAgoLabel(r.yearsAgo)} onDelete={deleteMoment} />
          ))}
        </motion.div>
      )}
    </div>
  );
}
