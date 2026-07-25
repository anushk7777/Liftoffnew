import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { Plus, Map } from 'lucide-react';
import { useStore } from './store/useStore';
import { useIsMobile } from './lib/useIsMobile';
import { pageVariants, fast, useReducedMotion } from './lib/motion';
import { useReminders } from './lib/reminders';
import TopNav from './components/TopNav';
import MobileShell from './mobile/MobileShell';
import ModeTransition from './components/ModeTransition';
import PWAPrompt from './components/PWAPrompt';
import PanicButton from './components/PanicButton';
import ErrorBoundary from './components/ErrorBoundary';
// CommandPalette imports the heavy Afterburn store; lazy-load it (declared below)
// so it stays out of the initial bundle until the palette is actually opened.
import QuickAdd from './components/QuickAdd';
import AlarmOverlay from './components/AlarmOverlay';
import InstallPrompt from './components/InstallPrompt';
import OfflineBanner from './components/OfflineBanner';

import MissionControl from './pages/MissionControl';
import Coach from './pages/Coach';
import Tasks from './pages/Tasks';
import Habits from './pages/Habits';
import Focus from './pages/Focus';
import BrainDump from './pages/BrainDump';
import Roadmap from './pages/Roadmap';
const Stats = lazy(() => import('./pages/Stats'));
// Code-split the heavy trees out of the initial bundle:
//  - Afterburn pulls in afterburn/store + the ~900-line plan.ts data
//  - CommandPalette pulls in the Afterburn store for its workout commands
const Afterburn = lazy(() => import('./afterburn/Afterburn'));
const Kairos = lazy(() => import('./kairos/Kairos'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));
// Coaching micro-app: client portal is a public standalone page (clients sign
// in with Google there); the coach dashboard rides inside the desktop shell.
const ClientPortal = lazy(() => import('./coaching/ClientPortal'));
const CoachClients = lazy(() => import('./coaching/CoachClients'));
// Templates: the coaching micro-app as its own workspace, alongside Afterburn
// and Kairos. Keeps a route to the roster even when the /clients tab is hidden.
const Templates = lazy(() => import('./coaching/Templates'));
import SettingsPage from './pages/Settings';
import Schedule from './pages/Schedule';
import Login from './pages/Login';
import { EmptyState } from './components/ui';
import { supabase } from './lib/supabase';
import { useAppMode } from './afterburn/mode';
import ProfilePicker from './afterburn/ProfilePicker';

function NotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full p-8 animate-rise">
      <EmptyState
        icon={<Map className="w-10 h-10" />}
        title="Page not found"
        hint="Looks like you drifted off course. Use the sidebar to navigate back."
      />
    </div>
  );
}

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const rm = useReducedMotion();
  const isMobile = useIsMobile();
  const appMode = useAppMode((s) => s.mode);
  useReminders();

  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setAuthChecking(false);
        if (!session && location.pathname !== '/login' && !location.pathname.startsWith('/coaching')) {
          navigate('/login');
        }
      })
      // Never leave the app stuck on the loading splash: if the auth service
      // can't be reached, fall through to the login screen instead.
      .catch((err) => {
        console.error('Could not read the auth session:', err);
        setAuthChecking(false);
        if (location.pathname !== '/login' && !location.pathname.startsWith('/coaching')) {
          navigate('/login');
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && location.pathname !== '/login' && !location.pathname.startsWith('/coaching')) {
        navigate('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, location.pathname]);

  const [focusMode, setFocusMode] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // Global shortcuts + the command-palette "Add a task" bridge.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setQuickAddOpen(true);
      } else if (e.key.toLowerCase() === 'f' && !isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setFocusMode((f) => !f);
      }
    };
    const onQuickAdd = () => setQuickAddOpen(true);
    const onSearch = () => setPaletteOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('liftoff:quickadd', onQuickAdd);
    window.addEventListener('liftoff:search', onSearch);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('liftoff:quickadd', onQuickAdd);
      window.removeEventListener('liftoff:search', onSearch);
    };
  }, []);

  // Overlays shared by both the desktop and mobile layouts.
  const overlays = (
    <>
      <OfflineBanner />
      <PanicButton />
      <PWAPrompt />
      <InstallPrompt />
      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette onClose={() => setPaletteOpen(false)} />
        </Suspense>
      )}
      <AnimatePresence>
        {quickAddOpen && <QuickAdd key="quickadd" onClose={() => setQuickAddOpen(false)} />}
      </AnimatePresence>
      <AlarmOverlay />
    </>
  );

  if (authChecking) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>;
  }

  // The login screen is a full-bleed page on every device.
  if (location.pathname === '/login') {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>
    );
  }

  // Client coaching portal — full-bleed, handles its own Google sign-in, and
  // never enters the workspace picker (clients only ever see their template).
  if (location.pathname.startsWith('/coaching')) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-ink-subtle animate-pulse">Loading…</div>}>
        <ClientPortal />
      </Suspense>
    );
  }

  // ---- Workspace gate (after login): choose Focus vs Afterburn. ----
  if (appMode === null) return <ProfilePicker />;
  if (appMode === 'afterburn')
    return (
      <>
        <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-ink-subtle animate-pulse">Loading…</div>}>
          <Afterburn />
        </Suspense>
        {/* Global overlays that must reach Afterburn too — most importantly the
            PWA "Update available" prompt, so users who live in Afterburn on
            mobile actually receive new builds. Focus-only widgets (panic button,
            quick-add) are intentionally left out to keep Afterburn clean. */}
        <OfflineBanner />
        <PWAPrompt />
        <InstallPrompt />
        {paletteOpen && (
          <Suspense fallback={null}>
            <CommandPalette onClose={() => setPaletteOpen(false)} />
          </Suspense>
        )}
        <AlarmOverlay />
      </>
    );
  if (appMode === 'templates')
    return (
      <>
        <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-ink-subtle animate-pulse">Loading…</div>}>
          <Templates />
        </Suspense>
        {/* Keep the PWA update path reachable here too. */}
        <OfflineBanner />
        <PWAPrompt />
        <InstallPrompt />
        <AlarmOverlay />
      </>
    );
  if (appMode === 'kairos')
    return (
      <>
        <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-ink-subtle animate-pulse">Loading…</div>}>
          <Kairos />
        </Suspense>
        {/* Keep the PWA update path reachable inside Kairos too. Focus-only
            widgets (panic button, quick-add) stay out to keep the diary calm. */}
        <OfflineBanner />
        <PWAPrompt />
        <InstallPrompt />
        <AlarmOverlay />
      </>
    );

  // ---- Mobile: dedicated app shell (the single source of truth for mobile UX). ----
  if (isMobile) {
    return (
      <>
        <MobileShell onOpenSearch={() => setPaletteOpen(true)} />
        {overlays}
      </>
    );
  }

  // ---- Desktop layout ----
  const routesEl = (
    <Routes location={location}>
      <Route path="/" element={<MissionControl />} />
      <Route path="/coach" element={<Coach />} />
      <Route path="/tasks" element={<Tasks />} />
      <Route path="/habits" element={<Habits />} />
      <Route path="/focus" element={<Focus />} />
      <Route path="/brain-dump" element={<BrainDump />} />
      <Route path="/roadmap" element={<Roadmap />} />
      <Route path="/schedule" element={<Schedule />} />
      <Route
        path="/clients"
        element={
          <Suspense fallback={<div className="flex h-full items-center justify-center text-ink-subtle animate-pulse">Loading…</div>}>
            <CoachClients />
          </Suspense>
        }
      />
      {/* An invited client's own check-in template, inside their Liftoff. */}
      <Route
        path="/trainer"
        element={
          <Suspense fallback={<div className="flex h-full items-center justify-center text-ink-subtle animate-pulse">Loading…</div>}>
            <ClientPortal embedded />
          </Suspense>
        }
      />
      <Route
        path="/stats"
        element={
          <Suspense fallback={<div className="flex h-full items-center justify-center text-ink-subtle animate-pulse">Loading stats...</div>}>
            <Stats />
          </Suspense>
        }
      />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );

  return (
    <div className="focus-daylight font-body-lg h-screen overflow-hidden flex flex-col relative">
      <div className="fixed inset-0 radial-atmosphere pointer-events-none z-0"></div>

      {!focusMode && (
        <TopNav
          onOpenSearch={() => setPaletteOpen(true)}
          onQuickAdd={() => setQuickAddOpen(true)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="mx-auto w-full px-5 py-8 sm:px-8 sm:py-10 pb-16 transition-all duration-300 max-w-6xl">
            <ErrorBoundary>
              {rm ? (
                routesEl
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={location.pathname}
                    variants={pageVariants}
                    initial="initial"
                    animate="enter"
                    exit="exit"
                    transition={fast}
                  >
                    {routesEl}
                  </motion.div>
                </AnimatePresence>
              )}
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Quick-add FAB (desktop) */}
      <button
        onClick={() => setQuickAddOpen(true)}
        aria-label="Quick add task (Ctrl/Cmd N)"
        title="Quick add (Ctrl/⌘ N)"
        className="focus-fab fab-btn fixed bottom-8 right-8 z-40 w-16 h-16 rounded-full bg-[var(--accent)] text-[var(--accent-text)] flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
      >
        <Plus className="w-8 h-8" />
      </button>

      {overlays}
    </div>
  );
}

function App() {
  const { loadFromDB, theme, reduceMotion } = useStore();

  useEffect(() => {
    loadFromDB();
  }, [loadFromDB]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  return (
    <BrowserRouter>
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>
        <ModeTransition />
        <Shell />
      </MotionConfig>
    </BrowserRouter>
  );
}

export default App;
