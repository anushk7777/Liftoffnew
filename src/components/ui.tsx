import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { animate } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useReducedMotion } from '../lib/motion';

// Smoothly counts from the previous value to the new one.
export function AnimatedNumber({ value }: { value: number }) {
  const rm = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (rm || prev.current === value) {
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration: 0.6,
      ease: [0.21, 1, 0.4, 1],
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, rm]);

  return <>{Math.round(rm ? value : display)}</>;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-1 w-9 h-9 rounded-lg bg-elevated border border-border flex items-center justify-center text-ink-muted">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-2xl sm:text-[28px] font-bold tracking-[-0.02em] text-ink">
            {title}
          </h1>
          {subtitle && <p className="text-sm text-ink-muted mt-1">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-2 w-full rounded-full bg-elevated overflow-hidden', className)}>
      <div
        className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={cn('card p-4', accent && 'border-accent/40')}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{label}</p>
        {icon && <span className="text-ink-subtle">{icon}</span>}
      </div>
      <p className="font-display text-2xl font-bold text-ink mt-2">
        {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
      </p>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // Prevent background scrolling when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div
        className={cn(
          'relative w-full max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)] flex flex-col bg-surface border border-border shadow-2xl rounded-xl animate-rise',
          maxWidth,
        )}
      >
        {title && (
          <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 -mr-1.5 rounded-md text-ink-subtle hover:text-ink hover:bg-hover transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-5 custom-scrollbar">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-xl border border-dashed border-border">
      {icon && <div className="text-ink-subtle mb-3">{icon}</div>}
      <p className="text-sm font-medium text-ink-muted">{title}</p>
      {hint && <p className="text-xs text-ink-subtle mt-1 max-w-xs">{hint}</p>}
    </div>
  );
}

const PRIORITY_STYLES: Record<string, string> = {
  high: 'text-danger border-danger/30 bg-danger/10',
  medium: 'text-warning border-warning/30 bg-warning/10',
  low: 'text-ink-muted border-border bg-elevated',
};

export function PriorityDot({ priority }: { priority: string }) {
  const color =
    priority === 'high' ? 'bg-danger' : priority === 'medium' ? 'bg-warning' : 'bg-ink-subtle';
  return <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', color)} />;
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={cn(
        'text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border',
        PRIORITY_STYLES[priority] || PRIORITY_STYLES.low,
      )}
    >
      {priority}
    </span>
  );
}
