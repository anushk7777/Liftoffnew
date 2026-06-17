import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CheckSquare,
  Timer,
  Lightbulb,
  Map,
  BarChart3,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Moon,
  Sun,
  Sparkles,
  Search,
  Repeat,
  Rocket
} from 'lucide-react';
import { motion } from 'framer-motion';
import { differenceInCalendarDays } from 'date-fns';
import { useStore } from '../store/useStore';
import { cn } from '../lib/utils';
import { springSoft } from '../lib/motion';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/coach', label: 'Coach', icon: Sparkles },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/habits', label: 'Habits', icon: Repeat },
  { to: '/focus', label: 'Focus', icon: Timer },
  { to: '/brain-dump', label: 'Brain Dump', icon: Lightbulb },
  { to: '/roadmap', label: 'Roadmap', icon: Map },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
];

export default function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
  onOpenSearch,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  onOpenSearch?: () => void;
}) {
  const { targetDate, theme, toggleTheme } = useStore();
  const daysLeft = Math.max(0, differenceInCalendarDays(new Date(targetDate), new Date()));

  return (
    <aside
      className={cn(
        'flex h-screen flex-col bg-surface-container/40 backdrop-blur-xl border-r border-white/10 transition-all duration-300',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      <div className={cn("p-4 md:p-6", collapsed && "px-2")}>
        {/* Brand */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20 shrink-0 cursor-pointer" onClick={onToggle}>
              <Rocket className="w-5 h-5 text-on-primary" />
            </div>
            {!collapsed && (
              <div className="leading-tight animate-fade-in">
                <h1 className="font-display-lg text-[22px] font-bold bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent tracking-tight">Liftoff</h1>
                <p className="font-label-caps text-[9px] text-on-surface-variant tracking-widest mt-0.5">MISSION CONTROL</p>
              </div>
            )}
          </div>
        </div>

        {/* Search / command palette */}
        <div className="mb-6">
          <button
            onClick={onOpenSearch}
            title="Search (Ctrl/⌘ K)"
            className={cn(
              'w-full flex items-center gap-2 rounded-xl border border-white/5 bg-black/20 text-on-surface-variant hover:text-on-surface hover:bg-black/40 transition-colors',
              collapsed ? 'justify-center p-3' : 'px-4 py-3',
            )}
          >
            <Search className="w-4 h-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="text-sm flex-1 text-left">Search...</span>
                <kbd className="text-[10px] font-mono-data border border-white/10 rounded px-1.5 py-0.5 bg-white/5 text-on-surface-variant">⌘K</kbd>
              </>
            )}
          </button>
        </div>

        {/* Countdown banner */}
        {!collapsed && (
          <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 relative overflow-hidden group animate-fade-in">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-primary/20 transition-all"></div>
            <p className="font-label-caps text-[10px] text-primary tracking-widest mb-1">T-MINUS</p>
            <p className="font-display-lg text-3xl font-bold text-on-surface leading-none mb-1">{daysLeft}</p>
            <p className="text-xs text-on-surface-variant">days until target</p>
          </div>
        )}

        {/* Nav */}
        <nav className="space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl font-body-lg transition-all duration-300 relative group overflow-hidden',
                  collapsed ? 'justify-center p-3' : 'px-4 py-3',
                  isActive 
                    ? 'text-primary bg-primary/10 border border-primary/20 glow-indigo'
                    : 'text-on-surface-variant hover:bg-white/5 hover:text-on-surface border border-transparent'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && !collapsed && (
                    <motion.div
                      layoutId="navIndicator"
                      className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-primary rounded-r-full"
                      transition={springSoft}
                    />
                  )}
                  <Icon className={cn("w-5 h-5 shrink-0 relative z-10 transition-transform group-hover:scale-110", isActive && "text-primary drop-shadow-[0_0_8px_rgba(192,193,255,0.8)]")} />
                  {!collapsed && <span className="truncate relative z-10">{label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Footer */}
      <div className={cn("mt-auto p-4 md:p-6 border-t border-white/5", collapsed && "px-2")}>
        {!collapsed && (
          <div className="flex items-center gap-3 mb-6 bg-black/20 p-3 rounded-xl border border-white/5">
            <div className="w-10 h-10 rounded-full border border-white/20 overflow-hidden shrink-0">
               <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                 <span className="text-white font-bold text-sm">LF</span>
               </div>
            </div>
            <div className="overflow-hidden">
              <p className="font-bold text-sm text-on-surface truncate">Commander</p>
              <p className="text-[10px] font-mono-data text-on-surface-variant">Lvl 42 Archon</p>
            </div>
            <button className="ml-auto p-2 hover:bg-white/10 rounded-md text-on-surface-variant hover:text-on-surface transition-colors">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        )}

        <button
          onClick={toggleTheme}
          title="Toggle theme"
          className={cn(
            'flex items-center gap-3 w-full rounded-xl transition-colors text-on-surface-variant hover:text-on-surface hover:bg-white/5',
            collapsed ? 'justify-center p-3' : 'px-4 py-3'
          )}
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 shrink-0" />
          ) : (
            <Moon className="w-5 h-5 shrink-0" />
          )}
          {!collapsed && <span className="font-body-lg text-sm">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
        </button>
      </div>
    </aside>
  );
}
