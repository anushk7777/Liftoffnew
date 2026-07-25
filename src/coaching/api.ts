// Coaching micro-app — data layer over Supabase.
// Access control lives in RLS (supabase/coaching_setup.sql); everything here
// just queries and lets the database decide what each account may see.
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

/** The coach's account. Only this login sees the roster & plan editors. */
export const COACH_EMAIL = 'anushkdua2508@gmail.com';

export interface CoachClient {
  id: string;
  name: string;
  email: string;
  user_id: string | null;
  created_at: string;
  reminders_enabled?: boolean;
  last_reminded_at?: string | null;
  // Check-in schedule (coach-set): which weekday measurements land on, how
  // often, and whether a daily weight log is expected.
  measure_weekday?: number;
  measure_cadence?: 'weekly' | 'biweekly';
  measure_anchor?: string | null;
  daily_weight?: boolean;
  // One-time profile details — asked once, edited from Profile, never on a
  // per-check-in basis.
  height_cm: number | null;
  birth_year: number | null;
  sex: string | null;
  goal: string | null;
}

export interface CoachMessage {
  id: string;
  client_id: string;
  author: 'client' | 'coach';
  kind: 'note' | 'request';
  body: string;
  read_at: string | null;
  created_at: string;
}

export const ageFromBirthYear = (y: number | null | undefined) =>
  y ? new Date().getFullYear() - y : null;

/** True once the one-time profile questions have been answered. */
export const hasProfile = (c: CoachClient | null) =>
  !!c && c.height_cm != null && c.birth_year != null;

export interface Metric {
  id: string;
  client_id: string;
  taken_on: string; // yyyy-mm-dd
  weight_kg: number | null;
  height_cm: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  hips_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  notes: string | null;
  photo_front: string | null;
  photo_side: string | null;
}

export interface Plan {
  client_id: string;
  diet_plan: string;
  calorie_target: number | null;
  protein_target: number | null;
  updated_at: string;
}

export type MetricInput = Omit<Metric, 'id' | 'client_id'>;

/** Session email, live-updated on auth changes. null = signed out. */
export function useSessionEmail(): { email: string | null; loading: boolean } {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);
  return { email, loading };
}

export const isCoach = (email: string | null) =>
  (email ?? '').toLowerCase() === COACH_EMAIL.toLowerCase();

