import React, { useState } from 'react';
import { format, isValid } from 'date-fns';
import { Calendar as CalendarIcon, Clock, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface DateTimePickerProps {
  value: string; // ISO string
  onChange: (val: string) => void;
  className?: string;
}

export function DateTimePicker({ value, onChange, className }: DateTimePickerProps) {
  const dateObj = value ? new Date(value) : null;
  const initialDateStr = dateObj && isValid(dateObj) ? format(dateObj, 'yyyy-MM-dd') : '';
  const initialTimeStr = dateObj && isValid(dateObj) ? format(dateObj, 'HH:mm') : '';

  const [dateStr, setDateStr] = useState(initialDateStr);
  const [timeStr, setTimeStr] = useState(initialTimeStr);

  const handleDateChange = (newDate: string) => {
    setDateStr(newDate);
    if (!newDate) {
      onChange('');
      return;
    }
    const t = timeStr || '12:00';
    onChange(`${newDate}T${t}:00`);
  };

  const handleTimeChange = (newTime: string) => {
    setTimeStr(newTime);
    if (!dateStr) return; // need date first
    if (!newTime) {
      // just clear time, keep date at 00:00
      onChange(`${dateStr}T00:00:00`);
      return;
    }
    onChange(`${dateStr}T${newTime}:00`);
  };

  const clear = () => {
    setDateStr('');
    setTimeStr('');
    onChange('');
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative flex items-center">
        <CalendarIcon className="w-4 h-4 text-ink-subtle absolute left-2 pointer-events-none" />
        <input
          type="date"
          value={dateStr}
          onChange={(e) => handleDateChange(e.target.value)}
          className="input !py-1.5 !pl-8 !pr-2 text-sm bg-elevated border-border hover:border-ink-subtle focus:border-accent"
        />
      </div>
      {dateStr && (
        <div className="relative flex items-center animate-fade-in">
          <Clock className="w-4 h-4 text-ink-subtle absolute left-2 pointer-events-none" />
          <input
            type="time"
            value={timeStr}
            onChange={(e) => handleTimeChange(e.target.value)}
            className="input !py-1.5 !pl-8 !pr-2 text-sm bg-elevated border-border hover:border-ink-subtle focus:border-accent"
          />
        </div>
      )}
      {value && (
        <button
          type="button"
          onClick={clear}
          className="p-1.5 rounded-md text-ink-subtle hover:text-danger hover:bg-danger/10 transition-colors animate-fade-in"
          title="Clear schedule"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
