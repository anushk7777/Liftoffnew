import type { Transition, Variants } from 'framer-motion';
import { useStore } from '../store/useStore';

// One shared motion language. Spring-based for a tactile, ~120fps feel.
export const pop: Transition = { type: 'spring', stiffness: 420, damping: 30, mass: 0.8 };
export const springSoft: Transition = { type: 'spring', stiffness: 260, damping: 26 };
export const fast: Transition = { duration: 0.18, ease: [0.21, 1, 0.4, 1] };

// Page transition variants (subtle fade + lift).
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 14 },
  enter: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

// Shared entrance choreography: a parent `stagger` container drips its `rise`
// children in. Use with initial="hidden" animate="show" (or whileInView).
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
export const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0.7, 0.2, 1] } },
};

// Read the user's reduce-motion preference so callers can opt out of animation.
export function useReducedMotion(): boolean {
  return useStore((s) => s.reduceMotion);
}
