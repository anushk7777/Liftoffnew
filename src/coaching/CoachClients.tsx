// Coach dashboard — only the coach's account can use this page (client-side
// gate here; the real enforcement is the RLS policies in Supabase).
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Users, Send, Trash2, ChevronLeft } from 'lucide-react';
import { PageHeader } from '../components/ui';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  useSessionEmail, isCoach, listClients, addClient, removeClient,
  listMetrics, listMessages, sendMessage, subscribeClient, ageFromBirthYear, notify, ensureNotificationPermission, updateProfile,
  unreadByClient, markClientMessagesRead,
  type CoachClient, type CoachMessage, type Metric,
} from './api';
import { TrendChart, MetricsHistory, BmiCard } from './components';
import { ProgressPhotos } from './photos';
import { CoachThread } from './onboarding';
import { InviteSheet } from './invite';
import { CheckinCalendar, ScheduleEditor } from './Calendar';
import { scheduleOf } from './schedule';

function metricPoints(metrics: Metric[], key: keyof Metric) {
  return metrics
    .filter((m) => typeof m[key] === 'number')
    .map((m) => ({ date: m.taken_on, value: m[key] as number }));
}

function ClientDetail({
  client,
  onBack,
  onInvite,
  onScheduleSaved,
}: {
  client: CoachClient;
  onBack: () => void;
  onInvite: (c: CoachClient) => void;
  onScheduleSaved: () => void;
}) {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const [m, msgs] = await Promise.all([listMetrics(client.id), listMessages(client.id)]);
    setMetrics(m);
    // Ping the coach when the client sends something new while this is open.
    const fresh = msgs.filter((x) => x.author === 'client' && !seenIds.current.has(x.id));
    if (seenIds.current.size > 0 && fresh.length) {
      const last = fresh[fresh.length - 1];
      void notify(
        last.kind === 'request' ? `${client.name} requested a diet plan` : `${client.name} sent a message`,
        last.body.slice(0, 120),
        `client-${client.id}`,
      );
    }
    msgs.forEach((x) => seenIds.current.add(x.id));
    setMessages(msgs);
    setLoaded(true);
  }, [client.id, client.name]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; state is set only after await
    void refresh();
    // Opening a client clears their unread badge.
    void markClientMessagesRead(client.id);
    return subscribeClient(client.id, () => void refresh());
  }, [client.id, refresh]);

  const saveSchedule = async (sch: {
    measure_weekday: number;
    measure_cadence: 'weekly' | 'biweekly';
    measure_anchor: string | null;
    daily_weight: boolean;
  }) => {
    setSavingSchedule(true);
    try {
      await updateProfile(client.id, sch);
      onScheduleSaved();
    } catch (e) {
      console.error('Failed to save schedule', e);
    } finally {
      setSavingSchedule(false);
    }
  };

  const reply = async (body: string) => {
    setSending(true);
    try {
      await sendMessage(client.id, 'coach', body);
      await refresh();
    } catch (e) {
      console.error('Failed to reply', e);
    } finally {
      setSending(false);
    }
  };

  const age = ageFromBirthYear(client.birth_year);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
          <ChevronLeft className="w-4 h-4" /> All clients
        </button>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={client.user_id
              ? { color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 14%, transparent)' }
              : { color: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 14%, transparent)' }}
          >
            {client.user_id ? 'Signed up' : 'Invite pending'}
          </span>
          <button
            onClick={() => onInvite(client)}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg text-[var(--accent-text)] transition-transform active:scale-95"
            style={{ background: 'var(--accent)' }}
            title="Send this client their page"
          >
            <Send className="w-3.5 h-3.5" /> Send page
          </button>
        </div>
      </div>

      <div>
        <h2 className="font-display text-[26px] font-bold tracking-tight text-[var(--text)]">{client.name}</h2>
        <p className="text-[13px] text-[var(--text-muted)] mt-0.5">{client.email}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-[13px] text-[var(--text-muted)]">
          {client.height_cm != null && (
            <span><b className="text-[var(--text)] font-semibold">{client.height_cm}</b> cm</span>
          )}
          {age != null && <span><b className="text-[var(--text)] font-semibold">{age}</b> yrs</span>}
          {client.sex && <span>{client.sex}</span>}
          {client.goal && (
            <span className="px-2 py-0.5 rounded-full text-[12px] font-medium" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              {client.goal}
            </span>
          )}
        </div>
      </div>

      {!loaded ? (
        <p className="text-sm text-[var(--text-subtle)] animate-pulse py-8">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TrendChart title="Weight" unit="kg" points={metricPoints(metrics, 'weight_kg')} />
            <TrendChart title="Waist" unit="cm" points={metricPoints(metrics, 'waist_cm')} />
          </div>
          <ScheduleEditor schedule={scheduleOf(client)} onSave={saveSchedule} saving={savingSchedule} />
          <CheckinCalendar metrics={metrics} schedule={scheduleOf(client)} />
          <BmiCard metrics={metrics} heightCm={client.height_cm} />
          <ProgressPhotos metrics={metrics} />
          <CoachThread messages={messages} author="coach" onSend={reply} sending={sending} />
          <MetricsHistory metrics={metrics} />
        </>
      )}
    </motion.div>
  );
}

