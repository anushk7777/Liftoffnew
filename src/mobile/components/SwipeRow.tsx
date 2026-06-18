import { useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Check, Trash2 } from 'lucide-react';
import { haptics } from '../../lib/haptics';

const THRESHOLD = 96;

// A horizontally-swipeable row. Swipe right past the threshold = complete,
// swipe left = delete. Either handler is optional; the matching direction is
// disabled when its handler is absent.
export function SwipeRow({
  onComplete,
  onDelete,
  children,
}: {
  onComplete?: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}) {
  const x = useMotionValue(0);
  const [armed, setArmed] = useState<null | 'complete' | 'delete'>(null);
  const completeOpacity = useTransform(x, [0, THRESHOLD], [0, 1]);
  const deleteOpacity = useTransform(x, [-THRESHOLD, 0], [1, 0]);

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Action backdrops */}
      <div className="absolute inset-0 flex items-center justify-between px-5 pointer-events-none">
        <motion.span style={{ opacity: onComplete ? completeOpacity : 0 }} className="text-accent">
          <Check className="w-5 h-5" />
        </motion.span>
        <motion.span style={{ opacity: onDelete ? deleteOpacity : 0 }} className="text-danger">
          <Trash2 className="w-5 h-5" />
        </motion.span>
      </div>

      <motion.div
        drag="x"
        style={{ x }}
        dragConstraints={{ left: onDelete ? -THRESHOLD * 1.4 : 0, right: onComplete ? THRESHOLD * 1.4 : 0 }}
        dragElastic={0.2}
        onDrag={(_, info) => {
          const next =
            onComplete && info.offset.x > THRESHOLD ? 'complete' : onDelete && info.offset.x < -THRESHOLD ? 'delete' : null;
          if (next !== armed) {
            setArmed(next);
            if (next) haptics.tap();
          }
        }}
        onDragEnd={(_, info) => {
          if (onComplete && info.offset.x > THRESHOLD) {
            haptics.success();
            onComplete();
          } else if (onDelete && info.offset.x < -THRESHOLD) {
            haptics.warn();
            onDelete();
          }
          setArmed(null);
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
