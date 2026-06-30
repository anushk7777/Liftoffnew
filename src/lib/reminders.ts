import { useEffect } from 'react';
import { useStore } from '../store/useStore';

const NOTIFIED_KEY = 'liftoff_notified';

function getNotified(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
function saveNotified(s: Set<string>) {
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...s].slice(-200)));
  } catch {
    /* storage best-effort */
  }
}

// Allow a snoozed/edited task to fire again. The notified set is keyed by
// `${taskId}:${scheduledAt}`, so clear every entry for this task id (also
// matches a legacy id-only key).
export function clearNotified(id: string) {
  const s = getNotified();
  let changed = false;
  for (const key of [...s]) {
    if (key === id || key.startsWith(`${id}:`)) {
      s.delete(key);
      changed = true;
    }
  }
  if (changed) saveNotified(s);
}

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const p = await Notification.requestPermission();
  return p === 'granted';
}

// Watches scheduled tasks and, when one comes due, raises an in-app alarm
// (handled by AlarmOverlay) plus an OS notification if permission was granted.
// The in-app alarm needs no permission, so reminders work out of the box.
export function useReminders() {
  // One stable interval for the lifetime of the mount. We read tasks fresh from
  // the store inside check() (via getState) rather than subscribing, so a task
  // mutation no longer tears down and recreates the 15s interval — and there's
  // no need to re-render this hook's host when tasks change.
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const notified = getNotified();
      let changed = false;
      for (const t of useStore.getState().tasks) {
        if (t.status === 'done' || !t.scheduledAt) continue;
        const ts = new Date(t.scheduledAt).getTime();
        // De-dup by (taskId, scheduledAt) — mirrors the server Edge Function —
        // so rescheduling a task re-alerts and a fresh device doesn't replay.
        const key = `${t.id}:${t.scheduledAt}`;
        // Fire if due within the last 24 hours
        if (ts <= now && now - ts < 24 * 60 * 60 * 1000 && !notified.has(key)) {
          // In-app alarm (always)
          window.dispatchEvent(
            new CustomEvent('liftoff:alarm', { detail: { id: t.id, title: t.title } }),
          );
          // OS notification (best-effort)
          if (notificationsSupported() && Notification.permission === 'granted') {
            try {
              new Notification('Liftoff reminder', { body: t.title, tag: t.id });
            } catch {
              /* ignore */
            }
          }
          notified.add(key);
          changed = true;
        }
      }
      if (changed) saveNotified(notified);
    };

    check();
    const id = setInterval(check, 15000);

    // Check when user returns to the tab
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
}
