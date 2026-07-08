import { useState } from 'react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { Trash2, MapPin, Music } from 'lucide-react';
import { cn } from '../lib/utils';
import { rise, pop, useReducedMotion } from '../lib/motion';
import { moodMeta, songLink } from './moments';
import type { Moment } from './types';

/** One moment, rendered as a card. `lead` is an optional resurfacing line
 *  ("1 year ago today") shown above the date. */
export default function MomentCard({
  moment,
  lead,
  onDelete,
}: {
  moment: Moment;
  lead?: string;
  onDelete?: (id: string) => void;
}) {
  const rm = useReducedMotion();
  const [confirming, setConfirming] = useState(false);
  const mood = moodMeta(moment.mood);
  const dt = new Date(moment.createdAt);
  const song = songLink(moment);

  return (
    <motion.article variants={rm ? undefined : rise} className="card overflow-hidden">
      {moment.photo && (
        <div className="relative bg-elevated">
          <img
            src={moment.photo}
            alt=""
            loading="lazy"
            className="w-full max-h-[62vh] object-cover"
          />
        </div>
      )}
      <div className="p-4">
        {(lead || mood) && (
          <div className="flex items-center gap-2 mb-1.5">
            {lead && (
              <span className="text-xs font-semibold tracking-wide" style={{ color: 'var(--kairos)' }}>
                {lead}
              </span>
            )}
            {mood && (
              <span
                className="ml-auto inline-flex items-center gap-1 text-xs text-ink-muted"
                title={mood.label}
              >
                <span aria-hidden>{mood.emoji}</span>
                {mood.label}
              </span>
            )}
          </div>
        )}

        {moment.text && (
          <p className="font-display text-[1.05rem] leading-relaxed text-ink whitespace-pre-wrap break-words">
            {moment.text}
          </p>
        )}

        {moment.song && (
          <a
            href={song}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 max-w-full px-2.5 py-1.5 rounded-full text-xs font-medium border border-border hover:border-border-strong transition-colors"
            style={{ color: 'var(--kairos)' }}
          >
            <Music className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{moment.song}</span>
          </a>
        )}

        <div className="mt-3 flex items-center gap-2 text-xs text-ink-subtle">
          <time dateTime={moment.createdAt}>{format(dt, 'EEE, MMM d, yyyy · h:mm a')}</time>
          {moment.place && (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3" /> {moment.place}
            </span>
          )}
          {onDelete && (
            <span className="ml-auto">
              {confirming ? (
                <span className="inline-flex items-center gap-2">
                  <button
                    onClick={() => onDelete(moment.id)}
                    className="text-danger font-medium"
                  >
                    Delete
                  </button>
                  <button onClick={() => setConfirming(false)} className="text-ink-subtle">
                    Cancel
                  </button>
                </span>
              ) : (
                <motion.button
                  whileTap={rm ? undefined : { scale: 0.9 }}
                  transition={pop}
                  onClick={() => setConfirming(true)}
                  className={cn('p-1 text-ink-subtle hover:text-danger transition-colors')}
                  aria-label="Delete moment"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </motion.button>
              )}
            </span>
          )}
        </div>
      </div>
    </motion.article>
  );
}
