// Client-facing coaching portal — a standalone full-bleed page at /coaching.
// A client signs in with Google; if their coach added their email to the
// roster, their account links up and they land on their template: check-in
// form, progress graphs, and the plan the coach publishes (updates live).
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { LogOut, Sparkles } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  useSessionEmail, getMyClientRecord, listMetrics, addMetric, getPlan, subscribeClient,
  type CoachClient, type Metric, type MetricInput, type Plan,
} from './api';
import { AnimatedGreeting, TrendChart, PlanCard, MetricsForm, MetricsHistory } from './components';

// Sample data so the coach can preview the exact template at /coaching?preview=1.
const SAMPLE_METRICS: Metric[] = [
  { id: 'p1', client_id: 'p', taken_on: '2026-06-02', weight_kg: 84.2, height_cm: 178, chest_cm: 104, waist_cm: 92, hips_cm: 101, arm_cm: 36, thigh_cm: 58, notes: null },
  { id: 'p2', client_id: 'p', taken_on: '2026-06-16', weight_kg: 82.8, height_cm: 178, chest_cm: 104, waist_cm: 90, hips_cm: 100, arm_cm: 36.4, thigh_cm: 58, notes: 'Slept better' },
  { id: 'p3', client_id: 'p', taken_on: '2026-06-30', weight_kg: 81.5, height_cm: 178, chest_cm: 105, waist_cm: 88.5, hips_cm: 99, arm_cm: 36.8, thigh_cm: 58.5, notes: null },
  { id: 'p4', client_id: 'p', taken_on: '2026-07-14', weight_kg: 80.6, height_cm: 178, chest_cm: 105, waist_cm: 87, hips_cm: 98.5, arm_cm: 37.2, thigh_cm: 59, notes: 'PR on squats' },
];
const SAMPLE_PLAN: Plan = {
  client_id: 'p',
  diet_plan: 'Breakfast — 4 egg whites + 2 whole eggs, oats with berries\nLunch — 200g chicken breast, rice, salad\nSnack — Greek yogurt + almonds\nDinner — Paneer / fish, vegetables, roti x2\nHydration — 3.5L water minimum',
  calorie_target: 2200,
  protein_target: 160,
  updated_at: new Date().toISOString(),
};

function metricPoints(metrics: Metric[], key: keyof Metric) {
  return metrics
    .filter((m) => typeof m[key] === 'number')
    .map((m) => ({ date: m.taken_on, value: m[key] as number }));
}

function Template({
  client, metrics, plan, saving, updatedLive, onLog, onSignOut,
}: {
  client: { name: string };
  metrics: Metric[];
  plan: Plan | null;
  saving: boolean;
  updatedLive: boolean;
  onLog: (m: Partial<MetricInput>) => void;
  onSignOut?: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 sm:px-8 py-10 pb-24 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <AnimatedGreeting name={client.name.split(' ')[0]} subtitle="Log today's check-in and see how far you've come." />
        {onSignOut && (
          <button
            onClick={onSignOut}
            className="shrink-0 mt-2 p-2.5 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
            title="Sign out"
          >
            <LogOut className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <PlanCard plan={plan} updatedLive={updatedLive} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.62 }}>
        <MetricsForm onSubmit={onLog} saving={saving} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.74 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <TrendChart title="Weight" unit="kg" points={metricPoints(metrics, 'weight_kg')} />
        <TrendChart title="Waist" unit="cm" points={metricPoints(metrics, 'waist_cm')} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.86 }}>
        <MetricsHistory metrics={metrics} />
      </motion.div>
    </div>
  );
}

