import { Dumbbell, Flame, Plus, ChevronRight, Lock } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAfterburn } from './store';
import { PROGRAM_TEMPLATES } from './library';
import type { ProgramTemplate } from './library';

// "Your Programs" — the first thing you see in Afterburn. Pick a ready template,
// or build your own. Loading a program only swaps the prescribed plan; your
// logged history is always kept.
export default function ProgramLibrary({ onPicked }: { onPicked: () => void }) {
  const program = useAfterburn((s) => s.program);
  const loadProgram = useAfterburn((s) => s.loadProgram);
  const hasProgram = program.weeks.length > 0 || program.custom.length > 0;

  const pick = (t: ProgramTemplate) => {
    if (!t.build) return;
    if (
      hasProgram &&
      !window.confirm('Replace your current plan with this program? Your logged workout history is kept.')
    )
      return;
    if (t.status === 'custom') {
      const name = window.prompt('Name your program', 'My Program');
      if (name === null) return;
      loadProgram({ name: name.trim() || 'My Program', unit: 'kg', weeks: [], custom: [] });
    } else {
      loadProgram(t.build());
    }
    onPicked();
  };

  const icon = (t: ProgramTemplate) =>
    t.status === 'custom' ? <Plus className="w-6 h-6" /> : t.id === 'powerbuilding' ? <Dumbbell className="w-6 h-6" /> : <Flame className="w-6 h-6" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Your programs</h1>
        <p className="text-xs text-ink-subtle mt-0.5">Pick a plan to train — or build your own. Your logged history is never lost.</p>
      </div>

      <div className="space-y-3">
        {PROGRAM_TEMPLATES.map((t) => {
          const disabled = t.status === 'coming-soon';
          return (
            <button
              key={t.id}
              disabled={disabled}
              onClick={() => pick(t)}
              className={cn(
                'card w-full p-4 flex items-center gap-4 text-left transition-colors',
                disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-orange-400/50 hover:bg-hover',
              )}
            >
              <div
                className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
                  disabled ? 'bg-elevated text-ink-subtle' : 'bg-orange-500/15 text-orange-400',
                )}
              >
                {disabled ? <Lock className="w-5 h-5" /> : icon(t)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-ink">{t.title}</p>
                <p className="text-xs text-ink-subtle mt-0.5">{t.subtitle}</p>
              </div>
              {!disabled && <ChevronRight className="w-5 h-5 text-ink-subtle shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
