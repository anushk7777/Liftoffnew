import { useState } from 'react';
import {
  Settings as SettingsIcon,
  Moon,
  Sun,
  Download,
  Upload,
  Timer,
  Target,
  Bell,
  Sparkles,
  Flame,
} from 'lucide-react';
import { format } from 'date-fns';
import { useStore } from '../store/useStore';
import { isSupabaseConfigured } from '../lib/supabase';
import { requestNotificationPermission, notificationPermission, notificationsSupported } from '../lib/reminders';
import { enablePush, disablePush, isPushSupported, isPushConfigured, pushPermission } from '../lib/push';
import { getApiKey, setApiKey, getModel, setModel, AI_MODELS } from '../lib/aicoach';
import type { AiModelId } from '../lib/aicoach';
import { useAppMode } from '../afterburn/mode';
import { useAfterburn } from '../afterburn/store';
import { useSessionEmail, isCoach } from '../coaching/api';
import { AccountRow } from '../components/AccountMenu';
import { cn } from '../lib/utils';
import { PageHeader } from '../components/ui';
import { DateTimePicker } from '../components/DateTimePicker';

export default function Settings() {
  const {
    theme,
    setTheme,
    targetDate,
    setTargetDate,
    reduceMotion,
    setReduceMotion,
    pomodoro,
    setPomodoro,
    exportData,
    importData,
    resetRoadmap,
    loadExampleRoadmap,
    phases,
  } = useStore();

  const setAppMode = useAppMode((s) => s.setMode);
  const noteRecallDays = useAfterburn((s) => s.noteRecallDays);
  const setNoteRecallDays = useAfterburn((s) => s.setNoteRecallDays);
  const resetIntros = useAppMode((s) => s.resetIntros);
  const [introStatus, setIntroStatus] = useState('');
  // Templates is the coaching workspace: coach's account only.
  const { email } = useSessionEmail();
  const coach = isCoach(email);
  const [importStatus, setImportStatus] = useState<{ msg: string; ok: boolean } | null>(null);
  const [reminders, setReminders] = useState(() => notificationPermission() === 'granted');
  const [push, setPush] = useState(() => isPushConfigured() && pushPermission() === 'granted');
  const [pushBusy, setPushBusy] = useState(false);
  const [aiKey, setAiKey] = useState(() => getApiKey());
  const [aiModel, setAiModelState] = useState<AiModelId>(() => getModel());
  const [aiStatus, setAiStatus] = useState('');

  const saveAiKey = () => {
    setApiKey(aiKey);
    setAiStatus(aiKey.trim() ? 'Saved on this device.' : 'Key removed.');
    setTimeout(() => setAiStatus(''), 4000);
  };
  const clearAiKey = () => {
    setApiKey('');
    setAiKey('');
    setAiStatus('Key removed.');
    setTimeout(() => setAiStatus(''), 4000);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const res = importData(ev.target?.result as string);
      setImportStatus(res.ok ? { msg: 'Backup imported successfully.', ok: true } : { msg: res.error, ok: false });
      setTimeout(() => setImportStatus(null), res.ok ? 3000 : 6000);
    };
    reader.onerror = () => {
      setImportStatus({ msg: "That file couldn't be read.", ok: false });
      setTimeout(() => setImportStatus(null), 6000);
    };
    // Let the same file be picked again after a failed attempt — without this
    // the input keeps its value and re-choosing it fires no change event.
    reader.onloadend = () => { e.target.value = ''; };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `liftoff-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-rise max-w-3xl">
      <PageHeader
        title="Settings"
        subtitle="Tune your workspace."
        icon={<SettingsIcon className="w-5 h-5" />}
      />

      <div className="space-y-8">
        {/* Account — which Google account this Liftoff is signed in to. The
            coaching tabs key off this address, so it needs to be visible. */}
        <Section title="Account" icon={<SettingsIcon className="w-4 h-4" />}>
          <div className="py-2">
            <AccountRow />
            <p className="text-xs text-ink-subtle mt-2">
              The Clients and Trainer tabs depend on which Google account you're signed in with.
            </p>
          </div>
        </Section>

        {/* Workspace */}
        <Section title="Workspace" icon={<Flame className="w-4 h-4" />}>
          <Row label="Switch app" desc="Jump to Liftoff Afterburn (workout logger) or the profile picker.">
            <div className="flex gap-2">
              <button onClick={() => setAppMode('afterburn')} className="btn btn-secondary !py-1.5 !px-3 text-xs">
                Afterburn
              </button>
              {coach && (
                <button onClick={() => setAppMode('templates')} className="btn btn-secondary !py-1.5 !px-3 text-xs">
                  Templates
                </button>
              )}
              <button onClick={() => setAppMode(null)} className="btn btn-secondary !py-1.5 !px-3 text-xs">
                Picker
              </button>
            </div>
          </Row>
          {/* How long a note you leave on a lift keeps coming back. One week by
              default — about one microcycle, so you meet the lift again while
              the note still applies, and then it expires instead of piling up. */}
          <Row
            label="Repeat workout notes for"
            desc="A note you leave on an exercise shows again next time you train it, until it expires."
          >
            <select
              value={String(noteRecallDays)}
              onChange={(e) => setNoteRecallDays(Number(e.target.value))}
              aria-label="How long workout notes repeat"
              className="input !w-auto !py-1.5 !px-2 text-xs min-h-[44px]"
            >
              <option value="0">Don't repeat</option>
              <option value="7">1 week</option>
              <option value="14">2 weeks</option>
              <option value="28">4 weeks</option>
              <option value="3650">Never expire</option>
            </select>
          </Row>
        </Section>

        {/* Appearance */}
        <Section title="Appearance">
          <Row label="Theme" desc="Dark-first, switch any time.">
            <div className="flex bg-elevated p-0.5 rounded-lg border border-border">
              {/* Icon-only, so they need a name for screen readers and a
                  tooltip for anyone unsure which is which. */}
              <ThemeBtn active={theme === 'light'} onClick={() => setTheme('light')} label="Light theme">
                <Sun className="w-4 h-4" />
              </ThemeBtn>
              <ThemeBtn active={theme === 'dark'} onClick={() => setTheme('dark')} label="Dark theme">
                <Moon className="w-4 h-4" />
              </ThemeBtn>
            </div>
          </Row>
          <Row label="Disable animations" desc="Turns off all motion everywhere — Liftoff and Afterburn.">
            <Toggle checked={reduceMotion} onChange={setReduceMotion} />
          </Row>
          <Row
            label="Workspace intros"
            desc="Each workspace plays its opening animation once. Replay them all."
          >
            <button
              onClick={() => {
                resetIntros();
                setIntroStatus('Intros will play again.');
                setTimeout(() => setIntroStatus(''), 4000);
              }}
              className="btn btn-secondary !py-1.5 !px-3 text-xs"
            >
              {introStatus || 'Play again'}
            </button>
          </Row>
        </Section>

        {/* Goal */}
        <Section title="Goal" icon={<Target className="w-4 h-4" />}>
          <Row label="Target date" desc="The day you land the role.">
            <span className="text-sm font-medium text-accent">
              {format(new Date(targetDate), 'MMMM d, yyyy')}
            </span>
          </Row>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {[
              { label: '3 months', months: 3 },
              { label: '6 months', months: 6 },
              { label: '9 months', months: 9 },
              { label: '12 months', months: 12 },
            ].map(({ label, months }) => {
              const d = new Date();
              d.setMonth(d.getMonth() + months);
              const val = format(d, 'yyyy-MM-dd');
              return (
                <button
                  key={label}
                  onClick={() => setTargetDate(val)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    targetDate === val
                      ? 'bg-accent text-[var(--accent-text)]'
                      : 'bg-elevated border border-border text-ink-muted hover:text-ink hover:bg-hover',
                  )}
                >
                  {label}
                </button>
              );
            })}
            <DateTimePicker
              mode="date"
              clearable={false}
              placeholder="Custom date"
              value={targetDate}
              onChange={(v) => v && setTargetDate(v)}
            />
          </div>
        </Section>

        {/* Pomodoro */}
        <Section title="Focus timer" icon={<Timer className="w-4 h-4" />}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <NumField
              label="Focus (min)"
              value={pomodoro.focusMins}
              onChange={(v) => setPomodoro({ focusMins: v })}
            />
            <NumField
              label="Short break"
              value={pomodoro.shortBreakMins}
              onChange={(v) => setPomodoro({ shortBreakMins: v })}
            />
            <NumField
              label="Long break"
              value={pomodoro.longBreakMins}
              onChange={(v) => setPomodoro({ longBreakMins: v })}
            />
            <NumField
              label="Rounds / long"
              value={pomodoro.roundsBeforeLong}
              onChange={(v) => setPomodoro({ roundsBeforeLong: v })}
            />
          </div>
        </Section>

        {/* Reminders */}
        <Section title="Reminders" icon={<Bell className="w-4 h-4" />}>
          <Row
            label="Task reminders"
            desc="Notify me when a scheduled task is due."
          >
            <Toggle
              checked={reminders}
              onChange={async (v) => {
                if (v) setReminders(await requestNotificationPermission());
                else setReminders(false);
              }}
            />
          </Row>
          {notificationPermission() === 'denied' && (
            <p className="text-xs text-danger mb-2">
              Notifications are blocked in your browser settings — enable them there first.
            </p>
          )}
          {isPushSupported() && (
            <Row
              label="Push reminders"
              desc="Get reminders even when Liftoff is closed (requires server setup)."
            >
              <Toggle
                checked={push}
                disabled={!isPushConfigured() || pushBusy}
                onChange={async (v) => {
                  setPushBusy(true);
                  try {
                    if (v) setPush(await enablePush());
                    else {
                      await disablePush();
                      setPush(false);
                    }
                  } finally {
                    setPushBusy(false);
                  }
                }}
              />
            </Row>
          )}
          {isPushSupported() && !isPushConfigured() && (
            <p className="text-xs text-ink-subtle mb-2">
              Push isn’t configured for this deployment yet. See docs/PUSH_SETUP.md to add VAPID keys and the sender function.
            </p>
          )}
          <div className="bg-elevated p-3 rounded-md text-xs text-ink-subtle space-y-2 border border-border">
            <p><strong>1. In-App Alarms:</strong> Trigger immediately when Liftoff is open.</p>
            <p><strong>2. Browser Notifications:</strong> Trigger natively if permission is granted.</p>
            <p><strong>3. Email & Mobile Push:</strong> Delivered via your Calendar app. Use 'Add to Calendar' on a scheduled task to sync it.</p>
          </div>
          <button
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('liftoff:alarm', { detail: { id: 'test', title: 'This is a test reminder!' } })
              );
              if (notificationsSupported() && Notification.permission === 'granted') {
                try { new Notification('Liftoff reminder', { body: 'This is a test reminder!' }); } catch { /* notification unsupported */ }
              }
            }}
            className="btn btn-secondary w-full mt-3"
          >
            Test reminder
          </button>
        </Section>

        {/* AI Coach (bring-your-own key) */}
        <Section title="AI Coach" icon={<Sparkles className="w-4 h-4" />}>
          <p className="text-xs text-ink-subtle mb-3">
            Optional and free: power the Coach page with Google Gemini using your own API key. The
            key is stored <strong>only on this device</strong> (never synced or sent anywhere except
            Google). Get a <strong>free</strong> key (no credit card) at{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline underline-offset-2"
            >
              aistudio.google.com/apikey
            </a>
            .
          </p>
          <input
            type="password"
            value={aiKey}
            onChange={(e) => setAiKey(e.target.value)}
            placeholder="AIza..."
            autoComplete="off"
            className="input mb-3"
          />
          <label className="block mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-1.5 block">
              Model
            </span>
            <select
              value={aiModel}
              onChange={(e) => {
                const id = e.target.value as AiModelId;
                setAiModelState(id);
                setModel(id);
              }}
              className="input"
            >
              {AI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={saveAiKey} className="btn btn-primary flex-1">
              Save key
            </button>
            {getApiKey() && (
              <button onClick={clearAiKey} className="btn btn-danger flex-1">
                Remove key
              </button>
            )}
          </div>
          {aiStatus && <p className="text-xs text-success font-medium mt-2">{aiStatus}</p>}
        </Section>

        {/* Data */}
        <Section title="Data">
          <p className="text-xs text-ink-subtle mb-3">
            {isSupabaseConfigured
              ? 'Saved on this device and synced to the cloud automatically. You can also keep a local backup.'
              : 'Saved automatically on this device. Cloud sync is off (no credentials). Keep a local backup to move between devices.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={handleExport} className="btn btn-secondary flex-1">
              <Download className="w-4 h-4" /> Export backup
            </button>
            <label className="btn btn-secondary flex-1 cursor-pointer">
              <Upload className="w-4 h-4" /> Import backup
              <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>
          </div>
          {/* A failed restore must not read as a success — this line was
              always green, whatever it said. */}
          {importStatus && (
            <p className={cn('text-xs font-medium mt-2', importStatus.ok ? 'text-success' : 'text-danger')}>
              {importStatus.msg}
            </p>
          )}
          {phases.length === 0 && (
            <button
              onClick={() => {
                if (window.confirm('Load the example developer roadmap? You can edit or clear it any time.'))
                  loadExampleRoadmap();
              }}
              className="btn btn-secondary w-full mt-3"
            >
              <Target className="w-4 h-4" /> Load example roadmap
            </button>
          )}
          <button
            onClick={() => {
              if (window.confirm('Clear your roadmap? Progress will be lost.')) resetRoadmap();
            }}
            className="btn btn-danger w-full mt-3"
          >
            Clear roadmap
          </button>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="section-label flex items-center gap-1.5 border-b border-border pb-2 mb-3">
        {icon}
        {title}
      </h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        {desc && <p className="text-xs text-ink-subtle mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function ThemeBtn({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'p-1.5 rounded-md transition-colors',
        active ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        'relative w-10 h-6 rounded-full transition-colors',
        checked ? 'bg-accent' : 'bg-border-strong',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
          checked && 'translate-x-4',
        )}
      />
    </button>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-1.5 block">
        {label}
      </span>
      <input
        type="number"
        min={1}
        max={120}
        value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        className="input"
      />
    </label>
  );
}
