import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

// A mobile bottom sheet: slides up from the bottom, dim backdrop, drag-down to
// dismiss. Used for the "More" menu and as the mobile replacement for centered
// modals. Mirrors the Escape + scroll-lock behaviour of components/ui.tsx Modal.
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={cn(
              'relative w-full max-h-[85vh] flex flex-col bg-surface border-t border-border rounded-t-3xl shadow-2xl pb-[env(safe-area-inset-bottom)]',
              className,
            )}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            <div className="shrink-0 flex justify-center pt-3 pb-1" aria-hidden>
              <span className="h-1.5 w-10 rounded-full bg-border-strong" />
            </div>
            {title && (
              <h2 className="px-5 pb-3 font-display text-lg font-bold text-ink">{title}</h2>
            )}
            <div className="flex-1 overflow-y-auto px-5 pb-6 custom-scrollbar">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
