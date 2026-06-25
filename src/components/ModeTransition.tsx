import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { useAppMode } from '../afterburn/store';
import { useReducedMotion } from '../lib/motion';

// A cinematic full-screen wipe played whenever the user switches between the
// Liftoff (focus) and Afterburn (workout) workspaces. Cool ink ↔ warm ember.
type Dest = 'focus' | 'afterburn';

export default function ModeTransition() {
  const mode = useAppMode((s) => s.mode);
  const rm = useReducedMotion();
  const prev = useRef(mode);
  const [dest, setDest] = useState<Dest | null>(null);

  useEffect(() => {
    // Only animate real switches between the two workspaces (not the initial
    // pick from the profile screen, which is null → x).
    if (!rm && mode && prev.current && prev.current !== mode) {
      setDest(mode as Dest);
      const t = setTimeout(() => setDest(null), 1150);
      prev.current = mode;
      return () => clearTimeout(t);
    }
    prev.current = mode;
  }, [mode, rm]);

  const isFocus = dest === 'focus';

  return (
    <AnimatePresence>
      {dest && (
        <motion.div
          key="mode-wipe"
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none overflow-hidden"
          style={{ background: '#08080a' }}
          initial={{ clipPath: 'inset(0 0 100% 0)' }}
          animate={{ clipPath: 'inset(0 0 0% 0)' }}
          exit={{ clipPath: 'inset(100% 0 0 0)' }}
          transition={{ duration: 0.5, ease: [0.76, 0, 0.24, 1] }}
        >
          {/* ambient glow — warm for Afterburn, cool for Liftoff */}
          <div
            className="absolute inset-0"
            style={{
              background: isFocus
                ? 'radial-gradient(60% 50% at 50% 45%, rgba(255,255,255,0.10), transparent 70%)'
                : 'radial-gradient(60% 50% at 50% 45%, rgba(255,90,40,0.22), transparent 70%)',
            }}
          />

          <motion.div
            className="relative flex flex-col items-center gap-5"
            initial={{ opacity: 0, scale: 0.82, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.06 }}
            transition={{ delay: 0.14, duration: 0.42, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div
              className="w-[88px] h-[88px] rounded-[26px] flex items-center justify-center"
              style={{
                background: isFocus ? '#f4f3f1' : 'linear-gradient(150deg,#ff8a3d,#ff3d2e)',
                boxShadow: isFocus
                  ? '0 0 40px rgba(255,255,255,0.45)'
                  : '0 0 48px rgba(255,80,30,0.6)',
              }}
            >
              {isFocus ? (
                <svg width="44" height="44" viewBox="0 0 24 24">
                  <path d="M12 2 L20 21 L12 16.5 L4 21 Z" fill="#0a0a0b" />
                </svg>
              ) : (
                <Flame className="w-11 h-11 text-white" />
              )}
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <span
                className="text-[34px] leading-none"
                style={{ fontFamily: "'Instrument Serif', Georgia, serif", color: '#f4f3f1' }}
              >
                {isFocus ? 'Liftoff' : 'Afterburn'}
              </span>
              <span
                className="text-[10px] font-bold uppercase"
                style={{ letterSpacing: '0.32em', color: isFocus ? '#8d8c92' : '#ff9c6e' }}
              >
                {isFocus ? 'Mission Control' : 'Workout Mode'}
              </span>
            </div>

            {/* sweeping underline */}
            <motion.div
              className="h-px"
              style={{ background: isFocus ? 'rgba(255,255,255,0.5)' : 'rgba(255,120,70,0.7)' }}
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
