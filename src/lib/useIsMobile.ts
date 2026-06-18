import { useSyncExternalStore } from 'react';

// A phone-sized viewport OR a coarse (touch) primary pointer counts as mobile.
// We render the dedicated mobile UI layer (src/mobile) whenever this is true.
const QUERY = '(max-width: 767px), (pointer: coarse)';

function getQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(QUERY);
}

function subscribe(callback: () => void): () => void {
  const mql = getQuery();
  if (!mql) return () => {};
  // addEventListener is the modern API; some older Safari only has addListener.
  if (mql.addEventListener) {
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
  }
  mql.addListener(callback);
  return () => mql.removeListener(callback);
}

function getSnapshot(): boolean {
  return getQuery()?.matches ?? false;
}

/** True when the current device should get the mobile UI layer. */
export function useIsMobile(): boolean {
  // Server snapshot is `false` (desktop) — there is no SSR here, but it keeps
  // useSyncExternalStore happy and avoids hydration surprises.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
