// Coaching micro-app — first-run pieces: the "install this as an app" guide,
// the one-time profile questions, and the coach conversation thread.
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Share, Plus, MoreVertical, X, Bell, Send, Sparkles, Check, Pencil, Ruler,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  ageFromBirthYear, ensureNotificationPermission,
  type CoachClient, type CoachMessage,
} from './api';

const tnum = { fontVariantNumeric: 'tabular-nums' } as const;
type Platform = 'ios' | 'android' | 'desktop';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Shown the first time a signed-in client lands on their page: explains how to
 * install the portal as an app, and turns on notifications. Android/Chromium
 * gets the native install prompt; iOS gets the manual Share → Add to Home
 * Screen steps (Safari never fires beforeinstallprompt).
 */
export function InstallGuide({ onClose }: { onClose: () => void }) {
  const platform = useMemo(() => detectPlatform(), []);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [notifState, setNotifState] = useState<string>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  const enableNotifications = async () => {
    setNotifState(await ensureNotificationPermission());
  };

  const steps: { icon: React.ReactNode; text: React.ReactNode }[] =
    platform === 'ios'
      ? [
          { icon: <Share className="w-4 h-4" />, text: <>Tap the <b>Share</b> button in Safari's toolbar</> },
          { icon: <Plus className="w-4 h-4" />, text: <>Choose <b>Add to Home Screen</b></> },
          { icon: <Check className="w-4 h-4" />, text: <>Open it from your home screen — full screen, no browser bar</> },
        ]
      : platform === 'android'
        ? [
            { icon: <MoreVertical className="w-4 h-4" />, text: <>Tap the <b>⋮</b> menu in Chrome</> },
            { icon: <Plus className="w-4 h-4" />, text: <>Choose <b>Install app</b> / <b>Add to Home screen</b></> },
            { icon: <Check className="w-4 h-4" />, text: <>Launch it like any other app</> },
          ]
        : [
            { icon: <Plus className="w-4 h-4" />, text: <>Click the <b>install icon</b> in your browser's address bar</> },
            { icon: <Check className="w-4 h-4" />, text: <>Liftoff opens in its own window</> },
          ];

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="relative w-full max-w-md rounded-3xl border border-[var(--border)] p-7"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 220, damping: 18 }}
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--timer-1), var(--timer-3))' }}
        >
          <Sparkles className="w-7 h-7 text-white" />
        </motion.div>

        <h2 className="font-display text-[24px] font-bold tracking-tight text-[var(--text)] mt-4">
          Install for the best experience
        </h2>
        <p className="text-[14px] text-[var(--text-muted)] mt-1.5">
          Add this to your home screen so check-ins take seconds — and so your coach's replies reach you.
        </p>

        <ol className="mt-5 flex flex-col gap-3">
          {steps.map((s, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.18 + i * 0.08 }}
              className="flex items-center gap-3 text-[14px] text-[var(--text)]"
            >
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                {s.icon}
              </span>
              <span className="text-[var(--text-muted)] [&_b]:text-[var(--text)] [&_b]:font-semibold">{s.text}</span>
            </motion.li>
          ))}
        </ol>

        <div className="mt-6 flex flex-col gap-2.5">
          {deferred && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={install}
              className="w-full py-3 rounded-xl text-[15px] font-semibold text-[var(--accent-text)]"
              style={{ background: 'var(--accent)' }}
            >
              Install now
            </motion.button>
          )}

          <button
            onClick={enableNotifications}
            disabled={notifState === 'granted' || notifState === 'unsupported'}
            className="w-full py-3 rounded-xl text-[14px] font-semibold border border-[var(--border)] text-[var(--text)] hover:border-[var(--border-strong)] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            <Bell className="w-4 h-4" />
            {notifState === 'granted'
              ? 'Notifications on'
              : notifState === 'denied'
                ? 'Notifications blocked in browser'
                : notifState === 'unsupported'
                  ? 'Notifications not supported here'
                  : 'Turn on notifications'}
          </button>

          <button onClick={onClose} className="w-full py-2 text-[13px] font-medium text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors">
            Maybe later
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ---- One-time profile questions -----------------------------------------
const GOALS = ['Lose fat', 'Build muscle', 'Get stronger', 'Stay healthy'];

