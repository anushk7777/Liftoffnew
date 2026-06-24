import { Rocket, Flame } from 'lucide-react';
import { useAppMode } from './store';

// Shown right after login when no workspace is chosen yet.
export default function ProfilePicker() {
  const setMode = useAppMode((s) => s.setMode);

  return (
    <div className="min-h-screen bg-background text-ink flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="fixed inset-0 radial-atmosphere pointer-events-none z-0" />
      <div className="relative z-10 w-full max-w-3xl">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold">Welcome back</h1>
          <p className="text-ink-muted mt-1">Pick your workspace — switch any time.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <button
            onClick={() => setMode('focus')}
            className="card p-7 text-left hover:border-accent/50 hover:bg-hover transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-accent-soft/60 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <Rocket className="w-6 h-6 text-accent" />
            </div>
            <h2 className="font-display text-xl font-bold">Liftoff Focus</h2>
            <p className="text-sm text-ink-muted mt-1">
              Tasks, habits, focus sessions, roadmap and your AI coach — everything for the goal.
            </p>
          </button>

          <button
            onClick={() => setMode('afterburn')}
            className="card p-7 text-left hover:border-[var(--border-strong)] hover:bg-hover transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
              <Flame className="w-6 h-6 text-[var(--accent)]" />
            </div>
            <h2 className="font-display text-xl font-bold">Liftoff Afterburn</h2>
            <p className="text-sm text-ink-muted mt-1">
              Log your training: your plan mapped set-by-set with target RPE, RPE achieved, and a rating per set.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
