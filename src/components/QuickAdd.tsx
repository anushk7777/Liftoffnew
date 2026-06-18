import { useState } from 'react';
import { motion } from 'framer-motion';
import { startOfDay } from 'date-fns';
import { Plus, Clock, CalendarClock, Bell, Zap, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { pop, useReducedMotion } from '../lib/motion';
import { requestNotificationPermission } from '../lib/reminders';
import { useIsMobile } from '../lib/useIsMobile';
import { BottomSheet } from '../mobile/components/BottomSheet';

// datetime-local helpers (work in the user's local timezone)
const toLocalInput = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

export default function QuickAdd({ onClose }: { onClose: () => void }) {
  const addTask = useStore((s) => s.addTask);
  const rm = useReducedMotion();
  const isMobile = useIsMobile();

  const [title, setTitle] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  const openScheduling = async () => {
    if (!scheduling) {
      setScheduling(true);
      if (!scheduledAt) setScheduledAt(toLocalInput(new Date(Date.now() + 60 * 60000)));
      // Ask once so the in-app alarm can also surface an OS notification.
      requestNotificationPermission();
    }
  };

  const setChip = (d: Date) => {
    setScheduling(true);
    setScheduledAt(toLocalInput(d));
    requestNotificationPermission();
  };
  const now = () => setChip(new Date());
  const plusHour = () => setChip(new Date(Date.now() + 60 * 60000));
  const tonight = () => {
    const d = new Date();
    d.setHours(20, 0, 0, 0);
    setChip(d);
  };
  const tomorrow9 = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    setChip(d);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const sched = scheduling && scheduledAt ? new Date(scheduledAt) : null;
    addTask({
      title: title.trim(),
      scheduledAt: sched ? sched.toISOString() : undefined,
      dueDate: sched ? startOfDay(sched).toISOString() : undefined,
      priority: 'medium',
      status: 'todo',
    });
    onClose();
  };

  const body = (
    <>
      {/* Title row */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center shrink-0">
            <Plus className="w-4 h-4 text-accent" />
          </div>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task…"
            className="flex-1 bg-transparent text-base text-ink placeholder:text-ink-subtle focus:outline-none py-1.5"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-ink-subtle hover:text-ink hover:bg-hover"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Schedule toggle / panel */}
        <div className="mt-3 pl-10">
          {!scheduling ? (
            <button
              type="button"
              onClick={openScheduling}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border text-ink-muted hover:text-ink hover:bg-hover transition-colors"
            >
              <CalendarClock className="w-3.5 h-3.5" /> Schedule a time
            </button>
          ) : (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip onClick={now} icon={<Clock className="w-3.5 h-3.5" />}>Now</Chip>
                <Chip onClick={plusHour}>+1h</Chip>
                <Chip onClick={tonight}>Tonight</Chip>
                <Chip onClick={tomorrow9}>Tomorrow 9am</Chip>
              </div>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="input w-full"
              />
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-accent">
                  <Bell className="w-3 h-3" /> In-app alarm + notification at this time
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setScheduling(false);
                    setScheduledAt('');
                  }}
                  className="text-xs text-ink-subtle hover:text-ink"
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pl-10">
          <span className="text-[11px] text-ink-subtle inline-flex items-center gap-1">
            <Zap className="w-3 h-3" /> Enter to add
          </span>
          <button type="submit" disabled={!title.trim()} className="btn btn-primary disabled:opacity-40">
            <Plus className="w-4 h-4" /> Add task
          </button>
        </div>
    </>
  );

  // Mobile: a bottom sheet that sits above the keyboard. Desktop: a centered,
  // top-anchored command-style modal.
  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose}>
        <form onSubmit={submit}>{body}</form>
      </BottomSheet>
    );
  }

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[12vh] sm:pt-[14vh]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: rm ? 0 : 0.16 }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.form
        onSubmit={submit}
        className="relative w-full max-w-lg card shadow-lg p-4 max-h-[80vh] overflow-y-auto"
        initial={{ opacity: 0, scale: rm ? 1 : 0.95, y: rm ? 0 : 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: rm ? 1 : 0.97, y: rm ? 0 : 6 }}
        transition={rm ? { duration: 0 } : pop}
      >
        {body}
      </motion.form>
    </motion.div>
  );
}

function Chip({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border border-border text-ink-muted hover:text-ink hover:border-border-strong hover:bg-hover transition-colors active:scale-95"
    >
      {icon}
      {children}
    </button>
  );
}
