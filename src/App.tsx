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
    window.addEventListener('keydown', onKey);
    window.addEventListener('liftoff:quickadd', onQuickAdd);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('liftoff:quickadd', onQuickAdd);
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
        <div className="absolute top-0 right-0 w-[400px] h-[400px] z-0 pointer-events-none overflow-visible flex items-center justify-center bg-transparent">
          <img alt="Glowing moon" className="w-[380px] h-[380px] object-contain mix-blend-screen opacity-50 transform translate-x-10 -translate-y-10" src="https://lh3.googleusercontent.com/aida/AP1WRLsozTQcci_eKwFiNlWjSiaryhyrkTTRaDy-r2t1v_2VRRgtuo-cN2RlK6n0qgGvuXT5R_tGjPGZLoOOp0YiOEKj3xAp2i0iPGBrpOVKMiM8bnKeHZo1Ag7M85Dms_eVV0vOVrPm36wiVqUiTCI9oCjPqArExJkfy9TB4o5iv8t8EknV918RBLuLbqlDAJKCwHN8WPQp-XL7IHp9t-XB0QL7EqH1Ne_g6ZAeqx2kSE_Ju-6ASU8Rm9c4GXB2" style={{ filter: 'drop-shadow(rgba(255, 248, 231, 0.1) 0px 0px 40px)' }} />
        </div>

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
        className="fixed bottom-8 right-8 z-40 w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary text-on-primary shadow-[0_0_20px_-3px_rgba(192,193,255,0.4)] flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
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
