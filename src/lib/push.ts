// Web Push client. Subscribes the browser to push and stores the subscription
// in Supabase so a backend (Edge Function — see docs/PUSH_SETUP.md) can send
// reminder notifications. No-ops gracefully where unsupported or unconfigured.
import { supabase } from './supabase';
import { safeSetItem } from './utils';

const VAPID_PUBLIC_KEY: string | undefined = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const ENDPOINT_KEY = 'liftoff_push_endpoint';

/** True only when a VAPID public key is configured at build time. */
export const isPushConfigured = (): boolean => Boolean(VAPID_PUBLIC_KEY);

export const isPushSupported = (): boolean =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window &&
  'Notification' in window;

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/** This device's IANA zone, e.g. `Asia/Kolkata`. Stored alongside the
 *  subscription because the sender runs on UTC and has to work out when 09:30
 *  is HERE. Falls back to UTC only if the platform refuses to say. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Whether this device currently has a live push subscription.
 *
 *  Read synchronously by the CO2 reminder to decide whether to raise its OWN
 *  OS notification: when the server is going to push, the in-app copy would be
 *  a second identical card. Seeded from storage so the answer is right on the
 *  very first check after a cold load, then corrected by `syncPushSubscription`
 *  once the real subscription can be inspected. */
let pushActive = ((): boolean => {
  try {
    return Boolean(localStorage.getItem(ENDPOINT_KEY));
  } catch {
    return false;
  }
})();
export const isPushActive = (): boolean => pushActive;

function rememberEndpoint(endpoint: string | null) {
  pushActive = Boolean(endpoint);
  try {
    if (endpoint) safeSetItem(ENDPOINT_KEY, endpoint);
    else localStorage.removeItem(ENDPOINT_KEY);
  } catch {
    /* storage best-effort */
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Request permission, subscribe, and persist the subscription. Returns success. */
export async function enablePush(): Promise<boolean> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const json = sub.toJSON();
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, endpoint: json.endpoint, subscription: json, time_zone: deviceTimeZone() },
      { onConflict: 'endpoint' },
    );
  if (error) {
    console.error('Failed to save push subscription', error);
    return false;
  }
  rememberEndpoint(json.endpoint ?? null);
  return true;
}

/** Unsubscribe locally and remove the stored subscription. */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  // Clear the local flag first, so a failed network call cannot leave the app
  // believing the server will push for it — the worst outcome here is a silent
  // morning, and an in-app nudge is a better fallback than none.
  rememberEndpoint(null);
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) console.error('Failed to remove push subscription', error);
}

/**
 * Reconcile this device's stored subscription on app open. Cheap, silent, and
 * safe to call on every boot.
 *
 * Two jobs:
 *  - Keep `isPushActive()` honest. A subscription can vanish without the app
 *    being told (permission revoked in browser settings, site data cleared,
 *    the PWA reinstalled), and a stale "yes" would suppress the in-app nudge in
 *    favour of a server push that can never arrive.
 *  - Keep the timezone current. The 09:30 window is local, so a phone that flies
 *    to another country must start nudging on the new morning — which it does,
 *    the first time the app is opened there.
 */
export async function syncPushSubscription(): Promise<void> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return;
  try {
    if (Notification.permission !== 'granted') {
      rememberEndpoint(null);
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      rememberEndpoint(null);
      return;
    }
    const json = sub.toJSON();
    rememberEndpoint(json.endpoint ?? null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Upsert rather than update: if the row was lost (a wiped table, a different
    // project) this restores it instead of quietly never pushing again.
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        { user_id: user.id, endpoint: json.endpoint, subscription: json, time_zone: deviceTimeZone() },
        { onConflict: 'endpoint' },
      );
    if (error) console.error('Failed to refresh push subscription', error);
  } catch (e) {
    // Never let a background reconcile break a page load.
    console.error('Push subscription sync failed', e);
  }
}
