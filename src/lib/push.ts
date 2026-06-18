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
    .upsert({ user_id: user.id, endpoint: json.endpoint, subscription: json }, { onConflict: 'endpoint' });
  if (error) {
    console.error('Failed to save push subscription', error);
    return false;
  }
  safeSetItem(ENDPOINT_KEY, json.endpoint ?? '');
  return true;
}

/** Unsubscribe locally and remove the stored subscription. */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) console.error('Failed to remove push subscription', error);
}