export function ProfileSetup({
  name,
  onSave,
  saving,
}: {
  name: string;
  onSave: (p: { height_cm: number; birth_year: number; sex: string | null; goal: string | null }) => void;
  saving: boolean;
}) {
  const [height, setHeight] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);

  // Gender is required, not a nicety: it decides whether cycle tracking appears,
  // and weight read without the cycle in view is misleading.
  const missing: string[] = [];
  if (!(Number(height) > 80 && Number(height) < 260)) missing.push('height in cm');
  if (!(Number(age) > 5 && Number(age) < 110)) missing.push('age');
  if (!sex) missing.push('gender');
  const valid = missing.length === 0;

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 24 }}
        className="w-full max-w-md rounded-3xl border border-[var(--border)] p-7"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}
      >
        <span
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <Ruler className="w-6 h-6" />
        </span>
        <h1 className="font-display text-[26px] font-bold tracking-tight text-[var(--text)] mt-4">
          Hey {name.split(' ')[0]} — quick setup
        </h1>
        <p className="text-[14px] text-[var(--text-muted)] mt-1.5">
          Just once. We'll never ask for these again — you can change them in Profile anytime.
        </p>

        <div className="grid grid-cols-2 gap-3 mt-6">
          <label className="block">
            <span className="text-[11px] text-[var(--text-muted)]">Height (cm)</span>
            <input
              type="number"
              inputMode="decimal"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="175"
              autoFocus
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              style={tnum}
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-[var(--text-muted)]">Age</span>
            <input
              type="number"
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="28"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              style={tnum}
            />
          </label>
        </div>

        <div className="mt-4">
          <span className="text-[11px] text-[var(--text-muted)]">Gender</span>
          <div className="flex gap-2 mt-1.5">
            {['Male', 'Female', 'Other'].map((s) => (
              <button
                key={s}
                onClick={() => setSex(sex === s ? null : s)}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-[13px] font-medium border transition-colors',
                  sex === s
                    ? 'text-[var(--accent-text)] border-transparent'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]',
                )}
                style={sex === s ? { background: 'var(--accent)' } : undefined}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <span className="text-[11px] text-[var(--text-muted)]">Main goal (optional)</span>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {GOALS.map((g) => (
              <button
                key={g}
                onClick={() => setGoal(goal === g ? null : g)}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-[13px] font-medium border transition-colors',
                  goal === g
                    ? 'text-[var(--accent-text)] border-transparent'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]',
                )}
                style={goal === g ? { background: 'var(--accent)' } : undefined}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* A disabled button with no explanation reads as a broken app. Say
            exactly what is still needed. */}
        <AnimatePresence initial={false}>
          {!valid && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-[12.5px] text-[var(--text-muted)] mt-5 overflow-hidden"
            >
              Still need your <b className="text-[var(--text)] font-semibold">{missing.join(', ')}</b>.
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: valid ? 1.02 : 1 }}
          whileTap={{ scale: valid ? 0.98 : 1 }}
          disabled={!valid || saving}
          onClick={() =>
            onSave({
              height_cm: Number(height),
              birth_year: new Date().getFullYear() - Number(age),
              sex,
              goal,
            })
          }
          className="mt-3 w-full py-3.5 rounded-xl text-[15px] font-semibold text-[var(--accent-text)] disabled:opacity-40 transition-opacity"
          style={{ background: 'var(--accent)' }}
        >
          {saving ? 'Saving…' : "Let's go"}
        </motion.button>
      </motion.div>
    </div>
  );
}

