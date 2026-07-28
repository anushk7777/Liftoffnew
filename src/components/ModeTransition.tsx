import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Flame, Sparkles, ClipboardList } from 'lucide-react';
import { useAppMode } from '../afterburn/mode';
import type { AppMode } from '../afterburn/types';
import { useReducedMotion } from '../lib/motion';

// A cinematic full-screen wipe played the FIRST time you enter each workspace.
//
// Two things this used to get wrong. It only knew about focus and afterburn, so
// every other workspace fell through to the "not focus" branch and was greeted
// by Afterburn's flame — Kairos announced itself as Workout Mode. And it replayed
// on every single switch, which wears out fast once you're moving between
// workspaces all day. Each one now has its own identity and introduces itself
// once; Settings → Appearance plays them again.

type Look = {
  title: string;
  tagline: string;
  icon: React.ReactNode;
  /** Tile behind the icon. */
  tile: string;
  /** Glow around the tile. */
  glow: string;
  /** Ambient wash behind everything. */
  wash: string;
  /** Tagline + underline colour. */
  hint: string;
  rule: string;
  /** Kairos sets its own display face; the rest use the UI serif. */
  fontFamily?: string;
};

// Deliberately literal colours rather than CSS variables: this plays over a
// near-black scrim in both themes, so the light-theme values would be wrong.
const LOOKS: Record<AppMode, Look> = {
  focus: {
    title: 'Liftoff',
    tagline: 'Mission Control',
    icon: (
      <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2 L20 21 L12 16.5 L4 21 Z" fill="#0a0a0b" />
      </svg>
    ),
    tile: '#f4f3f1',
    glow: '0 0 40px rgba(255,255,255,0.45)',
    wash: 'radial-gradient(60% 50% at 50% 45%, rgba(255,255,255,0.10), transparent 70%)',
    hint: '#8d8c92',
    rule: 'rgba(255,255,255,0.5)',
  },
  afterburn: {
    title: 'Afterburn',
    tagline: 'Workout Mode',
    icon: <Flame className="w-11 h-11 text-white" />,
    tile: 'linear-gradient(150deg,#ff8a3d,#ff3d2e)',
    glow: '0 0 48px rgba(255,80,30,0.6)',
    wash: 'radial-gradient(60% 50% at 50% 45%, rgba(255,90,40,0.22), transparent 70%)',
    hint: '#ff9c6e',
    rule: 'rgba(255,120,70,0.7)',
  },
  kairos: {
    title: 'Kairos',
    tagline: 'Private Diary',
    icon: <Sparkles className="w-11 h-11 text-white" />,
    tile: 'linear-gradient(120deg, #a998f2 0%, #e084b6 55%, #f2b877 100%)',
    glow: '0 0 48px rgba(169,152,242,0.55)',
    wash: 'radial-gradient(60% 50% at 50% 45%, rgba(169,152,242,0.20), transparent 70%)',
    hint: '#c8b8ff',
    rule: 'rgba(200,184,255,0.65)',
    fontFamily: "'Instrument Serif', Georgia, serif",
  },
  templates: {
    title: 'Templates',
    tagline: 'Coaching',
    icon: <ClipboardList className="w-11 h-11 text-white" />,
    tile: 'linear-gradient(150deg,#ff8f75,#e14b34)',
    glow: '0 0 48px rgba(255,122,92,0.55)',
    wash: 'radial-gradient(60% 50% at 50% 45%, rgba(255,122,92,0.20), transparent 70%)',
    hint: '#ffab95',
    rule: 'rgba(255,140,110,0.7)',
  },
};

export default function ModeTransition() {
  const mode = useAppMode((s) => s.mode);
  const rm = useReducedMotion();
  const prev = useRef(mode);
  const [dest, setDest] = useState<AppMode | null>(null);

  useEffect(() => {
    // seenIntros is read through getState rather than a selector on purpose:
    // marking one seen would otherwise re-run this effect, and the cleanup
    // would cancel the timer that dismisses the overlay.
    const { seenIntros, markIntroSeen } = useAppMode.getState();

    // Only real switches between workspaces animate — the first pick from the
    // profile screen (null → x) is not a transition.
    const switching = !!mode && !!prev.current && prev.current !== mode;
    if (!rm && switching && mode && !seenIntros.includes(mode)) {
      setDest(mode);
      markIntroSeen(mode);
      const t = setTimeout(() => setDest(null), 1150);
      prev.current = mode;
      return () => clearTimeout(t);
    }
    prev.current = mode;
  }, [mode, rm]);

  const look = dest ? LOOKS[dest] : null;

  return (
    <AnimatePresence>
      {look && (
        <motion.div
          key="mode-wipe"
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none overflow-hidden"
          style={{ background: '#08080a' }}
          initial={{ clipPath: 'inset(0 0 100% 0)' }}
          animate={{ clipPath: 'inset(0 0 0% 0)' }}
          exit={{ clipPath: 'inset(100% 0 0 0)' }}
          transition={{ duration: 0.5, ease: [0.76, 0, 0.24, 1] }}
        >
          <div className="absolute inset-0" style={{ background: look.wash }} />

          <motion.div
            className="relative flex flex-col items-center gap-5"
            initial={{ opacity: 0, scale: 0.82, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.06 }}
            transition={{ delay: 0.14, duration: 0.42, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div
              className="w-[88px] h-[88px] rounded-[26px] flex items-center justify-center"
              style={{ background: look.tile, boxShadow: look.glow }}
            >
              {look.icon}
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <span
                className="text-[34px] leading-none"
                style={{
                  fontFamily: look.fontFamily ?? "'Instrument Serif', Georgia, serif",
                  color: '#f4f3f1',
                }}
              >
                {look.title}
              </span>
              <span
                className="text-[11px] font-bold uppercase"
                style={{ letterSpacing: '0.32em', color: look.hint }}
              >
                {look.tagline}
              </span>
            </div>

            <motion.div
              className="h-px"
              style={{ background: look.rule }}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 132, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
