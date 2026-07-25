// Progress photos — upload slots for a check-in, and a draggable before/after
// comparison that is the thing clients actually feel motivated by.
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, X, ImageOff, MoveHorizontal } from 'lucide-react';
import { cn } from '../lib/utils';
import { photoUrls, type Metric } from './api';

/** Two file slots (front / side) with instant local previews. */
export function PhotoSlots({
  files,
  onChange,
}: {
  files: { front: File | null; side: File | null };
  onChange: (slot: 'front' | 'side', file: File | null) => void;
}) {
  const [previews, setPreviews] = useState<{ front?: string; side?: string }>({});

  useEffect(() => {
    const next: { front?: string; side?: string } = {};
    const urls: string[] = [];
    (['front', 'side'] as const).forEach((slot) => {
      const f = files[slot];
      if (f) {
        const u = URL.createObjectURL(f);
        next[slot] = u;
        urls.push(u);
      }
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- object URLs must be created as a side effect and revoked on cleanup
    setPreviews(next);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  return (
    <div className="grid grid-cols-2 gap-3">
      {(['front', 'side'] as const).map((slot) => (
        <label
          key={slot}
          className={cn(
            'relative h-32 rounded-xl border border-dashed cursor-pointer overflow-hidden',
            'flex flex-col items-center justify-center gap-2 transition-colors',
            files[slot] ? 'border-transparent' : 'border-[var(--border-strong)] hover:border-[var(--accent)]',
          )}
        >
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => onChange(slot, e.target.files?.[0] ?? null)}
          />
          {previews[slot] ? (
            <>
              <img src={previews[slot]} alt={`${slot} preview`} className="absolute inset-0 w-full h-full object-cover" />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onChange(slot, null);
                }}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white backdrop-blur-sm"
                aria-label={`Remove ${slot} photo`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <Camera className="w-6 h-6 text-[var(--text-subtle)]" />
              <span className="text-[12px] font-medium text-[var(--text-muted)] capitalize">{slot}</span>
            </>
          )}
        </label>
      ))}
    </div>
  );
}

/**
 * Before/after comparison. The top image is clipped to the handle position, so
 * dragging wipes between the two shots.
 */
export function CompareSlider({
  beforeUrl,
  afterUrl,
  beforeLabel,
  afterLabel,
}: {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel: string;
  afterLabel: string;
}) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromClientX = useCallback((clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      const x = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
      if (x != null) setFromClientX(x);
    };
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
    };
  }, [setFromClientX]);

  return (
    <div
      ref={ref}
      onMouseDown={(e) => {
        dragging.current = true;
        setFromClientX(e.clientX);
      }}
      onTouchStart={(e) => {
        dragging.current = true;
        const x = e.touches[0]?.clientX;
        if (x != null) setFromClientX(x);
      }}
      className="relative aspect-[3/4] rounded-xl overflow-hidden select-none cursor-ew-resize border border-[var(--border)]"
    >
      <img src={afterUrl} alt="After" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={beforeUrl} alt="Before" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      </div>

      <span className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white backdrop-blur-sm">
        {beforeLabel}
      </span>
      <span className="absolute top-2 right-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white backdrop-blur-sm">
        {afterLabel}
      </span>

      <div className="absolute inset-y-0 w-0.5 bg-white/90 pointer-events-none" style={{ left: `${pos}%` }} />
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center pointer-events-none"
        style={{ left: `${pos}%` }}
      >
        <MoveHorizontal className="w-4 h-4 text-black" />
      </div>
    </div>
  );
}

/** Gallery + comparison for a client's photo history. */
export function ProgressPhotos({ metrics }: { metrics: Metric[] }) {
  const withPhotos = metrics.filter((m) => m.photo_front || m.photo_side);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [slot, setSlot] = useState<'front' | 'side'>('front');

  useEffect(() => {
    const paths = withPhotos.flatMap((m) => [m.photo_front, m.photo_side]);
    if (!paths.some(Boolean)) return;
    let alive = true;
    // Absolute URLs (demo/preview data) are already displayable; only storage
    // object paths need a signed URL.
    const direct: Record<string, string> = {};
    const needSigning: (string | null)[] = [];
    for (const p of paths) {
      if (!p) continue;
      if (/^(https?:|data:)/.test(p)) direct[p] = p;
      else needSigning.push(p);
    }
    if (!needSigning.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resolving external URLs for display
      setUrls(direct);
      return;
    }
    photoUrls(needSigning)
      .then((u) => {
        if (alive) setUrls({ ...direct, ...u });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the photo paths themselves
  }, [metrics.map((m) => `${m.photo_front}|${m.photo_side}`).join(',')]);

  if (withPhotos.length === 0) {
    return (
      <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">Progress photos</span>
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
          <ImageOff className="w-7 h-7 text-[var(--text-subtle)]" />
          <p className="text-sm text-[var(--text-subtle)] max-w-xs">
            Add a front and side photo to your check-in — you'll see them side by side here as you change.
          </p>
        </div>
      </section>
    );
  }

  const key = slot === 'front' ? 'photo_front' : 'photo_side';
  const shots = withPhotos.filter((m) => m[key]);
  const first = shots[0];
  const last = shots[shots.length - 1];
  const canCompare = shots.length > 1 && first && last && urls[first[key]!] && urls[last[key]!];

  return (
    <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">Progress photos</span>
        <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--elevated)] border border-[var(--border)]">
          {(['front', 'side'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSlot(s)}
              className={cn(
                'px-2.5 py-1 rounded-md text-[12px] font-medium capitalize transition-colors',
                slot === s ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]',
              )}
              style={slot === s ? { background: 'var(--accent)' } : undefined}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {canCompare ? (
        <>
          <CompareSlider
            beforeUrl={urls[first[key]!]}
            afterUrl={urls[last[key]!]}
            beforeLabel={first.taken_on.slice(5)}
            afterLabel={last.taken_on.slice(5)}
          />
          <p className="text-[11.5px] text-[var(--text-subtle)] mt-2.5 text-center">Drag to compare</p>
        </>
      ) : shots.length === 1 && urls[shots[0][key]!] ? (
        <div className="max-w-[260px] mx-auto">
          <img src={urls[shots[0][key]!]} alt="Progress" className="w-full rounded-xl border border-[var(--border)]" />
          <p className="text-[11.5px] text-[var(--text-subtle)] mt-2 text-center">
            One more check-in photo and you'll get a before/after slider.
          </p>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-subtle)] py-6 text-center">No {slot} photos yet.</p>
      )}

      {/* Thumbnail strip */}
      {shots.length > 1 && (
        <div className="flex gap-2 mt-4 overflow-x-auto no-scrollbar">
          {shots.map((m) => {
            const u = urls[m[key]!];
            return u ? (
              <motion.img
                key={m.id}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                src={u}
                alt={m.taken_on}
                title={m.taken_on}
                className="h-16 w-12 object-cover rounded-lg border border-[var(--border)] shrink-0"
              />
            ) : null;
          })}
        </div>
      )}
    </section>
  );
}
