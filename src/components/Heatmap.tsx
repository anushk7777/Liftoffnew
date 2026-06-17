import { useMemo } from 'react';
import { format, subDays, eachDayOfInterval, startOfDay } from 'date-fns';
import { cn } from '../lib/utils';
import type { ActivityLog } from '../store/useStore';

export function Heatmap({ history }: { history: ActivityLog[] }) {
  const days = useMemo(() => {
    const today = startOfDay(new Date());
    // Show last 90 days (about 3 months) to fit nicely on dashboard
    const start = subDays(today, 89);
    
    const dates = eachDayOfInterval({ start, end: today });
    const logMap = new Map(history.map(l => [l.date, l.type]));

    return dates.map(date => {
      const dateStr = startOfDay(date).toISOString();
      return {
        date,
        type: logMap.get(dateStr) || null,
      };
    });
  }, [history]);

  // Group days by week (columns)
  const weeks = useMemo(() => {
    const cols = [];
    let currentWeek = [];
    
    // Pad first week so Sunday is at top if we want a traditional layout, 
    // but for simplicity we can just flow them column by column (7 rows per col)
    for (const day of days) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        cols.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) cols.push(currentWeek);
    return cols;
  }, [days]);

  return (
    <div className="flex items-end gap-1 overflow-x-auto pb-2 scrollbar-none">
      {weeks.map((week, i) => (
        <div key={i} className="flex flex-col gap-1">
          {week.map((day, j) => (
            <div
              key={j}
              className={cn(
                'w-3 h-3 rounded-[3px] transition-colors',
                !day.type && 'bg-elevated border border-border/50',
                day.type === 'minimum' && 'bg-accent/40',
                day.type === 'full' && 'bg-accent',
              )}
              title={`${format(day.date, 'MMM d, yyyy')}${day.type ? ` - ${day.type} day` : ''}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
