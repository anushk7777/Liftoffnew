import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame } from 'lucide-react';
import { useReducedMotion } from '../lib/motion';
import { haptics } from '../lib/haptics';

const SAPPHIRE_BG = 'radial-gradient(120% 90% at 50% 30%, #12318f 0%, #0a1a4d 45%, #04081c 100%)';
const SAPPHIRE_GRAD = 'linear-gradient(150deg, #4f8dff, #1e3fae)';

export default function WorkoutIgnition({ phrase, onDone }: { phrase: string | null; onDone: () => void }) {
  const rm = useReducedMotion();
  const show = phrase !== null;

  useEffect(() => {
    if (!show) return;
    haptics.tap();
    // Reduced motion: don't hold the user hostage — clear immediately.
    const t = setTimeout(onDone, rm ? 50 : 1600);
    return () => clearTimeout(t);
  }, [show, rm, onDone]);

  if (rm) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center"
          style={{ background: SAPPHIRE_BG }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35, ease: 'easeOut' } }}
        >
          {/* Expanding sapphire shockwave */}
          <motion.span
            className="absolute w-40 h-40 rounded-full"
            style={{ border: '2px solid rgba(110,160,255,0.5)' }}
            initial={{ scale: 0.4, opacity: 0.9 }}
            animate={{ scale: 3.2, opacity: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          />
          <motion.span
            className="absolute w-40 h-40 rounded-full"
            style={{ border: '1px solid rgba(110,160,255,0.35)' }}
            initial={{ scale: 0.3, opacity: 0.8 }}
            animate={{ scale: 2.2, opacity: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          />

          <motion.div
            className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: SAPPHIRE_GRAD, boxShadow: '0 0 60px rgba(79,141,255,0.65)' }}
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: [0, 1.15, 1], rotate: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <Flame className="w-10 h-10 text-white" />
          </motion.div>

          <motion.p
            className="font-display-italic text-4xl text-white mt-8 text-center px-8"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
          >
            {phrase}
          </motion.p>

          <motion.p
            className="text-[11px] font-semibold uppercase tracking-[0.3em] mt-3"
            style={{ color: 'rgba(150,185,255,0.85)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.4 }}
          >
            Workout started
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
