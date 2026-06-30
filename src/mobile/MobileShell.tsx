import { useState, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CheckSquare, Timer, CalendarDays, MoreHorizontal, Plus, Search,
  Map, Sparkles, Repeat, Inbox, BarChart3, Settings as SettingsIcon, Moon, Sun, Flame,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useAppMode } from '../afterburn/mode';
import { cn } from '../lib/utils';
import { haptics } from '../lib/haptics';
import { BottomSheet } from './components/BottomSheet';
import { PullToRefresh } from './components/PullToRefresh';

import MobileToday from './screens/MobileToday';
import MobileTasks from './screens/MobileTasks';
import MobileRoadmap from './screens/MobileRoadmap';
import Focus from '../pages/Focus';
import Schedule from '../pages/Schedule';
import Coach from '../pages/Coach';
import Habits from '../pages/Habits';
import BrainDump from '../pages/BrainDump';
import SettingsPage from '../pages/Settings';
import { EmptyState } from '../components/ui';
const Stats = lazy(() => import('../pages/Stats'));

const TABS = [
  { to: '/', label: 'Today', icon: LayoutDashboard, end: true },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/focus', label: 'Focus', icon: Timer },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
];

const MORE_LINKS = [
  { to: '/roadmap', label: 'Roadmap', icon: Map },
  { to: '/coach', label: 'Coach', icon: Sparkles },
  { to: '/habits', label: 'Habits', icon: Repeat },
  { to: '/brain-dump', label: 'Brain Dump', icon: Inbox },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

const TITLES: Record<string, string> = {
  '/': 'Today', '/tasks': 'Tasks', '/focus': 'Focus', '/schedule': 'Schedule',
  '/roadmap': 'Roadmap', '/coach': 'Coach', '/habits': 'Habits',
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

  const title = TITLES[location.pathname] ?? 'Liftoff';

  const go = (to: string) => {
    setMoreOpen(false);
    navigate(to);
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-on-surface">
      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-between px-4 h-14 border-b border-white/10 bg-surface-container/70 backdrop-blur-md pt-[env(safe-area-inset-top)] box-content">
        <h1 className="font-display text-lg font-bold text-ink truncate">{title}</h1>
        <button
          onClick={onOpenSearch}
          aria-label="Search"
          className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-on-surface-variant active:bg-white/10"
        >
          <Search className="w-5 h-5" />
        </button>
      </header>

      {/* Scrollable content with pull-to-refresh sync */}
      <PullToRefresh onRefresh={() => useStore.getState().syncNow()} className="flex-1 min-h-0">
        <div className="px-4 py-5 pb-28">
          <Suspense fallback={<div className="py-16 text-center text-ink-subtle animate-pulse">Loading…</div>}>
            <Routes location={location}>
              <Route path="/" element={<MobileToday />} />
              <Route path="/tasks" element={<MobileTasks />} />
              <Route path="/focus" element={<Focus />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/roadmap" element={<MobileRoadmap />} />
              <Route path="/coach" element={<Coach />} />
              <Route path="/habits" element={<Habits />} />
              <Route path="/brain-dump" element={<BrainDump />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </div>
      </PullToRefresh>

      {/* Quick-add FAB */}
      <button
        onClick={() => { window.dispatchEvent(new Event('liftoff:quickadd')); haptics.tap(); }}
        aria-label="Quick add task"
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-40 w-14 h-14 rounded-full bg-[var(--accent)] text-[var(--accent-text)] shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* Bottom tab bar */}
      <nav className="shrink-0 grid grid-cols-5 border-t border-white/10 bg-surface-container/85 backdrop-blur-md pb-[env(safe-area-inset-bottom)] z-30">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[11px] font-medium',
                isActive ? 'text-primary' : 'text-on-surface-variant',
              )
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[11px] font-medium',
            MORE_LINKS.some((l) => l.to === location.pathname) ? 'text-primary' : 'text-on-surface-variant',
          )}
        >
          <MoreHorizontal className="w-5 h-5" />
          More
        </button>
      </nav>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid grid-cols-3 gap-3">
          {MORE_LINKS.map(({ to, label, icon: Icon }) => (
            <button
              key={to}
              onClick={() => go(to)}
              className={cn(
                'card flex flex-col items-center justify-center gap-2 py-5 active:scale-95 transition-transform',
                location.pathname === to && 'border-primary/40 text-primary',
              )}
            >
              <Icon className="w-6 h-6" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
          <button
            onClick={() => { setMoreOpen(false); haptics.tap(); setAppMode('afterburn'); }}
            className="card flex flex-col items-center justify-center gap-2 py-5 active:scale-95 transition-transform text-[var(--text-muted)] border-[var(--border)]"
          >
            <Flame className="w-6 h-6" />
            <span className="text-xs font-medium">Afterburn</span>
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
