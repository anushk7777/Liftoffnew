// Client-facing coaching portal — a standalone full-bleed page at /coaching.
// A client signs in with Google; if their coach added their email to the
// roster, their account links up and they land on their template: a one-time
// profile setup, then check-ins, progress graphs, and a direct line to their
// coach (including "request a diet plan").
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Lenis from 'lenis';
import { LogOut, Sparkles, Smartphone } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  useSessionEmail, getMyClientRecord, listMetrics, addMetric, listMessages, sendMessage,
  updateProfile, subscribeClient, hasProfile, notify, ensureNotificationPermission, useInstallGuide, isStandalone,
  uploadPhoto, maybeRemindCheckin, daysSinceCheckin,
  type CoachClient, type CoachMessage, type Metric, type MetricInput,
} from './api';
import {
  AnimatedGreeting, TrendChart, MetricsForm, MetricsHistory, CheckinDueBanner, BmiCard,
} from './components';
import { ProgressPhotos } from './photos';
import { InstallGuide, ProfileSetup, ProfileCard, CoachThread } from './onboarding';

// Sample data so the coach can preview the exact template at /coaching?preview=1.
const SAMPLE_CLIENT: CoachClient = {
  id: 'p', name: 'Aarav Sharma', email: 'aarav@example.com', user_id: 'p',
  created_at: '', height_cm: 178, birth_year: 1998, sex: 'Male', goal: 'Lose fat',
};
const SAMPLE_METRICS: Metric[] = [
  { id: 'p1', client_id: 'p', taken_on: '2026-06-02', weight_kg: 84.2, height_cm: null, chest_cm: 104, waist_cm: 92, hips_cm: 101, arm_cm: 36, thigh_cm: 58, notes: null, photo_front: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=600&q=70', photo_side: null },
  { id: 'p2', client_id: 'p', taken_on: '2026-06-16', weight_kg: 82.8, height_cm: null, chest_cm: 104, waist_cm: 90, hips_cm: 100, arm_cm: 36.4, thigh_cm: 58, notes: 'Slept better', photo_front: null, photo_side: null },
  { id: 'p3', client_id: 'p', taken_on: '2026-06-30', weight_kg: 81.5, height_cm: null, chest_cm: 105, waist_cm: 88.5, hips_cm: 99, arm_cm: 36.8, thigh_cm: 58.5, notes: null, photo_front: null, photo_side: null },
  { id: 'p4', client_id: 'p', taken_on: '2026-07-14', weight_kg: 80.6, height_cm: null, chest_cm: 105, waist_cm: 87, hips_cm: 98.5, arm_cm: 37.2, thigh_cm: 59, notes: 'PR on squats', photo_front: 'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=600&q=70', photo_side: null },
];
const SAMPLE_MESSAGES: CoachMessage[] = [
  { id: 'm1', client_id: 'p', author: 'client', kind: 'request', body: 'Requesting a diet plan, please.', read_at: null, created_at: '2026-07-10T09:00:00Z' },
  { id: 'm2', client_id: 'p', author: 'coach', kind: 'note', body: "On it — sending your plan tonight. Keep protein at 1.8g/kg until then.", read_at: null, created_at: '2026-07-10T12:30:00Z' },
];

function metricPoints(metrics: Metric[], key: keyof Metric) {
  return metrics
    .filter((m) => typeof m[key] === 'number')
    .map((m) => ({ date: m.taken_on, value: m[key] as number }));
}

/** Premium inertial scrolling — the whole portal glides instead of jumping. */
function useSmoothScroll(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ duration: 1.05, smoothWheel: true });
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [enabled]);
}

/** Fades + lifts a section into view as it enters the viewport. */
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ delay, duration: 0.55, ease: [0.21, 1, 0.4, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Template({
  client, metrics, messages, saving, sending, dueDays, onDismissDue,
  onLog, onSend, onProfile, onSignOut, onInstall,
}: {
  client: CoachClient;
  metrics: Metric[];
  messages: CoachMessage[];
  saving: boolean;
  sending: boolean;
  dueDays?: number | null;
  onDismissDue?: () => void;
  onLog: (m: Partial<MetricInput>, photos: { front: File | null; side: File | null }) => void;
  onSend: (body: string, kind?: 'note' | 'request') => void;
  onProfile: (p: { height_cm: number; birth_year: number; goal: string | null }) => void;
  onSignOut?: () => void;
  onInstall?: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 sm:px-8 py-10 pb-28 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <AnimatedGreeting
          name={client.name.split(' ')[0]}
          subtitle="Log today's check-in and see how far you've come."
        />
        <div className="flex items-center gap-1 shrink-0 mt-2">
          {onInstall && !isStandalone() && (
            <button
              onClick={onInstall}
              className="p-2.5 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
              title="Install as an app"
            >
              <Smartphone className="w-[18px] h-[18px]" />
            </button>
          )}
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="p-2.5 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
              title="Sign out"
            >
              <LogOut className="w-[18px] h-[18px]" />
            </button>
          )}
        </div>
      </div>

      {dueDays !== undefined && onDismissDue && (
        <CheckinDueBanner days={dueDays} onDismiss={onDismissDue} />
      )}

      <Reveal delay={0.45}>
        <ProfileCard client={client} onSave={onProfile} saving={saving} />
      </Reveal>

      <Reveal delay={0.05}>
        <MetricsForm onSubmit={onLog} saving={saving} />
      </Reveal>

      <Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TrendChart title="Weight" unit="kg" points={metricPoints(metrics, 'weight_kg')} />
          <TrendChart title="Waist" unit="cm" points={metricPoints(metrics, 'waist_cm')} />
        </div>
      </Reveal>

      <Reveal>
        <BmiCard metrics={metrics} heightCm={client.height_cm} />
      </Reveal>

      <Reveal>
        <ProgressPhotos metrics={metrics} />
      </Reveal>

      <Reveal>
        <CoachThread messages={messages} author="client" onSend={onSend} sending={sending} />
      </Reveal>

      <Reveal>
        <MetricsHistory metrics={metrics} />
      </Reveal>
    </div>
  );
}

