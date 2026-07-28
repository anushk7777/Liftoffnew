// Where a tapped notification lands.
//
// The service worker can only hand the app a URL (`public/push-sw.js` navigates
// the existing window, or opens one). Afterburn is not a route — it is a
// workspace chosen in a store, and its whole tree is lazy-loaded — so `?co2=1`
// is read once at boot into a latch that survives until the Afterburn tree has
// actually mounted and can act on it.
//
// A latch rather than an event for the same reason the nudge banner uses a
// store: the code that raises the intent runs before the code that handles it,
// and an event fired into an empty room is simply lost.

// The flag itself is defined next to the rest of the CO2 constants, because the
// Edge Function that builds the URL has to agree with the code that reads it.
import { CO2_PARAM } from './innovation/co2Server';
export { CO2_PARAM } from './innovation/co2Server';

let pendingCo2 = false;

/**
 * Read the deep link out of the URL and remember it. Returns whether the CO2
 * test was requested, so the caller can switch workspace immediately.
 *
 * The parameter is stripped from the address bar on the way through: leaving it
 * there means a refresh next Tuesday reopens the test, and a shared or restored
 * URL does the same to someone who never tapped anything.
 */
export function readCo2DeepLink(): boolean {
  if (typeof window === 'undefined') return false;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return false;
  }
  if (params.get(CO2_PARAM) !== '1') return false;

  pendingCo2 = true;
  try {
    params.delete(CO2_PARAM);
    const qs = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
    );
  } catch {
    /* a browser that refuses replaceState still gets the right screen */
  }
  return true;
}

/**
 * Ask for the CO2 test from inside the app — used by the nudge banner.
 *
 * The banner can be showing in Focus, where the whole Afterburn tree is
 * unmounted and lazy. Its click switched workspace and then dispatched
 * `afterburn:open-co2` immediately, which arrived before Afterburn had
 * registered a listener: measured in a real browser, tapping the banner from
 * Focus landed on the Programs tab, not the test. Latching it instead means the
 * intent waits for whoever can act on it.
 */
export function requestCo2DeepLink(): void {
  pendingCo2 = true;
}

/** Claim the pending request, if any. Clears it, so it fires exactly once. */
export function consumeCo2DeepLink(): boolean {
  const wanted = pendingCo2;
  pendingCo2 = false;
  return wanted;
}