// ---- Coach: roster ------------------------------------------------------
export async function listClients(): Promise<CoachClient[]> {
  const { data, error } = await supabase
    .from('coaching_clients')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addClient(name: string, email: string): Promise<CoachClient> {
  const { data, error } = await supabase
    .from('coaching_clients')
    .insert({ name: name.trim(), email: email.trim().toLowerCase() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeClient(id: string): Promise<void> {
  const { error } = await supabase.from('coaching_clients').delete().eq('id', id);
  if (error) throw error;
}

// ---- Client: my record (created on the coach's side, claimed on login) ---
export async function getMyClientRecord(): Promise<CoachClient | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const email = session?.user?.email;
  const uid = session?.user?.id;
  if (!email || !uid) return null;
  const { data, error } = await supabase
    .from('coaching_clients')
    .select('*')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // First visit: link this Google account to the roster row ("account created").
  if (!data.user_id) {
    const { data: claimed } = await supabase
      .from('coaching_clients')
      .update({ user_id: uid })
      .eq('id', data.id)
      .select()
      .maybeSingle();
    return claimed ?? { ...data, user_id: uid };
  }
  return data;
}

// ---- Metrics -------------------------------------------------------------
export async function listMetrics(clientId: string): Promise<Metric[]> {
  const { data, error } = await supabase
    .from('coaching_metrics')
    .select('*')
    .eq('client_id', clientId)
    .order('taken_on', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addMetric(clientId: string, m: Partial<MetricInput>): Promise<Metric> {
  const { data, error } = await supabase
    .from('coaching_metrics')
    .insert({ client_id: clientId, ...m })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---- Plan ----------------------------------------------------------------
export async function getPlan(clientId: string): Promise<Plan | null> {
  const { data, error } = await supabase
    .from('coaching_plans')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertPlan(
  clientId: string,
  plan: { diet_plan: string; calorie_target: number | null; protein_target: number | null },
): Promise<Plan> {
  const { data, error } = await supabase
    .from('coaching_plans')
    .upsert({ client_id: clientId, ...plan, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---- Profile (the one-time questions) -----------------------------------
export async function updateProfile(
  clientId: string,
  patch: Partial<Pick<CoachClient,
    'height_cm' | 'birth_year' | 'sex' | 'goal' | 'name' |
    'measure_weekday' | 'measure_cadence' | 'measure_anchor' | 'daily_weight'>>,
): Promise<CoachClient> {
  const { data, error } = await supabase
    .from('coaching_clients')
    .update(patch)
    .eq('id', clientId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---- Messages (client requests / notes ↔ coach replies) -----------------
export async function listMessages(clientId: string): Promise<CoachMessage[]> {
  const { data, error } = await supabase
    .from('coaching_messages')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function sendMessage(
  clientId: string,
  author: 'client' | 'coach',
  body: string,
  kind: 'note' | 'request' = 'note',
): Promise<CoachMessage> {
  const { data, error } = await supabase
    .from('coaching_messages')
    .insert({ client_id: clientId, author, body: body.trim(), kind })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Live updates: fire cb whenever this client's plan, metrics or thread change. */
export function subscribeClient(clientId: string, cb: () => void): () => void {
  const filter = `client_id=eq.${clientId}`;
  const ch = supabase
    .channel(`coaching-${clientId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'coaching_plans', filter }, cb)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'coaching_metrics', filter }, cb)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'coaching_messages', filter }, cb)
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}

// ---- Notifications -------------------------------------------------------
/** Ask once for permission; returns the resulting permission state. */
export async function ensureNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Show a local notification. Uses the service worker registration when one is
 * active (required on Android/installed PWAs), falling back to the page-level
 * Notification constructor on desktop browsers.
 */
export async function notify(title: string, body: string, tag?: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const opts: NotificationOptions = { body, tag, icon: '/icon.svg', badge: '/icon.svg' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, opts);
      return;
    }
  } catch {
    /* fall through to the page-level API */
  }
  try {
    new Notification(title, opts);
  } catch {
    /* notifications unavailable — silently skip */
  }
}

// ---- PWA install helpers -------------------------------------------------
const INSTALL_KEY = 'liftoff_coaching_install_seen';

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Pops the install guide once per device, shortly after the portal is ready. */
export function useInstallGuide(ready: boolean) {
  const [open, setOpen] = useState(false);
  const fired = useRef(false);
  useEffect(() => {
    if (!ready || fired.current) return;
    fired.current = true;
    if (isStandalone()) return;
    let seen = false;
    try {
      seen = localStorage.getItem(INSTALL_KEY) === '1';
    } catch {
      /* ignore */
    }
    if (seen) return;
    const t = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(t);
  }, [ready]);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(INSTALL_KEY, '1');
    } catch {
      /* ignore */
    }
  };
  return { open, close, reopen: () => setOpen(true) };
}

// ---- Derived metrics -----------------------------------------------------
/** BMI from a check-in weight and the client's stored height. */
export function bmiOf(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function bmiBand(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Underweight', color: 'var(--warning)' };
  if (bmi < 25) return { label: 'Healthy', color: 'var(--success)' };
  if (bmi < 30) return { label: 'Overweight', color: 'var(--warning)' };
  return { label: 'Obese', color: 'var(--danger)' };
}

// ---- Progress photos -----------------------------------------------------
const PHOTO_BUCKET = 'coaching-photos';

/** Upload one progress photo; returns the storage path to save on the row. */
export async function uploadPhoto(clientId: string, file: File, slot: 'front' | 'side'): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${clientId}/${Date.now()}-${slot}.${ext}`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  return path;
}

/** Signed URL for a stored photo (the bucket is private). */
export async function photoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Resolve many photo paths at once, keyed by path. */
export async function photoUrls(paths: (string | null)[]): Promise<Record<string, string>> {
  const wanted = paths.filter((p): p is string => !!p);
  if (!wanted.length) return {};
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(wanted, 3600);
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}

// ---- Unread messages -----------------------------------------------------
/** Unread counts per client for the coach's inbox badge. */
export async function unreadByClient(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('coaching_messages')
    .select('client_id')
    .eq('author', 'client')
    .is('read_at', null);
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const row of data ?? []) out[row.client_id] = (out[row.client_id] ?? 0) + 1;
  return out;
}

/** Mark a client's messages as read (called when the coach opens them). */
export async function markClientMessagesRead(clientId: string): Promise<void> {
  await supabase
    .from('coaching_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .eq('author', 'client')
    .is('read_at', null);
}

/** Live badge: total unread client messages, refreshed on any thread change. */
export function useUnreadTotal(enabled: boolean): number {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () => {
      unreadByClient()
        .then((c) => {
          if (alive) setCounts(c);
        })
        .catch(() => {});
    };
    load();
    const ch = supabase
      .channel('coaching-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coaching_messages' }, load)
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(ch);
    };
  }, [enabled]);
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

// ---- Check-in reminders --------------------------------------------------
const REMIND_KEY = 'liftoff_coaching_last_reminder';
export const CHECKIN_INTERVAL_DAYS = 7;

/** Days since the most recent check-in, or null when there are none yet. */
export function daysSinceCheckin(metrics: Metric[]): number | null {
  if (!metrics.length) return null;
  const last = metrics.reduce((a, b) => (a.taken_on > b.taken_on ? a : b));
  const diff = Date.now() - new Date(`${last.taken_on}T12:00:00`).getTime();
  return Math.floor(diff / 86400000);
}

/**
 * Fire a local "time for your check-in" notification when one is due, at most
 * once a day. Runs whenever the portal/PWA is opened — the practical option
 * without a push server, and it works in the installed app.
 */
export function maybeRemindCheckin(metrics: Metric[], enabled = true): boolean {
  if (!enabled) return false;
  const days = daysSinceCheckin(metrics);
  const due = days === null || days >= CHECKIN_INTERVAL_DAYS;
  if (!due) return false;
  let last = 0;
  try {
    last = Number(localStorage.getItem(REMIND_KEY) ?? 0);
  } catch {
    /* ignore */
  }
  if (Date.now() - last < 86400000) return true; // already nudged today
  try {
    localStorage.setItem(REMIND_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  void notify(
    'Time for your check-in',
    days === null ? 'Log your first measurements to start tracking.' : `It's been ${days} days since your last one.`,
    'checkin-due',
  );
  return true;
}

// ---- Invites -------------------------------------------------------------
export const portalLink = () => `${window.location.origin}/coaching`;

/** The message a client receives. Written to be pasted anywhere. */
export function inviteText(client: CoachClient, coachName = 'your coach'): string {
  return (
    `Hey ${client.name.split(' ')[0]}! 👋\n\n` +
    `I've set up your private progress page — you can log your weight and measurements, ` +
    `add progress photos, see your charts, and message me directly.\n\n` +
    `Open this link: ${portalLink()}\n\n` +
    `Important: sign in with this Google account → ${client.email}\n` +
    `(That's how it finds your page.)\n\n` +
    `Tip: after signing in, tap "Add to Home Screen" so it works like an app.\n\n` +
    `— ${coachName}`
  );
}