/** Compact profile strip with inline editing — the "settings" for the portal. */
export function ProfileCard({
  client,
  onSave,
  saving,
}: {
  client: CoachClient;
  onSave: (p: { height_cm: number; birth_year: number; goal: string | null }) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const age = ageFromBirthYear(client.birth_year);
  const [height, setHeight] = useState(client.height_cm?.toString() ?? '');
  const [ageInput, setAgeInput] = useState(age?.toString() ?? '');
  const [goal, setGoal] = useState(client.goal);

  return (
    <section
      className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">Profile</span>
        <button
          onClick={() => setEditing((e) => !e)}
          className="p-1.5 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
          aria-label="Edit profile"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

      <AnimatePresence mode="wait">
        {editing ? (
          <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] text-[var(--text-muted)]">Height (cm)</span>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  style={tnum}
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-[var(--text-muted)]">Age</span>
                <input
                  type="number"
                  value={ageInput}
                  onChange={(e) => setAgeInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  style={tnum}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {GOALS.map((g) => (
                <button
                  key={g}
                  onClick={() => setGoal(goal === g ? null : g)}
                  className={cn(
                    'px-3 py-1 rounded-full text-[12.5px] font-medium border transition-colors',
                    goal === g ? 'text-[var(--accent-text)] border-transparent' : 'border-[var(--border)] text-[var(--text-muted)]',
                  )}
                  style={goal === g ? { background: 'var(--accent)' } : undefined}
                >
                  {g}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                onSave({
                  height_cm: Number(height),
                  birth_year: new Date().getFullYear() - Number(ageInput),
                  goal,
                });
                setEditing(false);
              }}
              disabled={saving}
              className="mt-4 w-full py-2.5 rounded-lg text-sm font-semibold text-[var(--accent-text)] disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </motion.div>
        ) : (
          <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-wrap gap-x-8 gap-y-2 mt-3">
            <div>
              <div className="text-[19px] font-bold text-[var(--text)]" style={tnum}>
                {client.height_cm ?? '—'}<span className="text-[12px] text-[var(--text-muted)] font-medium ml-0.5">cm</span>
              </div>
              <div className="text-[11px] text-[var(--text-subtle)]">Height</div>
            </div>
            <div>
              <div className="text-[19px] font-bold text-[var(--text)]" style={tnum}>{age ?? '—'}</div>
              <div className="text-[11px] text-[var(--text-subtle)]">Age</div>
            </div>
            {client.goal && (
              <div>
                <div className="text-[19px] font-bold text-[var(--text)]">{client.goal}</div>
                <div className="text-[11px] text-[var(--text-subtle)]">Goal</div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ---- Coach conversation --------------------------------------------------
function timeLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function CoachThread({
  messages,
  author,
  onSend,
  sending,
}: {
  messages: CoachMessage[];
  author: 'client' | 'coach';
  onSend: (body: string, kind?: 'note' | 'request') => void;
  sending: boolean;
}) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the thread pinned to its newest message by scrolling the LIST, never
  // the page — scrollIntoView here used to yank the whole portal down on load.
  const firstRun = useRef(true);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: firstRun.current ? 'auto' : 'smooth' });
    firstRun.current = false;
  }, [messages.length]);

  const send = (kind: 'note' | 'request' = 'note') => {
    const body = text.trim();
    if (!body || sending) return;
    onSend(body, kind);
    setText('');
  };

  return (
    <section
      className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5 flex flex-col"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">
          {author === 'client' ? 'Your coach' : 'Conversation'}
        </span>
      </div>

      <div ref={listRef} className="flex flex-col gap-2.5 max-h-[340px] overflow-y-auto overscroll-contain no-scrollbar py-1">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--text-subtle)] py-6 text-center">
            {author === 'client'
              ? 'No messages yet. Ask your coach anything.'
              : 'No messages from this client yet.'}
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.author === author;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn('flex flex-col max-w-[85%]', mine ? 'self-end items-end' : 'self-start items-start')}
              >
                <div
                  className={cn('rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap')}
                  style={
                    mine
                      ? { background: 'var(--accent)', color: 'var(--accent-text)' }
                      : { background: 'var(--elevated)', color: 'var(--text)' }
                  }
                >
                  {m.body}
                </div>
                <span className="text-[10.5px] text-[var(--text-subtle)] mt-1 px-1">{timeLabel(m.created_at)}</span>
              </motion.div>
            );
          })
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={author === 'client' ? 'Message your coach…' : 'Reply to your client…'}
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
          />
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => send()}
            disabled={!text.trim() || sending}
            className="w-11 shrink-0 rounded-xl flex items-center justify-center text-[var(--accent-text)] disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </section>
  );
}
