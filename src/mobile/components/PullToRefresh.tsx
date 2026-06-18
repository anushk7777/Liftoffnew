import { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { haptics } from '../../lib/haptics';
import { useReducedMotion } from '../../lib/motion';

const TRIGGER = 72;

// Wraps a scrollable region and runs `onRefresh` when the user pulls down past
// the threshold while already scrolled to the top. Touch-only (no-op on
// desktop, which never sends these touch events).
export function PullToRefresh({
  onRefresh,
  children,
  className,
}: {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const reduceMotion = useReducedMotion();

  const onTouchStart = (e: React.TouchEvent) => {
    if (ref.current && ref.current.scrollTop <= 0 && !refreshing) {
      startY.current = e.touches[0].clientY;
      setDragging(true);
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setPull(Math.min(delta * 0.5, TRIGGER + 24));
  };
  const onTouchEnd = async () => {
    if (startY.current == null) return;
    const shouldRefresh = pull >= TRIGGER;
    startY.current = null;
    setDragging(false);
    if (shouldRefresh) {
      setRefreshing(true);
      setPull(TRIGGER);
      haptics.tap();
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  };

  return (
    <div
      ref={ref}
      className={cn('relative overflow-y-auto custom-scrollbar overscroll-y-contain', className)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center text-on-surface-variant pointer-events-none z-10"
        style={{ top: 8, opacity: pull > 8 || refreshing ? 1 : 0 }}
      >
        <RefreshCw
          className={cn('w-5 h-5', refreshing && !reduceMotion && 'animate-spin')}
          style={{ transform: reduceMotion ? undefined : `rotate(${pull * 3}deg)` }}
        />
      </div>
      <div style={{ transform: `translateY(${pull}px)`, transition: dragging || reduceMotion ? 'none' : 'transform 0.2s' }}>
        {children}
      </div>
    </div>
  );
}
