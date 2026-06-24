import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { Plus, Map } from 'lucide-react';
import { useStore } from './store/useStore';
import { useIsMobile } from './lib/useIsMobile';
import { pageVariants, fast, useReducedMotion } from './lib/motion';
import { useReminders } from './lib/reminders';
import Sidebar from './components/Sidebar';
import MobileShell from './mobile/MobileShell';
import PWAPrompt from './components/PWAPrompt';
import PanicButton from './components/PanicButton';
import CommandPalette from './components/CommandPalette';
import ErrorBoundary from './components/ErrorBoundary';
import QuickAdd from './components/QuickAdd';
import AlarmOverlay from './components/AlarmOverlay';
import InstallPrompt from './components/InstallPrompt';
import OfflineBanner from './components/OfflineBanner';

import Dashboard from './pages/Dashboard';
import Coach from './pages/Coach';
import Tasks from './pages/Tasks';
import Habits from './pages/Habits';
import Focus from './pages/Focus';
import BrainDump from './pages/BrainDump';
import Roadmap from './pages/Roadmap';
const Stats = lazy(() => import('./pages/Stats'));
import SettingsPage from './pages/Settings';
import Schedule from './pages/Schedule';
import Login from './pages/Login';
import { EmptyState } from './components/ui';
import { supabase } from './lib/supabase';
import { useAppMode } from './afterburn/store';
import ProfilePicker from './afterburn/ProfilePicker';
import Afterburn from './afterburn/Afterburn';

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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthChecking(false);
      if (!session && location.pathname !== '/login') {
        navigate('/login');
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && location.pathname !== '/login') {
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
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
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

  // ---- Workspace gate (after login): choose Focus vs Afterburn. ----
  if (appMode === null) return <ProfilePicker />;
  if (appMode === 'afterburn')
    return (
      <>
        <Afterburn />
        {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
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
      <Route path="/" element={<Dashboard />} />
      <Route path="/coach" element={<Coach />} />
      <Route path="/tasks" element={<Tasks />} />
      <Route path="/habits" element={<Habits />} />
      <Route path="/focus" element={<Focus />} />
      <Route path="/brain-dump" element={<BrainDump />} />
      <Route path="/roadmap" element={<Roadmap />} />
      <Route path="/schedule" element={<Schedule />} />
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
    <div className="bg-background text-on-surface font-body-lg min-h-screen overflow-hidden selection:bg-primary/30 flex relative">
      <div className="fixed inset-0 radial-atmosphere pointer-events-none z-0"></div>

      {!focusMode && (
        <div className="shrink-0 z-40 relative">
          <Sidebar onOpenSearch={() => setPaletteOpen(true)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative z-10">
        {/* Decorative background */}
        <div className="absolute top-0 right-0 w-[420px] h-[420px] z-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 70% 30%, rgba(255,255,255,0.06), transparent 60%)' }}></div>

        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="mx-auto w-full px-5 py-7 sm:px-8 sm:py-10 pb-12 transition-all duration-300 max-w-7xl">
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
        className="fixed bottom-8 right-8 z-40 w-16 h-16 rounded-full bg-[var(--accent)] text-[var(--accent-text)] shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
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
        <Shell />
      </MotionConfig>
    </BrowserRouter>
  );
}

export default App;
