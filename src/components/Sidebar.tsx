import { NavLink } from 'react-router-dom';
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
  HelpCircle,
  CalendarDays,
  Flame,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useAppMode } from '../afterburn/mode';
import { cn } from '../lib/utils';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/coach', label: 'Coach', icon: Sparkles },
  { to: '/focus', label: 'Focus', icon: Timer },
  { to: '/roadmap', label: 'Roadmap', icon: Map },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
];

export default function Sidebar({
  onNavigate,
  onOpenSearch,
}: {
  onNavigate?: () => void;
  onOpenSearch?: () => void;
}) {
  const { theme, toggleTheme } = useStore();
  const setAppMode = useAppMode((s) => s.setMode);

  return (
    <nav className="flex flex-col h-full py-6 px-4 w-64 bg-[var(--bg)] border-r border-white/5 z-50 transition-colors duration-300">
      {/* Brand / Header */}
      <div className="flex items-center gap-3 mb-10 pl-2 text-[var(--text)]">
        <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
          <path d="M12 2 L20 21 L12 16.5 L4 21 Z" fill="currentColor" />
        </svg>
        <span className="text-[28px] leading-none" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>Liftoff</span>
      </div>

      {/* Navigation Tabs */}
      <ul className="flex-1 space-y-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-4 px-4 py-3 rounded-xl font-medium transition-all duration-200 active:scale-95',
                  isActive 
                    ? 'bg-[var(--accent)] text-[var(--accent-text)] font-semibold' 
                    : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:neo-button'
                )
              }
            >
              <Icon className="w-5 h-5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }} />
              <span className="font-body text-sm">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Footer Tabs */}
      <div className="mt-auto pt-4 space-y-3 border-t border-white/5">
        <button
          onClick={() => setAppMode('afterburn')}
          className="mode-switch mode-switch-ember w-full justify-center"
        >
          <Flame className="w-5 h-5 shrink-0" />
          <span className="font-body text-sm">Enter Afterburn</span>
        </button>
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-[var(--text-muted)] font-medium hover:text-[var(--accent)] hover:neo-button transition-all duration-200 active:scale-95"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5 shrink-0" /> : <Moon className="w-5 h-5 shrink-0" />}
          <span className="font-body text-sm">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <NavLink 
          to="/settings"
          onClick={onNavigate}
          className="flex items-center gap-4 px-4 py-3 rounded-xl text-[var(--text-muted)] font-medium hover:text-[var(--accent)] hover:neo-button transition-all duration-200 active:scale-95"
        >
          <Settings className="w-5 h-5 shrink-0" />
          <span className="font-body text-sm">Settings</span>
        </NavLink>
        <button 
          onClick={onOpenSearch}
          className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-[var(--text-muted)] font-medium hover:text-[var(--accent)] hover:neo-button transition-all duration-200 active:scale-95"
        >
          <HelpCircle className="w-5 h-5 shrink-0" />
          <span className="font-body text-sm">Command Palette</span>
        </button>
      </div>
    </nav>
  );
}
