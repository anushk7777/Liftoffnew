// Liftoff Templates — the coaching micro-app, a peer of Afterburn and Kairos.
//
// This is the coach's side: the client roster, each client's check-in history,
// plans, and the direct thread. Clients themselves never come here — they get
// the standalone portal at /coaching.
//
// It exists as its own workspace (rather than only the /clients tab inside
// Focus) so there is always a way in. The tab is gated on the signed-in address
// matching the coach account, and when that gate fails it used to leave no
// route to the feature at all — the roster simply vanished with no explanation.
import { ArrowLeft, ClipboardList, ExternalLink } from 'lucide-react';
import { useAppMode } from '../afterburn/mode';
import CoachClients from './CoachClients';

function Header() {
  const setMode = useAppMode((s) => s.setMode);
  return (
    <header className="glass-bar sticky top-0 z-30 backdrop-blur-xl border-b border-border pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-3xl px-4 h-14 flex items-center gap-3">
        <button
          onClick={() => setMode('focus')}
          className="tap-44 w-9 h-9 -ml-1 rounded-full flex items-center justify-center text-ink-muted hover:text-ink hover:bg-hover transition-colors"
          aria-label="Back to Liftoff Focus"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'var(--accent-soft)' }}
          >
            <ClipboardList className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </span>
          <span
            className="text-[19px] font-bold tracking-tight truncate"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Templates
          </span>
        </div>
        <a
          href="/coaching?preview=1"
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-transform active:scale-95"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          title="Preview the page your clients see"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Preview client page</span>
          <span className="sm:hidden">Preview</span>
        </a>
      </div>
    </header>
  );
}

export default function Templates() {
  return (
    // Same theme scope the coaching components are built against (the client
    // portal does likewise) — outside it the accent tokens fall back to grey.
    <div className="focus-daylight min-h-screen relative" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="relative z-10">
        <Header />
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8 pb-24">
          <CoachClients embedded />
        </div>
      </div>
    </div>
  );
}
