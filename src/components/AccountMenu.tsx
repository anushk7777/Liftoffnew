// Who am I signed in as, and how do I get out?
//
// Liftoff had no answer to either: the only sign-out lived inside the
// standalone coaching portal, so in the app proper you could neither see your
// account nor switch it. That matters because half the coaching UI keys off
// the signed-in address — being on the wrong Google account looked like a
// missing feature rather than a wrong login.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, LogOut, User } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase';
import { signOutOfLiftoff } from '../lib/auth';
import { useSessionEmail } from '../coaching/api';

export default function AccountMenu() {
  const { email, loading } = useSessionEmail();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (loading) return null;

  if (!email) {
    return (
      <button
        onClick={() => navigate('/login')}
        title="Sign in"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-[var(--accent-text)] transition-transform active:scale-95"
        style={{ background: 'var(--accent)' }}
      >
        <LogIn className="w-4 h-4" />
        Sign in
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={`Signed in as ${email}`}
        aria-label={`Account: ${email}`}
        aria-expanded={open}
        className="w-9 h-9 flex items-center justify-center rounded-full text-[13px] font-bold transition-transform active:scale-90"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
      >
        {email.slice(0, 1).toUpperCase()}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.14, ease: [0.21, 1, 0.4, 1] }}
            className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-border bg-[var(--surface)] p-1.5"
            style={{ boxShadow: 'var(--shadow-lg, 0 18px 40px -12px rgba(0,0,0,.55))' }}
          >
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                Signed in as
              </p>
              <p className="text-[13px] font-medium text-[var(--text)] break-all mt-0.5">{email}</p>
            </div>
            <button
              onClick={async () => {
                setOpen(false);
                await signOutOfLiftoff();
                navigate('/login');
              }}
              className="mt-1 w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
            {!isSupabaseConfigured && (
              <p className="px-3 py-2 text-[11.5px] text-[var(--text-subtle)]">
                Cloud sync isn't configured on this build.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The same control as a plain row, for Settings and the mobile sheet. */
export function AccountRow() {
  const { email, loading } = useSessionEmail();
  const navigate = useNavigate();
  if (loading) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex items-center gap-2.5 min-w-0">
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          {email ? email.slice(0, 1).toUpperCase() : <User className="w-4 h-4" />}
        </span>
        <span className="text-[13.5px] text-ink break-all">{email ?? 'Not signed in'}</span>
      </span>
      {email ? (
        <button
          onClick={async () => {
            await signOutOfLiftoff();
            navigate('/login');
          }}
          className="btn btn-secondary !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      ) : (
        <button
          onClick={() => navigate('/login')}
          className="btn btn-secondary !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5"
        >
          <LogIn className="w-3.5 h-3.5" /> Sign in
        </button>
      )}
    </div>
  );
}
