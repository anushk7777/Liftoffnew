import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { stagger, useReducedMotion } from '../lib/motion';
import { useKairos } from './store';
import { byMonth } from './moments';
import MomentCard from './MomentCard';
import { EmptyState } from '../components/ui';

export default function Timeline() {
  const rm = useReducedMotion();
  const moments = useKairos((s) => s.moments);
  const updateMoment = useKairos((s) => s.updateMoment);
  const deleteMoment = useKairos((s) => s.deleteMoment);
  const buckets = useMemo(() => byMonth(moments), [moments]);

  if (moments.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <EmptyState
          icon={<BookOpen className="w-10 h-10" style={{ color: 'var(--kairos)' }} />}
          title="Your diary starts here"
          hint="Capture your first moment — a thought, a feeling, a photo of right now. It's private to you, and it comes back to you on its anniversaries."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-5">
        <h2 className="font-display text-2xl text-ink">Your moments</h2>
        <p className="text-sm text-ink-muted mt-0.5">
          {moments.length} moment{moments.length === 1 ? '' : 's'} kept.
        </p>
      </div>

      <div className="space-y-8">
        {buckets.map((b) => (
          <section key={b.key}>
            <h3 className="section-label mb-3 sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-10">{b.label}</h3>
            <motion.div
              variants={rm ? undefined : stagger}
              initial={rm ? undefined : 'hidden'}
              animate={rm ? undefined : 'show'}
              className="space-y-4"
            >
              {b.moments.map((m) => (
                <MomentCard key={m.id} moment={m} onEdit={updateMoment} onDelete={deleteMoment} />
              ))}
            </motion.div>
          </section>
        ))}
      </div>
    </div>
  );
}
