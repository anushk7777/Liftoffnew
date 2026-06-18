// Lightweight haptic feedback via the Vibration API. No-ops where unsupported
// (iOS Safari ignores navigator.vibrate, which is fine — calls stay harmless).
function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}

export const haptics = {
  tap: () => vibrate(10),
  success: () => vibrate([12, 40, 12]),
  warn: () => vibrate([30, 60, 30]),
};
