import { useState } from 'react';
import { LifeBuoy, Heart } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Modal } from './ui';

const MOTIVATION_LINES = [
  'A short day beats a zero day. Just 10 minutes is enough.',
  "You're building the foundation. It takes time. Don't rush.",
  "Remember your 'why'. The goal isn't that far away.",
  'The streak is just a number, but the habit is forever.',
  'Tired? Do the minimum. Keep the muscle memory alive.',
  "It's okay to struggle. Every senior dev was once here.",
  "Rest if you must, but don't quit.",
  'You are doing this for future you. Show up for them.',
];

export default function PanicButton() {
  const [open, setOpen] = useState(false);
  const { streak } = useStore();
  const [line] = useState(
    () => MOTIVATION_LINES[Math.floor(Math.random() * MOTIVATION_LINES.length)],
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        /* Right column, stacked above the quick-add FAB — not bottom-LEFT.
           Headings and labels are left-aligned, so a floating control on that
           side lands squarely on top of them: measured covering the word
           "CONSISTENCY" on the dashboard. On the right it sits over the empty
           end of a card row instead. */
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+9.5rem)] right-4 md:bottom-5 md:left-5 md:right-auto z-40 w-11 h-11 rounded-full bg-surface border border-border shadow-md text-ink-muted hover:text-accent hover:border-accent/40 transition-colors flex items-center justify-center"
        aria-label="Feeling like quitting?"
        title="Feeling stuck?"
      >
        <LifeBuoy className="w-5 h-5" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} maxWidth="max-w-sm">
        <div className="text-center space-y-5 py-2">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full bg-accent-soft flex items-center justify-center">
              <Heart className="w-6 h-6 text-accent" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-xl font-bold text-ink">Take a deep breath.</h2>
            <p className="text-sm text-ink-muted leading-relaxed px-2">{line}</p>
          </div>
          {streak > 0 && (
            <div className="card p-3 bg-elevated">
              <p className="text-[11px] text-ink-subtle uppercase tracking-wider mb-1">
                Current streak
              </p>
              <p className="font-display text-2xl font-bold text-ink">{streak} days</p>
            </div>
          )}
          <button onClick={() => setOpen(false)} className="btn btn-primary w-full">
            I'm staying.
          </button>
        </div>
      </Modal>
    </>
  );
}
