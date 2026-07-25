// Tiny standalone store for which app (Focus / Afterburn) is active.
//
// Kept in its own module — NOT in store.ts — on purpose: the eager app shell
// (App, Sidebar, MobileShell, command palette, …) needs `useAppMode` to route,
// but the full Afterburn store statically imports the ~900-line `plan.ts` data.
// Importing the mode from here keeps that heavy module out of the initial
// bundle so the Afterburn tree can be code-split behind React.lazy.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppMode } from './types';

interface ModeState {
  mode: AppMode | null;
  setMode: (m: AppMode | null) => void;
  /** Workspaces whose intro animation has already played on this device. */
  seenIntros: AppMode[];
  markIntroSeen: (m: AppMode) => void;
  /** Play every intro again (Settings → Appearance). */
  resetIntros: () => void;
}

/** Which app is active. `null` => show the profile picker. */
export const useAppMode = create<ModeState>()(
  persist(
    (set) => ({
      mode: null,
      setMode: (mode) => set({ mode }),
      seenIntros: [],
      markIntroSeen: (m) =>
        set((s) => (s.seenIntros.includes(m) ? s : { ...s, seenIntros: [...s.seenIntros, m] })),
      resetIntros: () => set({ seenIntros: [] }),
    }),
    { name: 'liftoff-app-mode' },
  ),
);
