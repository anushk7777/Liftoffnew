import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlarmClock, Check, Clock, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { beep } from '../lib/sound';
import { clearNotified } from '../lib/reminders';
import { useReducedMotion } from '../lib/motion';

interface AlarmInfo {
  id: string;
  title: string;
}

// A real in-app alarm: rings (looping chime) and pops a dismiss/snooze/done
// card when a scheduled task comes due. No OS permission required.
export default function AlarmOverlay() {
  const [alarm, setAlarm] = useState<AlarmInfo | null>(null);
  const setTaskStatus = useStore((s) => s.setTaskStatus);
  const updateTask = useStore((s) => s.updateTask);
  const rm = useReducedMotion();
  const ringRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const onAlarm = (e: Event) => setAlarm((e as CustomEvent).detail as AlarmInfo);
    window.addEventListener('liftoff:alarm', onAlarm);
    return () => window.removeEventListener('liftoff:alarm', onAlarm);
  }, []);

  // Ring while the alarm card is up.
  useEffect(() => {
    if (!alarm) return;
    beep();
    ringRef.current = setInterval(() => beep(), 1500);
    return () => {
      if (ringRef.current) clearInterval(ringRef.current);
    };
  }, [alarm]);

  const dismiss = () => setAlarm(null);
  const done = () => {
    if (alarm) setTaskStatus(alarm.id, 'done');
    setAlarm(null);
  };
  const snooze = (mins: number) => {
    if (alarm) {
      updateTask(alarm.id, { scheduledAt: new Date(Date.now() + mins * 60000).toISOString() });
      clearNotified(alarm.id);
    }
    setAlarm(null);
  };

  return (
    <AnimatePresence>
      {alarm && (
        <motion.div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismiss} />
          <motion.div
            className="relative card shadow-lg p-6 max-w-sm w-full text-center"
            initial={{ scale: rm ? 1 : 0.9, y: rm ? 0 : 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: rm ? 1 : 0.96, opacity: 0 }}
            transition={rm ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 26 }}
          >
            <button
              onClick={dismiss}
              className="absolute top-3 right-3 p-1.5 rounded-md text-text-subtle hover:text-text hover:bg-hover"
            >
              <X className="w-4 h-4" />
            </button>
            <motion.div
              className="mx-auto w-14 h-14 rounded-full bg-accent-soft flex items-center justify-center mb-4"
              animate={rm ? {} : { rotate: [0, -12, 12, -10, 10, 0] }}
              transition={rm ? undefined : { repeat: Infinity, duration: 1.3, ease: 'easeInOut' }}
            >
              <AlarmClock className="w-7 h-7 text-accent" />
            </motion.div>
            <p className="text-[11px] uppercase tracking-wider text-text-subtle">Reminder</p>
            <h2 className="font-display text-xl font-bold text-text mt-1 leading-snug">{alarm.title}</h2>

            <div className="grid grid-cols-2 gap-2 mt-5">
              <button onClick={() => snooze(5)} className="btn btn-secondary">
                <Clock className="w-4 h-4" /> 5 min
              </button>
              <button onClick={() => snooze(10)} className="btn btn-secondary">
                <Clock className="w-4 h-4" /> 10 min
              </button>
            </div>
            <button onClick={done} className="btn btn-primary w-full mt-2">
              <Check className="w-4 h-4" /> Mark done
            </button>
            <button onClick={dismiss} className="btn btn-ghost w-full mt-1 text-xs">
              Dismiss
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
