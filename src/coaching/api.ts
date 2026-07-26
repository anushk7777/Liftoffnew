// Coaching micro-app — data layer over Supabase.
// Access control lives in RLS (supabase/coaching_setup.sql); everything here
// just queries and lets the database decide what each account may see.
import { useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * The coach's account(s). Only these logins see the roster & plan editors.
 *
 * Set `VITE_COACH_EMAIL` to override (comma-separated for more than one coach).
 * Vite bakes env vars in at BUILD time, so changing it on the host needs a
 * redeploy. The fallback keeps existing deployments working untouched.
 */
const COACH_EMAILS: string[] = (import.meta.env.VITE_COACH_EMAIL || 'anushkdua2508@gmail.com')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

/** Primary coach address — used for copy ("sign in as …"). */
export const COACH_EMAIL = COACH_EMAILS[0] ?? '';

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
  /** Local "HH:MM" for the daily weigh-in alarm. */
  alarm_time?: string | null;
  alarm_enabled?: boolean;
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
// Gender counts as part of a complete profile: it decides whether cycle
// tracking is offered, and a weight trend read without the cycle in view is
// misleading. Rows saved before it was required get asked once.
export const hasProfile = (c: CoachClient | null) =>
  !!c && c.height_cm != null && c.birth_year != null && !!c.sex;

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
  /** Client-flagged: on their period that day. Weight reads high — context
   *  for the coach so a spike isn't mistaken for lost progress. */
  menstruating: boolean;
}

export type MetricInput = Omit<Metric, 'id' | 'client_id'>;

/**
 * Session email, live-updated on auth changes. null = signed out.
 *
 * `getSession()` is wrapped: a rejection (offline, unusable refresh token,
 * Supabase unreachable) must never leave `loading` stuck true, or every
 * coach-gated surface would silently disappear with no way to tell why.
 */
export function useSessionEmail(): { email: string | null; loading: boolean; error: string | null } {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data: { session }, error: err }) => {
        if (!alive) return;
        if (err) setError(err.message);
        setEmail(session?.user?.email ?? null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        console.error('Coaching: could not read the auth session', err);
        setError(err instanceof Error ? err.message : 'Could not reach the auth service.');
        setLoading(false);
      });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!alive) return;
      setEmail(session?.user?.email ?? null);
      setLoading(false);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);
  return { email, loading, error };
}

export const isCoach = (email: string | null) =>
  !!email && COACH_EMAILS.includes(email.trim().toLowerCase());

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

/**
 * Read-only "am I on the roster?" check.
 *
 * Deliberately not `getMyClientRecord()`: that one *claims* the row by writing
 * user_id, which must only happen when someone actually opens their page — not
 * as a side effect of rendering the nav bar.
 */
export async function isEnrolledClient(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  const email = session?.user?.email;
  if (!email) return false;
  const { data, error } = await supabase
    .from('coaching_clients')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/**
 * Whether the signed-in account is on the coach's roster.
 *
 * Drives the in-app "Trainer" tab: a client the coach invited gets their
 * check-in template inside their own Liftoff, without having to use the
 * standalone /coaching portal. Both routes stay open — the portal is still
 * there for clients who'd rather install just that as a PWA.
 *
 * Skipped entirely for the coach's own account (`enabled: false`) so it costs
 * nothing on the roster side.
 */
export function useIsClient(email: string | null, enabled = true): { isClient: boolean; loading: boolean } {
  // The coach is never their own client, even if their address ended up on the
  // roster from testing the template — they get Clients, not Trainer.
  const active = enabled && !!email && !isCoach(email) && isSupabaseConfigured;
  // Answer is stamped with the address it was resolved for, so signing in as
  // someone else can never leave the previous account's tab on screen.
  const [res, setRes] = useState<{ email: string; isClient: boolean } | null>(null);
  useEffect(() => {
    if (!active || !email) return;
    let alive = true;
    isEnrolledClient()
      .then((enrolled) => {
        if (alive) setRes({ email, isClient: enrolled });
      })
      .catch((e: unknown) => {
        console.error('Could not check coaching enrolment', e);
        if (alive) setRes({ email, isClient: false });
      });
    return () => {
      alive = false;
    };
  }, [active, email]);
  const known = res && res.email === email ? res : null;
  return { isClient: active && !!known?.isClient, loading: active && !known };
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

/**
 * Save a check-in for a day. Saving the same day again EDITS that entry
 * instead of creating a duplicate, so clients can always correct a mistake.
 */
export async function saveMetric(clientId: string, m: Partial<MetricInput>): Promise<Metric> {
  // Local, not UTC. toISOString() would file anything logged before ~05:30 in
  // IST under the previous day; every other date in the app is a local day.
  const now = new Date();
  const localToday = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
  const day = m.taken_on ?? localToday;
  const { data, error } = await supabase
    .from('coaching_metrics')
    .upsert({ client_id: clientId, ...m, taken_on: day }, { onConflict: 'client_id,taken_on' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Back-compat alias — same upsert behaviour. */
export const addMetric = saveMetric;

/**
 * The most recent value recorded for each measurement, for use as placeholders.
 *
 * Resolved per field rather than per entry: a weight from yesterday and a waist
 * from three weeks ago are both "the last one you gave me", and taking a whole
 * row would blank the tape figures on every weight-only day.
 *
 * `before` excludes the day being edited and anything after it, so correcting
 * an old entry shows what preceded it rather than what came later.
 */
export function lastKnownValues(
  metrics: Metric[],
  before?: string,
): Partial<Record<keyof MetricInput, number>> {
  const fields: (keyof MetricInput)[] = [
    'weight_kg', 'chest_cm', 'waist_cm', 'hips_cm', 'arm_cm', 'thigh_cm',
  ];
  const older = (before ? metrics.filter((m) => m.taken_on < before) : metrics)
    .slice()
    .sort((a, b) => a.taken_on.localeCompare(b.taken_on));

  const out: Partial<Record<keyof MetricInput, number>> = {};
  for (const f of fields) {
    for (let i = older.length - 1; i >= 0; i--) {
      const v = older[i][f as keyof Metric];
      if (typeof v === 'number') {
        out[f] = v;
        break;
      }
    }
  }
  return out;
}

export async function deleteMetric(id: string): Promise<void> {
  const { error } = await supabase.from('coaching_metrics').delete().eq('id', id);
  if (error) throw error;
}

// ---- Profile (the one-time questions) -----------------------------------
export async function updateProfile(
  clientId: string,
  patch: Partial<Pick<CoachClient,
    'height_cm' | 'birth_year' | 'sex' | 'goal' | 'name' |
    'measure_weekday' | 'measure_cadence' | 'measure_anchor' | 'daily_weight' |
    'alarm_time' | 'alarm_enabled'>>,
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

/**
 * Remove one progress photo: the stored file, then the reference on the row.
 *
 * Order matters. Clearing the column first would orphan the file with nothing
 * left pointing at it; this way a failed storage delete leaves the row intact
 * and the photo still visible, which is recoverable. Storage errors are not
 * fatal — a file that is already gone (or was never uploaded, as with the
 * preview data) should still release its column.
 */
export async function deletePhoto(
  metricId: string,
  slot: 'front' | 'side',
  path: string | null,
): Promise<void> {
  if (path && !/^(https?:|data:)/.test(path)) {
    const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    if (error) console.error('Photo file could not be removed', error);
  }
  const column = slot === 'front' ? 'photo_front' : 'photo_side';
  const { error } = await supabase
    .from('coaching_metrics')
    .update({ [column]: null })
    .eq('id', metricId);
  if (error) throw error;
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

