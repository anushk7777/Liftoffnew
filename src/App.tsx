import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import {
  Menu,
  Moon,
  Search,
  Plus,
  LayoutDashboard,
  Sparkles,
  CheckSquare,
  Timer,
  Map,
} from 'lucide-react';
import { useStore } from './store/useStore';
import { cn } from './lib/utils';
import { pageVariants, fast, useReducedMotion } from './lib/motion';
import { useReminders } from './lib/reminders';
import Sidebar from './components/Sidebar';
import PWAPrompt from './components/PWAPrompt';
import PanicButton from './components/PanicButton';
import CommandPalette from './components/CommandPalette';
import ErrorBoundary from './components/ErrorBoundary';
import QuickAdd from './components/QuickAdd';
import AlarmOverlay from './components/AlarmOverlay';

import Dashboard from './pages/Dashboard';
import Coach from './pages/Coach';
import Tasks from './pages/Tasks';
import Habits from './pages/Habits';
import Focus from './pages/Focus';
import BrainDump from './pages/BrainDump';
import Roadmap from './pages/Roadmap';
const Stats = lazy(() => import('./pages/Stats'));
import SettingsPage from './pages/Settings';
import { EmptyState } from './components/ui';

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

const MOBILE_NAV = [
  { to: '/', label: 'Today', icon: LayoutDashboard, end: true },
  { to: '/coach', label: 'Coach', icon: Sparkles },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/focus', label: 'Focus', icon: Timer },
  { to: '/roadmap', label: 'Roadmap', icon: Map },
];

// Pages where sidebar should auto-collapse for maximum workspace
const WIDE_PAGES = new Set(['/tasks', '/focus', '/roadmap', '/coach', '/brain-dump']);

function Shell() {
  const location = useLocation();
  const rm = useReducedMotion();
  useReminders();

  const [userCollapsed, setUserCollapsed] = useState(
    () => localStorage.getItem('liftoff_sidebar_collapsed') === '1',
  );
  const [focusMode, setFocusMode] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // Auto-collapse logic fix: Only auto-collapse on route change if it's a wide page and not already collapsed.
  // We do NOT force `collapsed = autoCollapse || userCollapsed` anymore, so the user can manually open it.
  useEffect(() => {
    if (WIDE_PAGES.has(location.pathname)) {
      setUserCollapsed(true);
    }
  }, [location.pathname]);

  const collapsed = focusMode || userCollapsed;

  const toggleCollapsed = () => {
    setUserCollapsed((c) => {
      const next = !c;
      localStorage.setItem('liftoff_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  };

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

  const routesEl = (
    <Routes location={location}>
      <Route path="/" element={<Dashboard />} />
      <Route path="/coach" element={<Coach />} />
      <Route path="/tasks" element={<Tasks />} />
      <Route path="/habits" element={<Habits />} />
      <Route path="/focus" element={<Focus />} />
      <Route path="/brain-dump" element={<BrainDump />} />
      <Route path="/roadmap" element={<Roadmap />} />
      <Route path="/stats" element={<Suspense fallback={<div className="flex h-full items-center justify-center text-ink-subtle animate-pulse">Loading stats...</div>}><Stats /></Suspense>} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );

  return (
    <div className="bg-background text-on-surface font-body-lg min-h-screen overflow-hidden selection:bg-primary/30 flex relative">
      <div className="fixed inset-0 radial-atmosphere pointer-events-none z-0"></div>

      {/* Desktop sidebar */}
      {!focusMode && (
        <div className="hidden md:block shrink-0 z-40 relative">
          <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} onOpenSearch={() => setPaletteOpen(true)} />
        </div>
      )}

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full shadow-lg animate-rise">
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
              onOpenSearch={() => {
                setMobileOpen(false);
                setPaletteOpen(true);
              }}
            />
          </div>
        </div>
      )}

      <div className={cn("flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative z-10", !focusMode && "md:ml-0")}>
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between h-14 px-4 border-b border-white/10 bg-surface-container/60 backdrop-blur-md shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-on-primary" />
            </div>
            <span className="font-display-lg font-bold text-sm bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent">Liftoff</span>
          </div>
          <button
            onClick={() => setPaletteOpen(true)}
            className="p-2 -mr-2 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors"
            aria-label="Search"
          >
            <Search className="w-5 h-5" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className={cn(
            'mx-auto w-full px-5 py-7 pb-24 sm:px-8 sm:py-10 md:pb-12 transition-all duration-300',
            collapsed ? 'max-w-7xl' : 'max-w-6xl',
          )}>
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

        {/* Mobile bottom navigation */}
        <nav className="md:hidden flex items-center justify-around border-t border-white/10 bg-surface-container/80 backdrop-blur-md shrink-0 pb-[env(safe-area-inset-bottom)] z-20">
          {MOBILE_NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2 px-3 text-[10px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface',
                )
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Quick-add FAB */}
      <button
        onClick={() => setQuickAddOpen(true)}
        aria-label="Quick add task (Ctrl/Cmd N)"
        title="Quick add (Ctrl/⌘ N)"
        className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-40 w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary text-on-primary shadow-[0_0_20px_-3px_rgba(192,193,255,0.4)] flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
      >
        <Plus className="w-8 h-8" />
      </button>

      <PanicButton />
      <PWAPrompt />
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      <AnimatePresence>
        {quickAddOpen && <QuickAdd key="quickadd" onClose={() => setQuickAddOpen(false)} />}
      </AnimatePresence>
      <AlarmOverlay />
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
