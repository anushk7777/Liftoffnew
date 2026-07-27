import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Search, X } from 'lucide-react';
import { stagger, useReducedMotion } from '../lib/motion';
import { useKairos } from './store';
import { byMonth, searchMoments, MOODS } from './moments';
import type { MoodId } from './types';
import MomentCard from './MomentCard';
import { EmptyState } from '../components/ui';
import { cn } from '../lib/utils';

export default function Timeline() {
  const rm = useReducedMotion();
  const moments = useKairos((s) => s.moments);
  const updateMoment = useKairos((s) => s.updateMoment);
  const deleteMoment = useKairos((s) => s.deleteMoment);
  const [query, setQuery] = useState('');
  const [mood, setMood] = useState<MoodId | 'all'>('all');
  const filtered = useMemo(() => searchMoments(moments, query, mood), [moments, query, mood]);
  const buckets = useMemo(() => byMonth(filtered), [filtered]);
  const filtering = query.trim() !== '' || mood !== 'all';

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
        <h2 className="font-dream text-dream text-[1.7rem]">Your moments</h2>
        <p className="text-sm text-ink-muted mt-0.5">
          {filtering
            ? `${filtered.length} of ${moments.length} moment${moments.length === 1 ? '' : 's'}`
            : `${moments.length} moment${moments.length === 1 ? '' : 's'} kept.`}
        </p>
      </div>

      {/* A diary you cannot search stops being useful once it gets big. */}
      <div className="mb-5 space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search words, places, songs…"
            aria-label="Search your moments"
            className="w-full rounded-xl border border-border bg-[var(--bg)] pl-9 pr-9 py-2.5 text-sm text-ink outline-none focus:border-[var(--kairos)] transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-ink-subtle hover:text-ink transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {([{ id: 'all', label: 'All', emoji: '' }, ...MOODS] as const).map((m) => {
            const active = mood === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMood(m.id as MoodId | 'all')}
                className={cn(
                  // min-h keeps these a comfortable thumb target on a phone —
                  // as pure padding they came out 30px tall.
                  'shrink-0 px-3 min-h-[36px] inline-flex items-center rounded-full text-[12.5px] font-medium border transition-colors',
                  active ? 'text-white border-transparent' : 'border-border text-ink-muted hover:text-ink',
                )}
                style={active ? { background: 'var(--kairos)' } : undefined}
              >
                {'emoji' in m && m.emoji ? `${m.emoji} ` : ''}{m.label}
              </button>
            );
          })}
        </div>
      </div>

      {filtering && filtered.length === 0 && (
        <p className="text-sm text-ink-subtle text-center py-10">
          Nothing matches that. Try fewer words, or a different mood.
        </p>
      )}

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
