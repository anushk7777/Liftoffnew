import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  CheckSquare,
  Timer,
  Map,
  BarChart3,
  Settings,
  Moon,
  Sun,
  Sparkles,
  Flame,
  Search,
  Plus,
  Users,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useAppMode } from '../afterburn/mode';
import { useSessionEmail, isCoach, useUnreadTotal } from '../coaching/api';
import { cn } from '../lib/utils';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/roadmap', label: 'Roadmap', icon: Map },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/focus', label: 'Focus', icon: Timer },
  { to: '/coach', label: 'Coach', icon: Sparkles },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
];

const CLIENTS_ITEM = { to: '/clients', label: 'Clients', icon: Users, end: false };

export default function TopNav({
  onOpenSearch,
  onQuickAdd,
}: {
  onOpenSearch?: () => void;
  onQuickAdd?: () => void;
}) {
  const { theme, toggleTheme } = useStore();
  const setAppMode = useAppMode((s) => s.setMode);
  const { email } = useSessionEmail();
  const coach = isCoach(email);
  // The coaching roster is visible only to the coach's own account.
  const navItems = coach ? [...NAV, CLIENTS_ITEM] : NAV;
  const unread = useUnreadTotal(coach);

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.21, 1, 0.4, 1] }}
      className="topnav-underglow shrink-0 relative z-40 flex items-center gap-4 h-16 px-6 border-b border-border bg-[var(--sidebar)]/85 backdrop-blur-xl"
    >
      {/* Brand */}
      <NavLink to="/" className="flex items-center gap-2.5 shrink-0 text-[var(--text)] group">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="shrink-0 text-[var(--accent)] transition-transform group-hover:scale-105"
        >
          <path d="M12 2 L20 21 L12 16.5 L4 21 Z" fill="currentColor" />
        </svg>
        <span className="text-[19px] font-bold tracking-tight leading-none" style={{ fontFamily: 'var(--font-display)' }}>
          Liftoff
        </span>
      </NavLink>

      {/* Primary nav */}
      <nav className="self-stretch flex items-stretch flex-1 justify-center gap-0.5 overflow-x-auto no-scrollbar">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'group/nav relative flex items-center gap-2 px-3 my-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                isActive
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="w-[17px] h-[17px] shrink-0 relative z-10 transition-transform group-hover/nav:scale-110" />
                <span className="relative z-10">{label}</span>
                {to === '/clients' && unread > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                    className="relative z-10 min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-bold flex items-center justify-center"
                    style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
                  >
                    {unread > 9 ? '9+' : unread}
                  </motion.span>
                )}
                {isActive && (
                  <motion.span
                    layoutId="topnav-underline"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="absolute left-3 right-3 -bottom-2 h-[2px] rounded-full bg-[var(--accent)]"
                    style={{ boxShadow: '0 0 8px var(--accent)' }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Right cluster */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* World switchers — keep their own signature colours */}
        <button
          onClick={() => setAppMode('afterburn')}
          title="Enter Afterburn"
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-semibold transition-[transform,filter,box-shadow] hover:scale-105 hover:brightness-110 active:scale-95"
          style={{ color: 'var(--ember)', background: 'var(--ember-soft)' }}
        >
          <Flame className="w-4 h-4" />
          Afterburn
        </button>
        <button
          onClick={() => setAppMode('kairos')}
          title="Enter Kairos"
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-semibold transition-[transform,filter,box-shadow] hover:scale-105 hover:brightness-110 active:scale-95"
          style={{ color: 'var(--kairos)', background: 'var(--kairos-soft)' }}
        >
          <Sparkles className="w-4 h-4" />
          Kairos
        </button>

        <span className="hidden lg:block w-px h-6 bg-border mx-1" />

        <button
          onClick={onOpenSearch}
          title="Search (⌘K)"
          className="flex items-center gap-2 rounded-lg border border-border bg-[var(--bg)]/60 text-[var(--text-subtle)] hover:text-[var(--text)] hover:border-border-strong transition-colors px-2.5 py-1.5"
        >
          <Search className="w-[16px] h-[16px]" />
          <kbd className="hidden lg:inline text-[10px] font-medium border border-border rounded px-1.5 py-0.5">⌘K</kbd>
        </button>

        <button
          onClick={onQuickAdd}
          title="Quick add (⌘N)"
          aria-label="Quick add"
          className="glow-accent w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)] active:scale-90"
        >
          <Plus className="w-[18px] h-[18px]" />
        </button>

        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          aria-label="Toggle theme"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
        </button>

        <NavLink
          to="/settings"
          title="Settings"
          className={({ isActive }) =>
            cn(
              'w-9 h-9 flex items-center justify-center rounded-lg transition-colors',
              isActive
                ? 'text-[var(--accent)] bg-[var(--accent-soft)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]',
            )
          }
        >
          <Settings className="w-[18px] h-[18px]" />
        </NavLink>
      </div>
    </motion.header>
  );
}
