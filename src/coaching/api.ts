// Coaching micro-app — data layer over Supabase.
// Access control lives in RLS (supabase/coaching_setup.sql); everything here
// just queries and lets the database decide what each account may see.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** The coach's account. Only this login sees the roster & plan editors. */
export const COACH_EMAIL = 'anushkdua2508@gmail.com';

export interface CoachClient {
  id: string;
  name: string;
  email: string;
  user_id: string | null;
  created_at: string;
}

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

/** Live updates: fire cb whenever this client's plan or metrics change. */
export function subscribeClient(clientId: string, cb: () => void): () => void {
  const ch = supabase
    .channel(`coaching-${clientId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'coaching_plans', filter: `client_id=eq.${clientId}` },
      cb,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'coaching_metrics', filter: `client_id=eq.${clientId}` },
      cb,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}
