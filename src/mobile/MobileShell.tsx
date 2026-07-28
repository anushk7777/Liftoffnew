import { useState, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, CheckSquare, Timer, MoreHorizontal, Plus, Search, Users,
  Map, Sparkles, Repeat, Inbox, BarChart3, Settings as SettingsIcon, Moon, Sun, Flame,
  ClipboardList,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useAppMode } from '../afterburn/mode';
import { useSessionEmail, isCoach, useUnreadTotal, useIsClient } from '../coaching/api';
import { cn } from '../lib/utils';
import { pop, springSoft, useReducedMotion } from '../lib/motion';
import { haptics } from '../lib/haptics';
import { BottomSheet } from './components/BottomSheet';
import { PullToRefresh } from './components/PullToRefresh';

import MissionControl from '../pages/MissionControl';
import MobileTasks from './screens/MobileTasks';
import MobileRoadmap from './screens/MobileRoadmap';
import Focus from '../pages/Focus';
import Schedule from '../pages/Schedule';
import Coach from '../pages/Coach';
import Habits from '../pages/Habits';
import BrainDump from '../pages/BrainDump';
import SettingsPage from '../pages/Settings';
const CoachClients = lazy(() => import('../coaching/CoachClients'));
const ClientPortal = lazy(() => import('../coaching/ClientPortal'));
import { EmptyState } from '../components/ui';
const Stats = lazy(() => import('../pages/Stats'));

const TABS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/roadmap', label: 'Roadmap', icon: Map },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/focus', label: 'Focus', icon: Timer },
];

