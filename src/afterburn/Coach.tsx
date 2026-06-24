import { useState } from 'react';
import { Sparkles, Send, Loader2, Calculator, MessageSquare, KeyRound } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAfterburn } from './store';
import { generateWorkoutCoaching } from './coach';
import type { CoachData } from './coach';
import Nutrition from './Nutrition';
import { getApiKey, setApiKey, hasApiKey, modelShortLabel } from '../lib/aicoach';

type View = 'ask' | 'calories';

export default function Coach() {
  const program = useAfterburn((s) => s.program);
  const sessions = useAfterburn((s) => s.sessions);
  const currentWeekId = useAfterburn((s) => s.currentWeekId);
  const bodyweight = useAfterburn((s) => s.bodyweight);
  const nutrition = useAfterburn((s) => s.nutrition);

  const [view, setView] = useState<View>('ask');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [keyInput, setKeyInput] = useState(() => getApiKey());
  const [keySaved, setKeySaved] = useState(hasApiKey());

  const data: CoachData = { program, sessions, currentWeekId, bodyweight, nutrition };

  const run = async (q?: string) => {
    setError('');
    setText('');
    setLoading(true);
    try {
      await generateWorkoutCoaching({ data, question: q, onText: (c) => setText((t) => t + c) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex bg-elevated p-0.5 rounded-lg border border-border w-fit">
        {([
          { id: 'ask', label: 'Ask coach', icon: MessageSquare },
          { id: 'calories', label: 'Calories', icon: Calculator },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={cn('flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors', view === t.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted')}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {view === 'calories' ? (
        <Nutrition />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--accent)]" />
            <div>
              <h2 className="font-display text-xl font-bold">AI coach</h2>
              <p className="text-xs text-ink-subtle">Grounded in your logged training + nutrition · {modelShortLabel()}</p>
            </div>
          </div>

          {!keySaved ? (
            <div className="card p-4 space-y-3">
              <p className="text-sm text-ink-subtle flex items-start gap-2">
                <KeyRound className="w-4 h-4 mt-0.5 shrink-0" />
                Bring your own free Google Gemini key (stored only on this device). Get one at{' '}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">aistudio.google.com/apikey</a>.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="AIza…"
                  autoComplete="off"
                  className="input flex-1"
                />
                <button
                  onClick={() => {
                    setApiKey(keyInput);
                    setKeySaved(hasApiKey());
                  }}
                  disabled={!keyInput.trim()}
                  className="btn btn-primary disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <button onClick={() => run()} disabled={loading} className="btn btn-primary w-full disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? 'Coaching…' : 'Get my briefing'}
              </button>

              {error && <p className="text-sm text-danger">{error}</p>}

              {text && (
                <div className="card p-4 whitespace-pre-wrap text-sm text-ink leading-relaxed">{text}</div>
              )}

              <div className="flex gap-2">
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && question.trim() && !loading && run(question.trim())}
                  placeholder="Ask anything — e.g. 'is my bench progressing?'"
                  className="input flex-1"
                />
                <button onClick={() => question.trim() && run(question.trim())} disabled={loading || !question.trim()} className="btn btn-secondary disabled:opacity-50" aria-label="Ask">
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => {
                  setApiKey('');
                  setKeySaved(false);
                  setKeyInput('');
                }}
                className="text-xs text-ink-subtle hover:text-danger"
              >
                Remove API key
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
