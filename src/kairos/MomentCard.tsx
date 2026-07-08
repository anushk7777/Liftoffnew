import { useState } from 'react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { Trash2, MapPin, Music, Pencil, Check, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { rise, pop, useReducedMotion } from '../lib/motion';
import { moodMeta, songLink, MOODS } from './moments';
import type { MomentEdit } from './store';
import type { Moment } from './types';

/** One moment, rendered as a card. `lead` is an optional resurfacing line
 *  ("1 year ago today") shown above the date. When `onEdit` is provided, a
 *  pencil reveals an inline editor for the words / mood / song / place — the
 *  capture time stays locked. */
export default function MomentCard({
  moment,
  lead,
  onEdit,
  onDelete,
}: {
  moment: Moment;
  lead?: string;
  onEdit?: (id: string, patch: MomentEdit) => void;
  onDelete?: (id: string) => void;
}) {
  const rm = useReducedMotion();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dText, setDText] = useState(moment.text);
  const [dMood, setDMood] = useState(moment.mood);
  const [dPlace, setDPlace] = useState(moment.place ?? '');
  const [dSong, setDSong] = useState(moment.song ?? '');
  const [dSongUrl, setDSongUrl] = useState(moment.songUrl ?? '');

  const mood = moodMeta(moment.mood);
  const dt = new Date(moment.createdAt);
  const song = songLink(moment);

  const startEdit = () => {
    setDText(moment.text);
    setDMood(moment.mood);
    setDPlace(moment.place ?? '');
    setDSong(moment.song ?? '');
    setDSongUrl(moment.songUrl ?? '');
    setEditing(true);
  };

  const saveEdit = () => {
    onEdit?.(moment.id, { text: dText, mood: dMood, place: dPlace, song: dSong, songUrl: dSongUrl });
    setEditing(false);
  };

  return (
    <motion.article variants={rm ? undefined : rise} className="card overflow-hidden">
      {moment.photo && (
        <div className="relative bg-elevated">
          <img src={moment.photo} alt="" loading="lazy" className="w-full max-h-[62vh] object-cover" />
        </div>
      )}
      <div className="p-4">
        {(lead || mood) && !editing && (
          <div className="flex items-center gap-2 mb-1.5">
            {lead && (
              <span className="text-xs font-semibold tracking-wide" style={{ color: 'var(--kairos)' }}>
                {lead}
              </span>
            )}
            {mood && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-ink-muted" title={mood.label}>
                <span aria-hidden>{mood.emoji}</span>
                {mood.label}
              </span>
            )}
          </div>
        )}

        {editing ? (
          <div>
            <textarea
              value={dText}
              onChange={(e) => setDText(e.target.value)}
              rows={4}
              placeholder="Refine your words…"
              className="w-full bg-transparent resize-none outline-none font-display text-[1.05rem] leading-relaxed text-ink placeholder:text-ink-subtle border-b border-border pb-2"
            />
            {/* Mood */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {MOODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setDMood((cur) => (cur === m.id ? undefined : m.id))}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    dMood === m.id ? 'text-ink' : 'text-ink-muted border-border hover:border-border-strong',
                  )}
                  style={dMood === m.id ? { borderColor: m.color, background: `color-mix(in srgb, ${m.color} 14%, transparent)` } : undefined}
                >
                  <span aria-hidden>{m.emoji}</span>
                  {m.label}
                </button>
              ))}
            </div>
            <input value={dPlace} onChange={(e) => setDPlace(e.target.value)} placeholder="Where were you? (optional)" className="input mt-3 !py-2 text-sm" />
            <div className="mt-2 flex items-center gap-2">
              <Music className="w-4 h-4 shrink-0" style={{ color: 'var(--kairos)' }} />
              <input value={dSong} onChange={(e) => setDSong(e.target.value)} placeholder="Song (optional)" className="input !py-2 text-sm flex-1" />
            </div>
            {dSong.trim() && (
              <input value={dSongUrl} onChange={(e) => setDSongUrl(e.target.value)} placeholder="YouTube Music link (optional)" className="input mt-2 !py-2 text-sm" inputMode="url" />
            )}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-ink-subtle mr-auto">Captured {format(dt, 'MMM d, yyyy · h:mm a')} · time stays locked</span>
              <button onClick={() => setEditing(false)} className="btn btn-secondary !py-1.5 !px-3 text-sm">
                <X className="w-4 h-4" /> Cancel
              </button>
              <button onClick={saveEdit} className="btn btn-primary !py-1.5 !px-3 text-sm">
                <Check className="w-4 h-4" /> Save
              </button>
            </div>
          </div>
        ) : (
          <>
            {moment.text && (
              <p className="font-display text-[1.05rem] leading-relaxed text-ink whitespace-pre-wrap break-words">{moment.text}</p>
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
              <span className="ml-auto flex items-center gap-1">
                {onEdit && !confirming && (
                  <motion.button
                    whileTap={rm ? undefined : { scale: 0.9 }}
                    transition={pop}
                    onClick={startEdit}
                    className="p-1 text-ink-subtle hover:text-ink transition-colors"
                    aria-label="Edit moment"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </motion.button>
                )}
                {onDelete &&
                  (confirming ? (
                    <span className="inline-flex items-center gap-2">
                      <button onClick={() => onDelete(moment.id)} className="text-danger font-medium">Delete</button>
                      <button onClick={() => setConfirming(false)} className="text-ink-subtle">Cancel</button>
                    </span>
                  ) : (
                    <motion.button
                      whileTap={rm ? undefined : { scale: 0.9 }}
                      transition={pop}
                      onClick={() => setConfirming(true)}
                      className="p-1 text-ink-subtle hover:text-danger transition-colors"
                      aria-label="Delete moment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </motion.button>
                  ))}
              </span>
            </div>
          </>
        )}
      </div>
    </motion.article>
  );
}
