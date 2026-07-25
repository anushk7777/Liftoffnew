// Progress photos — upload slots for a check-in, and a draggable before/after
// comparison that is the thing clients actually feel motivated by.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, ImageOff, MoveHorizontal, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { photoUrls, deletePhoto, type Metric } from './api';
import { monthGrid, dayKey } from './schedule';

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

/**
 * Photo archive: a month calendar of shots, any two of which can be compared.
 *
 * The old gallery was a single horizontal strip that always compared the first
 * shot against the last. That works for three entries and falls apart after
 * that — you cannot find May, and you cannot ask "how do I look against six
 * weeks ago" when the last shot is yesterday. So: a calendar you scan by month,
 * tap a day to open it, and pick the two days you actually want side by side.
 *
 * Signed URLs are minted per visible month plus the two comparison slots, not
 * for the whole history. A year of check-ins is ~24 signed URLs on screen
 * instead of 700, and they expire in an hour either way.
 */
export function ProgressPhotos({
  metrics,
  canDelete = false,
  onChanged,
}: {
  metrics: Metric[];
  /** Only the owner may delete — RLS gives the coach read-only on the bucket. */
  canDelete?: boolean;
  onChanged?: () => void;
}) {
  const [slot, setSlot] = useState<'front' | 'side'>('front');
  const [view, setView] = useState<'archive' | 'compare'>('archive');
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [open, setOpen] = useState<string | null>(null); // day key in the lightbox
  const [aPick, setA] = useState<string | null>(null);
  const [bPick, setB] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const key = slot === 'front' ? 'photo_front' : 'photo_side';

  /** Day key -> the metric row holding a photo in the active slot. */
  const byDay = useMemo(() => {
    const m = new Map<string, Metric>();
    for (const row of metrics) if (row[key]) m.set(row.taken_on, row);
    return m;
  }, [metrics, key]);

  const days = useMemo(() => [...byDay.keys()].sort(), [byDay]);

  // The comparison defaults to the widest span available and is derived, not
  // synced: state holds only what the user explicitly picked, and a pick that
  // no longer exists (slot switched, photo deleted) falls back on its own.
  const a = aPick && byDay.has(aPick) ? aPick : (days[0] ?? null);
  const b = bPick && byDay.has(bPick) ? bPick : (days[days.length - 1] ?? null);

  const grid = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  // Sign only what is on screen: this month's photos, the lightbox, and A/B.
  const needed = useMemo(() => {
    const want = new Set<string>();
    for (const d of grid) {
      const row = byDay.get(dayKey(d));
      if (row?.[key]) want.add(row[key] as string);
    }
    for (const d of [open, a, b]) {
      const row = d ? byDay.get(d) : null;
      if (row?.[key]) want.add(row[key] as string);
    }
    return [...want];
  }, [grid, byDay, key, open, a, b]);

  useEffect(() => {
    const missing = needed.filter((p) => !urls[p]);
    if (!missing.length) return;
    // Absolute URLs (preview/demo rows) are already displayable.
    const direct: Record<string, string> = {};
    const sign: string[] = [];
    for (const p of missing) {
      if (/^(https?:|data:)/.test(p)) direct[p] = p;
      else sign.push(p);
    }
    let alive = true;
    if (!sign.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resolving external URLs for display
      setUrls((u) => ({ ...u, ...direct }));
      return;
    }
    photoUrls(sign)
      .then((signed) => alive && setUrls((u) => ({ ...u, ...direct, ...signed })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [needed, urls]);

  const urlFor = (day: string | null) => {
    const row = day ? byDay.get(day) : null;
    const path = row?.[key] as string | undefined;
    return path ? urls[path] : undefined;
  };

  const pretty = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const remove = async (day: string) => {
    const row = byDay.get(day);
    if (!row || busy) return;
    setBusy(true);
    try {
      await deletePhoto(row.id, slot, row[key] as string | null);
      setOpen(null);
      onChanged?.();
    } catch (e) {
      console.error('Could not delete photo', e);
    } finally {
      setBusy(false);
    }
  };

  const anyPhotos = metrics.some((m) => m.photo_front || m.photo_side);
  if (!anyPhotos) {
    return (
      <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">Progress photos</span>
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
          <ImageOff className="w-7 h-7 text-[var(--text-subtle)]" />
          <p className="text-sm text-[var(--text-subtle)] max-w-xs">
            Add a front and side photo to your check-in — they'll collect here by date, and you can compare any two.
          </p>
        </div>
      </section>
    );
  }

  const move = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">
          Progress photos
        </span>
        <div className="flex items-center gap-2">
          <Segmented
            options={[{ id: 'front', label: 'Front' }, { id: 'side', label: 'Side' }]}
            value={slot}
            onChange={(v) => setSlot(v as 'front' | 'side')}
          />
          <Segmented
            options={[{ id: 'archive', label: 'Archive' }, { id: 'compare', label: 'Compare' }]}
            value={view}
            onChange={(v) => setView(v as 'archive' | 'compare')}
          />
        </div>
      </div>

      {days.length === 0 ? (
        <p className="text-sm text-[var(--text-subtle)] py-6 text-center">No {slot} photos yet.</p>
      ) : view === 'archive' ? (
        <>
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => move(-1)}
              className="p-1.5 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[13px] font-semibold text-[var(--text)]">
              {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => move(1)}
              className="p-1.5 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {grid.map((d) => {
              const k = dayKey(d);
              const url = urlFor(k);
              const has = byDay.has(k);
              const inMonth = d.getMonth() === cursor.getMonth();
              return (
                <button
                  key={k}
                  disabled={!has}
                  onClick={() => setOpen(k)}
                  className={cn(
                    'relative aspect-[3/4] rounded-lg overflow-hidden text-[10px] transition-transform',
                    has ? 'hover:scale-[1.04] active:scale-95' : 'cursor-default',
                    !inMonth && 'opacity-30',
                  )}
                  style={{ background: has ? 'var(--elevated)' : 'transparent' }}
                  aria-label={has ? `Photo from ${pretty(k)}` : undefined}
                >
                  {url ? (
                    <img src={url} alt={pretty(k)} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  ) : null}
                  <span
                    className={cn(
                      'absolute bottom-0.5 right-1 font-semibold',
                      url ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]' : 'text-[var(--text-subtle)]',
                    )}
                  >
                    {d.getDate()}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11.5px] text-[var(--text-subtle)] mt-3 text-center">
            {days.length} {slot} photo{days.length === 1 ? '' : 's'} · tap a day to open it
          </p>
        </>
      ) : (
        <>
          {a && b && urlFor(a) && urlFor(b) && a !== b ? (
            <>
              <CompareSlider
                beforeUrl={urlFor(a)!}
                afterUrl={urlFor(b)!}
                beforeLabel={pretty(a).replace(/, \d{4}$/, '')}
                afterLabel={pretty(b).replace(/, \d{4}$/, '')}
              />
              <p className="text-[11.5px] text-[var(--text-subtle)] mt-2.5 text-center">Drag to compare</p>
            </>
          ) : (
            <p className="text-sm text-[var(--text-subtle)] py-6 text-center">
              {days.length < 2 ? 'Two photos are needed to compare.' : 'Pick two different days below.'}
            </p>
          )}

          {/* Day pickers — either end can be any shot in the history. */}
          <div className="mt-4 flex flex-col gap-3">
            {([['Before', a, setA], ['After', b, setB]] as const).map(([label, val, set]) => (
              <div key={label}>
                <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
                <div className="flex gap-1.5 mt-1 overflow-x-auto no-scrollbar pb-1">
                  {days.map((d) => (
                    <button
                      key={d}
                      onClick={() => set(d)}
                      className={cn(
                        'shrink-0 px-2.5 py-1 rounded-lg text-[12px] font-medium border transition-colors',
                        val === d
                          ? 'text-[var(--accent-text)] border-transparent'
                          : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]',
                      )}
                      style={val === d ? { background: 'var(--accent)' } : undefined}
                    >
                      {pretty(d).replace(/, \d{4}$/, '')}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Lightbox for one day */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
            onClick={() => setOpen(null)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              transition={{ type: 'spring', stiffness: 280, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-sm rounded-2xl overflow-hidden border border-[var(--border)]"
              style={{ background: 'var(--surface)' }}
            >
              {urlFor(open) ? (
                <img src={urlFor(open)} alt={pretty(open)} className="w-full max-h-[60vh] object-contain bg-black" />
              ) : (
                <div className="h-48 flex items-center justify-center text-[var(--text-subtle)]">Loading…</div>
              )}
              <div className="p-4">
                <p className="text-[13.5px] font-semibold text-[var(--text)]">{pretty(open)}</p>
                <p className="text-[12px] text-[var(--text-muted)] capitalize mt-0.5">{slot} photo</p>

                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    onClick={() => { setA(open); setView('compare'); setOpen(null); }}
                    className="btn btn-secondary !py-1.5 !px-3 text-xs"
                  >
                    Compare from here
                  </button>
                  <button
                    onClick={() => { setB(open); setView('compare'); setOpen(null); }}
                    className="btn btn-secondary !py-1.5 !px-3 text-xs"
                  >
                    Compare to here
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => remove(open)}
                      disabled={busy}
                      className="btn !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                      style={{ background: 'var(--danger-soft, rgba(239,68,68,.12))', color: 'var(--danger, #ef4444)' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {busy ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
              </div>
              <button
                onClick={() => setOpen(null)}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white backdrop-blur-sm"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Small segmented control used by the photo header. */
function Segmented({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--elevated)] border border-[var(--border)]">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors',
            value === o.id ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]',
          )}
          style={value === o.id ? { background: 'var(--accent)' } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