const MORE_LINKS = [
  { to: '/coach', label: 'Coach', icon: Sparkles },
  { to: '/habits', label: 'Habits', icon: Repeat },
  { to: '/brain-dump', label: 'Brain Dump', icon: Inbox },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

const TITLES: Record<string, string> = {
  '/': 'Dashboard', '/tasks': 'Tasks', '/focus': 'Focus', '/schedule': 'Schedule', '/clients': 'Clients',
  '/trainer': 'Trainer',
  '/roadmap': 'Trajectory', '/coach': 'Coach', '/habits': 'Habits',
  '/brain-dump': 'Brain Dump', '/stats': 'Stats', '/settings': 'Settings',
};

function NotFound() {
  return (
    <EmptyState icon={<Map className="w-10 h-10" />} title="Page not found" hint="Use the tabs below to navigate back." />
  );
}

export default function MobileShell({ onOpenSearch }: { onOpenSearch: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useStore();
  const setAppMode = useAppMode((s) => s.setMode);
  const [moreOpen, setMoreOpen] = useState(false);
  const { email } = useSessionEmail();
  const coach = isCoach(email);
  // Invited clients get their own check-in tab in the More sheet.
  const { isClient } = useIsClient(email, !coach);
  const unread = useUnreadTotal(coach);
  const rm = useReducedMotion();

  const title = TITLES[location.pathname] ?? 'Liftoff';

  const go = (to: string) => {
    setMoreOpen(false);
    navigate(to);
  };

  return (
    <div className="focus-daylight flex flex-col h-[100dvh]">
      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-between px-4 h-14 border-b border-[var(--border)] glass-bar [--glass:var(--surface)] backdrop-blur-md pt-[env(safe-area-inset-top)] box-content">
        <AnimatePresence mode="wait">
          <motion.h1
            key={title}
            initial={rm ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={rm ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.21, 1, 0.4, 1] }}
            className="text-[22px] font-bold tracking-tight text-[var(--text)] truncate"
          >
            {title}
          </motion.h1>
        </AnimatePresence>
        <button
          onClick={onOpenSearch}
          aria-label="Search"
          className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-[var(--text-muted)] active:bg-[var(--hover)]"
        >
          <Search className="w-5 h-5" />
        </button>
      </header>

      {/* Scrollable content with pull-to-refresh sync */}
      <PullToRefresh onRefresh={() => useStore.getState().syncNow()} className="flex-1 min-h-0">
        {/* pb-52. Two controls float over this region, now stacked in the same
            right-hand column: the quick-add FAB reaches 144px up from the bottom
            edge and the panic button above it reaches 196px. At the original
            112px both sat on top of the last card. */}
        <div className="px-4 py-5 pb-52">
          <Suspense fallback={<div className="py-16 text-center text-ink-subtle animate-pulse">Loading…</div>}>
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={rm ? false : { opacity: 0, y: 22, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: springSoft }}
                exit={rm ? undefined : { opacity: 0, y: -10, transition: { duration: 0.14 } }}
              >
                <Routes location={location}>
                  <Route path="/" element={<MissionControl />} />
                  <Route path="/tasks" element={<MobileTasks />} />
                  <Route path="/focus" element={<Focus />} />
                  <Route path="/schedule" element={<Schedule />} />
                  <Route path="/roadmap" element={<MobileRoadmap />} />
                  <Route path="/coach" element={<Coach />} />
                  <Route path="/habits" element={<Habits />} />
                  <Route path="/brain-dump" element={<BrainDump />} />
                  <Route path="/stats" element={<Stats />} />
                  <Route path="/clients" element={<CoachClients />} />
                  <Route path="/trainer" element={<ClientPortal embedded />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </div>
      </PullToRefresh>

      {/* Quick-add FAB */}
      <motion.button
        onClick={() => { window.dispatchEvent(new Event('liftoff:quickadd')); haptics.tap(); }}
        aria-label="Quick add task"
        initial={rm ? false : { scale: 0, rotate: -45 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={pop}
        whileTap={rm ? undefined : { scale: 0.85 }}
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-40 w-14 h-14 rounded-full bg-[var(--accent)] text-[var(--accent-text)] shadow-[0_10px_30px_rgba(0,0,0,0.35)] flex items-center justify-center"
      >
        <Plus className="w-7 h-7" />
      </motion.button>

      {/* Bottom tab bar — the soft pill glides between tabs via layoutId. */}
      <nav className="shrink-0 grid grid-cols-5 border-t border-[var(--border)] glass-bar [--glass:var(--surface)] backdrop-blur-md pb-[env(safe-area-inset-bottom)] z-30">
        {TABS.map(({ to, label, icon: Icon, end }) => {
          const isActive = end ? location.pathname === to : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => haptics.tap()}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[11px] font-medium',
                isActive ? 'text-[var(--cozy)]' : 'text-[var(--text-muted)]',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="mobile-tab-pill"
                  transition={rm ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute top-1.5 w-14 h-7 rounded-full" style={{ background: 'var(--cozy-soft)' }}
                />
              )}
              <motion.span
                animate={rm ? undefined : { scale: isActive ? 1.12 : 1, y: isActive ? -1 : 0 }}
                transition={pop}
                className="relative z-10"
              >
                <Icon className="w-5 h-5" />
              </motion.span>
              <span className="relative z-10">{label}</span>
            </NavLink>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[11px] font-medium',
            MORE_LINKS.some((l) => l.to === location.pathname) ? 'text-[var(--cozy)]' : 'text-[var(--text-muted)]',
          )}
        >
          <MoreHorizontal className="w-5 h-5" />
          More
        </button>
      </nav>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid grid-cols-3 gap-3">
          {coach && (
            <button
              onClick={() => go('/clients')}
              className={cn(
                'card flex flex-col items-center justify-center gap-2 py-5 active:scale-95 transition-transform relative',
                location.pathname === '/clients' && 'border-border-strong text-primary',
              )}
            >
              <Users className="w-6 h-6" />
              <span className="text-xs font-medium">Clients</span>
              {unread > 0 && (
                <span
                  className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-bold flex items-center justify-center"
                  style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
                >
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
          )}
          {isClient && (
            <button
              onClick={() => go('/trainer')}
              className={cn(
                'card flex flex-col items-center justify-center gap-2 py-5 active:scale-95 transition-transform',
                location.pathname === '/trainer' && 'border-border-strong text-primary',
              )}
            >
              <ClipboardList className="w-6 h-6" />
              <span className="text-xs font-medium">Trainer</span>
            </button>
          )}
          {MORE_LINKS.map(({ to, label, icon: Icon }) => (
            <button
              key={to}
              onClick={() => go(to)}
              className={cn(
                'card flex flex-col items-center justify-center gap-2 py-5 active:scale-95 transition-transform',
                location.pathname === to && 'border-border-strong text-primary',
              )}
            >
              <Icon className="w-6 h-6" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
          {/* Templates is the coaching workspace: coach's account only. */}
          {coach && (
            <button
              onClick={() => { setMoreOpen(false); haptics.tap(); setAppMode('templates'); }}
              className="card flex flex-col items-center justify-center gap-2 py-5 active:scale-95 transition-transform"
              style={{ color: 'var(--accent)' }}
            >
              <ClipboardList className="w-6 h-6" />
              <span className="text-xs font-medium">Templates</span>
            </button>
          )}
          <button
            onClick={() => { setMoreOpen(false); haptics.tap(); setAppMode('afterburn'); }}
            className="card flex flex-col items-center justify-center gap-2 py-5 active:scale-95 transition-transform text-[var(--text-muted)] border-[var(--border)]"
          >
            <Flame className="w-6 h-6" />
            <span className="text-xs font-medium">Afterburn</span>
          </button>
          <button
            onClick={() => { setMoreOpen(false); haptics.tap(); setAppMode('kairos'); }}
            className="card flex flex-col items-center justify-center gap-2 py-5 active:scale-95 transition-transform border-[var(--border)]"
            style={{ color: 'var(--kairos)' }}
          >
            <Sparkles className="w-6 h-6" />
            <span className="text-xs font-medium">Kairos</span>
          </button>
          <button
            onClick={() => { toggleTheme(); haptics.tap(); }}
            className="card flex flex-col items-center justify-center gap-2 py-5 active:scale-95 transition-transform"
          >
            {theme === 'dark' ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
            <span className="text-xs font-medium">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
