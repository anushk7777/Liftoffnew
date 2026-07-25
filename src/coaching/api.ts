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
  patch: Partial<Pick<CoachClient, 'height_cm' | 'birth_year' | 'sex' | 'goal' | 'name'>>,
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
