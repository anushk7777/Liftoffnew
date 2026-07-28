import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, PenLine, Sparkles, BookOpen } from 'lucide-react';
import { cn } from '../lib/utils';
import { fast, pageVariants, useReducedMotion } from '../lib/motion';
import { useAppMode } from '../afterburn/mode';
import { useKairos } from './store';
import Capture from './Capture';
import OnThisDay from './OnThisDay';
import Timeline from './Timeline';

type Tab = 'capture' | 'onthisday' | 'timeline';

function Header() {
  const setMode = useAppMode((s) => s.setMode);
  return (
    <header className="glass-bar sticky top-0 z-30 backdrop-blur-xl border-b border-border pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-2xl px-4 h-14 flex items-center gap-3">
        <button
          onClick={() => setMode('focus')}
          className="tap-44 w-9 h-9 -ml-1 rounded-full flex items-center justify-center text-ink-muted hover:text-ink hover:bg-hover transition-colors"
          aria-label="Back to Liftoff Focus"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--kairos-grad)' }}
          >
            <Sparkles className="w-4 h-4 text-white" />
          </span>
          <span className="font-dream text-dream text-2xl tracking-tight">Kairos</span>
        </div>
        <span className="ml-auto text-xs text-ink-subtle hidden sm:block">your private diary of moments</span>
      </div>
    </header>
  );
}

export default function Kairos() {
  const rm = useReducedMotion();
  // Open on the tab requested by an external entry point (e.g. the home
  // "On this day" memories box), else the capture screen.
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const t = sessionStorage.getItem('kairos_tab');
      if (t) sessionStorage.removeItem('kairos_tab');
      return t === 'onthisday' || t === 'timeline' ? (t as Tab) : 'capture';
    } catch {
      return 'capture';
    }
  });
  const loadMoments = useKairos((s) => s.loadMoments);

  // Pull cloud moments when entering (recency-guarded in the store).
  useEffect(() => {
    loadMoments();
  }, [loadMoments]);

  const TABS: { id: Tab; label: string; icon: typeof PenLine }[] = [
    { id: 'capture', label: 'Capture', icon: PenLine },
    { id: 'onthisday', label: 'On this day', icon: Sparkles },
    { id: 'timeline', label: 'Moments', icon: BookOpen },
  ];

  return (
    <div className="min-h-screen bg-background text-ink relative">
      <div className="fixed inset-0 kairos-aura pointer-events-none z-0" />
      <div className="relative z-10">
        <Header />

        <div className="mx-auto max-w-2xl px-4 pt-4">
          <div className="flex bg-elevated p-0.5 rounded-lg border border-border w-max">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors',
                  tab === t.id ? 'text-ink' : 'text-ink-muted',
                )}
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="kairos-tab-pill"
                    transition={rm ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 }}
                    className="absolute inset-0 rounded-md bg-surface shadow-sm"
                  />
                )}
                <t.icon className="relative z-10 w-3.5 h-3.5" />
                <span className="relative z-10">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {rm ? (
          <div key={tab}>
            {tab === 'capture' && <Capture onSaved={() => setTab('timeline')} />}
            {tab === 'onthisday' && <OnThisDay />}
            {tab === 'timeline' && <Timeline />}
          </div>
        ) : (
          <motion.div key={tab} variants={pageVariants} initial="initial" animate="enter" transition={fast}>
            {tab === 'capture' && <Capture onSaved={() => setTab('timeline')} />}
            {tab === 'onthisday' && <OnThisDay />}
            {tab === 'timeline' && <Timeline />}
          </motion.div>
        )}
      </div>
    </div>
  );
}
