// Raises the morning CO2 nudge. The decision of WHETHER to nudge lives in
// `innovation/recall.ts` as a pure function; this is only the plumbing that
// runs it on a timer and remembers what it has already asked.
//
// Honest limitation, stated here because it matters: this fires while the app
// is open or in the background with the tab alive. It is not a server push, so
// a phone with the app fully closed will get the nudge on the next open inside
// the window, not at 09:30 sharp. Delivering it cold would need a push
// subscription and a server sending at 09:30 in the user's timezone — a much
// larger change, and `public/push-sw.js` already exists if that is wanted later.
import { useEffect } from 'react';
import { useAfterburn } from './store';
import { co2Nudge } from './innovation/recall';
import { notificationsSupported } from '../lib/reminders';

const FIRED_KEY = 'liftoff_co2_nudged';

/** The most recent nudge, held so the banner can pick it up whenever it mounts.
 *
 *  Without this the feature had a race that made it invisible in practice: the
 *  reminder runs its first check inside the effect that starts the interval,
 *  and on a cold load that can happen before <Co2Banner/> has registered its
 *  listener. The event went nowhere, the slot key was written anyway, and the
 *  nudge never fired again that half hour — so the reminder existed, passed its
 *  unit tests, and the user would simply never have seen it. Measured in a real
 *  browser, not reasoned about. */
export interface Co2NudgeView {
  title: string;
  body: string;
}

let pending: Co2NudgeView | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Subscribe/read pair for `useSyncExternalStore`. A plain event would be missed
 *  by a component that mounts a moment after it fires; a store is simply read
 *  on first render, whenever that happens, so the ordering stops mattering. */
export function subscribeCo2Nudge(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export const getCo2Nudge = (): Co2NudgeView | null => pending;

/** Dismiss, or clear after the user acts on it. */
export function clearCo2Nudge() {
  if (!pending) return;
  pending = null;
  emit();
}
/** Checked every minute: the window moves in half-hour slots, so a minute of
 *  granularity is plenty and costs nothing. */
const TICK_MS = 60_000;

function loadFired(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRED_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function saveFired(s: Set<string>) {
  try {
    // Keys are per day and per slot, so a fortnight is more than enough to stop
    // a replay; trimming keeps this from growing without bound.
    localStorage.setItem(FIRED_KEY, JSON.stringify([...s].slice(-60)));
  } catch {
    /* storage best-effort — a full quota must not break the app */
  }
}

/** Exposed for the Settings screen: forget what has been asked today so the
 *  nudge can be demonstrated on demand. */
export function resetCo2Nudges() {
  try {
    localStorage.removeItem(FIRED_KEY);
  } catch {
    /* ignore */
  }
}

export function useCo2Reminder(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const check = () => {
      // Read fresh from the store rather than subscribing, so logging the test
      // does not tear down and rebuild the interval.
      const recovery = useAfterburn.getState().recovery ?? [];
      const fired = loadFired();
      const nudge = co2Nudge(recovery, fired, new Date());
      if (!nudge) return;

      // The in-app banner needs no permission, so the reminder works even if
      // OS notifications were never granted. Latched as well as dispatched, so
      // a banner that mounts a moment later still shows it.
      pending = { title: nudge.title, body: nudge.body };
      emit();
      // Kept for anything else that wants to observe the nudge; the banner
      // itself reads the store, so it cannot miss one raised before it mounted.
      window.dispatchEvent(new CustomEvent('liftoff:co2-nudge', { detail: pending }));

      if (notificationsSupported() && Notification.permission === 'granted') {
        try {
          // One tag for the whole feature: a later slot REPLACES the earlier
          // notification rather than stacking four of them in the shade.
          new Notification(nudge.title, { body: nudge.body, tag: 'afterburn-co2' });
        } catch {
          /* ignore */
        }
      }

      fired.add(nudge.key);
      saveFired(fired);
    };

    check();
    const id = setInterval(check, TICK_MS);
    // Coming back to the app mid-window should nudge immediately rather than
    // waiting up to a minute.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}