export default function CoachClients() {
  const { email, loading } = useSessionEmail();
  const [clients, setClients] = useState<CoachClient[]>([]);
  const [selected, setSelected] = useState<CoachClient | null>(null);
  const [name, setName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [inviting, setInviting] = useState<CoachClient | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, counts] = await Promise.all([listClients(), unreadByClient().catch(() => ({}))]);
      setClients(list);
      setUnread(counts);
    } catch (e) {
      console.error('Failed to load clients', e);
    }
  }, []);

  useEffect(() => {
    if (!isCoach(email)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; state set after await
    void refresh();
    // So client requests can ping the coach even when this tab is in the back.
    void ensureNotificationPermission();
  }, [email, refresh]);

  if (!loading && !isCoach(email)) {
    return (
      <div className="py-20 text-center">
        <h1 className="font-display text-[28px] font-bold text-ink">Coach access only</h1>
        <p className="text-sm text-ink-muted mt-2">This area belongs to the coach's account.</p>
      </div>
    );
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !newEmail.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const created = await addClient(name, newEmail);
      setName('');
      setNewEmail('');
      await refresh();
      // Adding someone is only useful once they receive the link.
      setInviting(created);
    } catch (err) {
      console.error(err);
      setError('Could not add — is that email already on the roster?');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: CoachClient) => {
    if (!window.confirm(`Remove ${c.name} and all their data?`)) return;
    await removeClient(c.id);
    if (selected?.id === c.id) setSelected(null);
    await refresh();
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Clients"
        subtitle="Your coaching roster — each client gets a private template page."
      />

      {!isSupabaseConfigured && (
        <div className="mb-6 rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
          Supabase isn't configured in this environment — set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
          and run supabase/coaching_setup.sql to activate coaching.
        </div>
      )}

      {selected ? (
        <ClientDetail
          client={selected}
          onBack={() => {
            setSelected(null);
            void refresh();
          }}
          onInvite={setInviting}
          onScheduleSaved={() => void refresh()}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {/* Add client */}
          <form
            onSubmit={add}
            className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5 flex flex-col sm:flex-row gap-3"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Client name"
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
            />
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="their-google@gmail.com"
              type="email"
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
            />
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              type="submit"
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-[var(--accent-text)] disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              <UserPlus className="w-4 h-4" /> Add client
            </motion.button>
          </form>
          {error && <p className="text-sm -mt-2" style={{ color: 'var(--danger)' }}>{error}</p>}

          {/* Roster */}
          {clients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] p-12 text-center">
              <Users className="w-8 h-8 mx-auto text-[var(--text-subtle)]" />
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                No clients yet. Add one above, then send them the portal link — they sign in with
                Google and their account links up automatically.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {clients.map((c, i) => (
                <motion.button
                  key={c.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i }}
                  onClick={() => setSelected(c)}
                  className="lift group text-left rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 flex items-center gap-4"
                  style={{ boxShadow: 'var(--shadow-sm)' }}
                >
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-[15px] font-bold shrink-0"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                  >
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-[var(--text)] truncate">{c.name}</span>
                    <span className="block text-[12.5px] text-[var(--text-muted)] truncate">{c.email}</span>
                  </span>
                  {unread[c.id] > 0 && (
                    <span
                      className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0"
                      style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
                      title={`${unread[c.id]} unread`}
                    >
                      {unread[c.id]}
                    </span>
                  )}
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                    style={c.user_id
                      ? { color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 14%, transparent)' }
                      : { color: 'var(--warning)', background: 'color-mix(in srgb, var(--warning) 14%, transparent)' }}
                  >
                    {c.user_id ? 'Active' : 'Invited'}
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setInviting(c);
                    }}
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-transform active:scale-95"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                    title="Send this client their page"
                  >
                    <Send className="w-3.5 h-3.5" /> Send
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(c);
                    }}
                    className="p-2 rounded-lg text-[var(--text-subtle)] opacity-0 group-hover:opacity-100 hover:text-[var(--danger)] transition-all"
                    title="Remove client"
                  >
                    <Trash2 className="w-4 h-4" />
                  </span>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {inviting && <InviteSheet client={inviting} onClose={() => setInviting(null)} />}
      </AnimatePresence>
    </div>
  );
}
