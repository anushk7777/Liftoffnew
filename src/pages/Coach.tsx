import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Brain, Clock, TrendingUp, ShieldCheck, Moon, TriangleAlert, Wand2, Loader2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';
import { buildProfile, getSuggestions, getBriefing, formatHour } from '../lib/coach';
import type { CoachState } from '../lib/coach';
import { hasApiKey, generateCoaching, modelShortLabel } from '../lib/aicoach';
import { PageHeader, ProgressBar } from '../components/ui';
import { SuggestionRow } from '../components/Coach';
import { useCoachActions } from '../components/useCoachActions';

export default function Coach() {
  const phases = useStore((s) => s.phases);
  const tasks = useStore((s) => s.tasks);
  const focusSessions = useStore((s) => s.focusSessions);
  const ideas = useStore((s) => s.ideas);
  const activityHistory = useStore((s) => s.activityHistory);
  const streak = useStore((s) => s.streak);
  const pomodoro = useStore((s) => s.pomodoro);
  const habits = useStore((s) => s.habits);
  const habitLog = useStore((s) => s.habitLog);
  const targetDate = useStore((s) => s.targetDate);
  const journeyStart = useStore((s) => s.journeyStart);

  const onAct = useCoachActions();

  const { state: coachState, profile, suggestions, briefing } = useMemo(() => {
    const state: CoachState = {
      phases,
      tasks,
      focusSessions,
      ideas,
      activityHistory,
      streak,
      pomodoro,
      habits,
      habitLog,
      targetDate,
      journeyStart,
    };
    const profile = buildProfile(state);
    return { state, profile, suggestions: getSuggestions(state, profile), briefing: getBriefing(state) };
  }, [phases, tasks, focusSessions, ideas, activityHistory, streak, pomodoro, habits, habitLog, targetDate, journeyStart]);

  const learning = profile.dataPoints < 8;
  const briefTone =
    briefing.status === 'behind'
      ? 'border-danger/40 bg-danger/10'
      : briefing.status === 'ahead'
        ? 'border-success/40 bg-success/10'
        : 'border-accent/30 bg-accent-soft/40';

  return (
    <div className="animate-rise">
      <PageHeader
        title="Coach"
        subtitle="Personalised, evidence-based guidance — learned from your own activity."
        icon={<Sparkles className="w-5 h-5" />}
      />

      {/* Mission briefing — progress monitoring */}
      <div className={cn('card p-5 mb-4 border', briefTone)}>
        <div className="flex items-start gap-3">
          {briefing.status === 'behind' ? (
            <TriangleAlert className="w-5 h-5 text-danger shrink-0 mt-0.5" />
          ) : (
            <Moon className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-ink">{briefing.headline}</h2>
              <span className="text-xs text-ink-subtle whitespace-nowrap">{briefing.daysLeft} days left</span>
            </div>
            <p className="text-sm text-ink-muted mt-0.5">{briefing.detail}</p>
            {briefing.status !== 'idle' && (
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-ink-subtle mb-1">
                  <span>Roadmap {briefing.actualPct}%</span>
                  <span>Expected {Math.round(briefing.expectedPct)}%</span>
                </div>
                <ProgressBar value={briefing.actualPct} />
              </div>
            )}
          </div>
        </div>
      </div>



      {/* How it works */}
      <div className="card p-4 mb-6 flex items-start gap-3 bg-accent-soft/30">
        <ShieldCheck className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <p className="text-sm text-ink-muted">
          The coach re-trains on your data every time you open it — entirely on this device.
          {learning
            ? ' It’s still getting to know you; complete tasks and run a few focus sessions to sharpen its advice.'
            : ' The more you do, the sharper it gets.'}
        </p>
      </div>

      {/* AI coach (optional, bring-your-own Anthropic key) */}
      <AICoachPanel state={coachState} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Suggestions */}
        <section className="lg:col-span-2">
          <h2 className="section-label mb-2">Your next moves</h2>
          <div className="card p-1.5">
            {suggestions.map((s) => (
              <SuggestionRow key={s.id} suggestion={s} onAct={onAct} />
            ))}
          </div>

          {/* Insights */}
          <h2 className="section-label mb-2 mt-6">What the coach has learned</h2>
          <div className="card p-4 space-y-2">
            {profile.insights.map((line, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm text-ink">
                <Brain className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                {line}
              </div>
            ))}
          </div>
        </section>

        {/* Profile panels */}
        <aside className="space-y-6">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-ink-muted" />
              <h3 className="section-label">Focus by hour</h3>
            </div>
            <HourHistogram histogram={profile.hourHistogram} peaks={profile.peakHours} />
            <p className="text-xs text-ink-subtle mt-3">
              {profile.peakHours.length
                ? `Peak: ${profile.peakHours.map(formatHour).join(', ')}`
                : 'Run focus sessions to reveal your peak hours.'}
            </p>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-ink-muted" />
              <h3 className="section-label">Strongest areas</h3>
            </div>
            {profile.topCategories.length === 0 ? (
              <p className="text-xs text-ink-subtle">Complete categorised tasks to see this.</p>
            ) : (
              <div className="space-y-2.5">
                {profile.topCategories.map((c) => (
                  <div key={c.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-ink font-medium">{c.name}</span>
                      <span className="text-ink-subtle">{Math.round(c.weight * 100)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-elevated overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${Math.max(6, c.weight * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-4 grid grid-cols-2 gap-3">
            <Stat label="Tasks / day" value={profile.tasksPerDay.toFixed(1)} />
            <Stat label="Avg session" value={`${profile.avgSessionMins}m`} />
            <Stat label="Total focus" value={`${Math.floor(profile.totalFocusMin / 60)}h`} />
            <Stat label="Data points" value={profile.dataPoints} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function AICoachPanel({ state }: { state: CoachState }) {
  const [enabled] = useState(() => hasApiKey());
  const [question, setQuestion] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setOutput('');
    try {
      await generateCoaching({ state, question, onText: (t) => setOutput((p) => p + t) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong calling the AI.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5 mb-6 border border-accent/30">
      <div className="flex items-center gap-2 mb-2">
        <Wand2 className="w-5 h-5 text-accent" />
        <h2 className="font-display text-lg font-bold text-ink">AI Coach</h2>
        {enabled && (
          <span className="chip text-accent border-accent/30 bg-accent-soft/40 ml-auto">
            {modelShortLabel()}
          </span>
        )}
      </div>

      {!enabled ? (
        <p className="text-sm text-ink-muted">
          Add your free Google Gemini API key in{' '}
          <Link to="/settings" className="text-accent underline underline-offset-2">
            Settings → AI Coach
          </Link>{' '}
          to get a personalized, conversational briefing powered by Gemini — grounded in your real
          tasks, habits, and goal. It's free, and your key stays on this device.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-muted mb-3">
            Generate a briefing from your current data, or ask the coach a question.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              className="input flex-1"
              placeholder="Optional: ask a question (e.g. what should I focus on this week?)"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') run();
              }}
            />
            <button onClick={run} disabled={busy} className="btn btn-primary disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {busy ? 'Thinking…' : question.trim() ? 'Ask coach' : 'Generate briefing'}
            </button>
          </div>
          {error && <p className="text-xs text-danger mb-2">{error}</p>}
          {output && (
            <div className="text-sm text-ink whitespace-pre-wrap leading-relaxed bg-elevated rounded-md p-3 border border-border">
              {output}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HourHistogram({ histogram, peaks }: { histogram: number[]; peaks: number[] }) {
  return (
    <div className="flex items-end gap-[2px] h-20">
      {histogram.map((v, h) => (
        <div
          key={h}
          title={`${formatHour(h)} · ${Math.round(v * 100)}`}
          className={cn(
            'flex-1 rounded-sm transition-all',
            peaks.includes(h) ? 'bg-accent' : 'bg-elevated',
          )}
          style={{ height: `${Math.max(4, v * 100)}%` }}
        />
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="font-display text-xl font-bold text-ink">{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-ink-subtle">{label}</p>
    </div>
  );
}