export default function ClientPortal() {
  const preview = new URLSearchParams(window.location.search).has('preview');
  const { email, loading: authLoading } = useSessionEmail();
  const [client, setClient] = useState<CoachClient | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [state, setState] = useState<'loading' | 'not-enrolled' | 'ready'>('loading');
  const [saving, setSaving] = useState(false);
  const [updatedLive, setUpdatedLive] = useState(false);
  // Signed-out is derived, never set: the auth listener flips `email` and the
  // render below picks the right screen.
  const signedOut = !authLoading && !email;

  const refresh = useCallback(async (c: CoachClient) => {
    const [m, p] = await Promise.all([listMetrics(c.id), getPlan(c.id)]);
    setMetrics(m);
    setPlan(p);
  }, []);

  useEffect(() => {
    if (preview || authLoading || !email) return;
    let cancel = false;
    (async () => {
      try {
        const c = await getMyClientRecord();
        if (cancel) return;
        if (!c) {
          setState('not-enrolled');
          return;
        }
        setClient(c);
        await refresh(c);
        if (!cancel) setState('ready');
      } catch (e) {
        console.error('Coaching portal load failed', e);
        if (!cancel) setState('not-enrolled');
      }
    })();
    return () => {
      cancel = true;
    };
  }, [preview, email, authLoading, refresh]);

  // Live updates: when the coach publishes a plan, it appears immediately.
  useEffect(() => {
    if (!client || preview) return;
    return subscribeClient(client.id, () => {
      void refresh(client);
      setUpdatedLive(true);
      setTimeout(() => setUpdatedLive(false), 5000);
    });
  }, [client, preview, refresh]);

  const signIn = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/coaching` },
    });

  const signOut = async () => {
    await supabase.auth.signOut();
    setClient(null);
    setState('loading'); // the derived signedOut flag takes over the render
  };

  const log = async (m: Partial<MetricInput>) => {
    if (!client) return;
    setSaving(true);
    try {
      await addMetric(client.id, m);
      await refresh(client);
    } catch (e) {
      console.error('Failed to save check-in', e);
    } finally {
      setSaving(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="focus-daylight min-h-screen" style={{ background: 'var(--bg)' }}>
      {children}
    </div>
  );

  if (preview) {
    return shell(
      <>
        <div className="text-center pt-4">
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}>
            Template preview — sample data
          </span>
        </div>
        <Template
          client={{ name: 'Aarav' }}
          metrics={SAMPLE_METRICS}
          plan={SAMPLE_PLAN}
          saving={false}
          updatedLive={false}
          onLog={() => {}}
        />
      </>,
    );
  }

  if (authLoading) {
    return shell(
      <div className="min-h-screen flex items-center justify-center text-[var(--text-subtle)] animate-pulse">Loading…</div>,
    );
  }

  if (signedOut) {
    return shell(
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: 'linear-gradient(135deg, var(--timer-1), var(--timer-3))' }}
        >
          <Sparkles className="w-8 h-8 text-white" />
        </motion.div>
        <AnimatedGreeting name="champion" subtitle="Your coach set up a private progress page for you." />
        {!isSupabaseConfigured && (
          <p className="mt-6 text-sm" style={{ color: 'var(--warning)' }}>
            Cloud sync isn't configured on this deployment yet.
          </p>
        )}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={signIn}
          className="mt-8 px-8 py-3.5 rounded-full text-[15px] font-semibold text-[var(--accent-text)]"
          style={{ background: 'var(--accent)', boxShadow: '0 10px 30px -8px var(--accent)' }}
        >
          Continue with Google
        </motion.button>
      </div>,
    );
  }

  if (state === 'loading') {
    return shell(
      <div className="min-h-screen flex items-center justify-center text-[var(--text-subtle)] animate-pulse">Loading…</div>,
    );
  }

  if (state === 'not-enrolled') {
    return shell(
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <h1 className="font-display text-[28px] font-bold text-[var(--text)]">Almost there</h1>
        <p className="mt-3 max-w-sm text-[15px] text-[var(--text-muted)]">
          You're signed in as <b className="text-[var(--text)]">{email}</b>, but this email isn't on your
          coach's roster yet. Ask your coach to add it, then reload.
        </p>
        <button onClick={signOut} className="mt-6 text-sm font-semibold" style={{ color: 'var(--accent)' }}>
          Use a different account
        </button>
      </div>,
    );
  }

  return shell(
    client && (
      <Template
        client={client}
        metrics={metrics}
        plan={plan}
        saving={saving}
        updatedLive={updatedLive}
        onLog={log}
        onSignOut={signOut}
      />
    ),
  );
}