export default function ClientPortal() {
  const preview = new URLSearchParams(window.location.search).has('preview');
  const { email, loading: authLoading } = useSessionEmail();
  const [client, setClient] = useState<CoachClient | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [state, setState] = useState<'loading' | 'not-enrolled' | 'ready'>('loading');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [dueDismissed, setDueDismissed] = useState(false);
  const remindedRef = useRef(false);
  const signedOut = !authLoading && !email;

  const ready = state === 'ready' && !!client;
  useSmoothScroll(ready || preview);
  const installGuide = useInstallGuide(ready);

  // Notify on a new coach reply (only for messages that arrive while open).
  const seenIds = useRef<Set<string>>(new Set());

  const refresh = useCallback(async (c: CoachClient) => {
    const [m, msgs] = await Promise.all([listMetrics(c.id), listMessages(c.id)]);
    setMetrics(m);
    const fresh = msgs.filter((x) => x.author === 'coach' && !seenIds.current.has(x.id));
    if (seenIds.current.size > 0 && fresh.length) {
      const last = fresh[fresh.length - 1];
      void notify('Your coach replied', last.body.slice(0, 120), 'coach-reply');
    }
    msgs.forEach((x) => seenIds.current.add(x.id));
    setMessages(msgs);
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

  // Live updates: coach replies / plan changes land immediately.
  useEffect(() => {
    if (!client || preview) return;
    return subscribeClient(client.id, () => void refresh(client));
  }, [client, preview, refresh]);

  // Weekly check-in nudge — fires once when the portal opens and one is due.
  useEffect(() => {
    if (state !== 'ready' || preview || remindedRef.current) return;
    remindedRef.current = true;
    maybeRemindCheckin(metrics, client?.reminders_enabled !== false);
  }, [state, preview, metrics, client]);

  const signIn = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/coaching` },
    });

  const signOut = async () => {
    await supabase.auth.signOut();
    setClient(null);
    setState('loading');
  };

  const log = async (m: Partial<MetricInput>, photos: { front: File | null; side: File | null }) => {
    if (!client) return;
    setSaving(true);
    try {
      const withPhotos = { ...m };
      if (photos.front) withPhotos.photo_front = await uploadPhoto(client.id, photos.front, 'front');
      if (photos.side) withPhotos.photo_side = await uploadPhoto(client.id, photos.side, 'side');
      await addMetric(client.id, withPhotos);
      setDueDismissed(true);
      await refresh(client);
    } catch (e) {
      console.error('Failed to save check-in', e);
    } finally {
      setSaving(false);
    }
  };

  const send = async (body: string, kind: 'note' | 'request' = 'note') => {
    if (!client) return;
    setSending(true);
    try {
      await sendMessage(client.id, 'client', body, kind);
      await refresh(client);
    } catch (e) {
      console.error('Failed to send message', e);
    } finally {
      setSending(false);
    }
  };

  const saveProfile = async (p: {
    height_cm: number;
    birth_year: number;
    sex?: string | null;
    goal: string | null;
  }) => {
    if (!client) return;
    setSaving(true);
    try {
      setClient(await updateProfile(client.id, p));
      void ensureNotificationPermission();
    } catch (e) {
      console.error('Failed to save profile', e);
    } finally {
      setSaving(false);
    }
  };

  // Show the banner when a check-in is overdue (or none exists yet).
  const sinceCheckin = daysSinceCheckin(metrics);
  const checkinDue = sinceCheckin === null || sinceCheckin >= 7 ? sinceCheckin : undefined;

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
          client={SAMPLE_CLIENT}
          metrics={SAMPLE_METRICS}
          messages={SAMPLE_MESSAGES}
          saving={false}
          sending={false}
          onLog={() => {}}
          onSend={() => {}}
          onProfile={() => {}}
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

  if (!client) return shell(null);

  // One-time questions — height/age are asked here and never again.
  if (!hasProfile(client)) {
    return shell(<ProfileSetup name={client.name} onSave={saveProfile} saving={saving} />);
  }

  return shell(
    <>
      <AnimatePresence>
        {installGuide.open && <InstallGuide onClose={installGuide.close} />}
      </AnimatePresence>
      <Template
        client={client}
        metrics={metrics}
        messages={messages}
        saving={saving}
        sending={sending}
        dueDays={dueDismissed ? undefined : checkinDue}
        onDismissDue={() => setDueDismissed(true)}
        onLog={log}
        onSend={send}
        onProfile={saveProfile}
        onSignOut={signOut}
        onInstall={installGuide.reopen}
      />
    </>,
  );
}
