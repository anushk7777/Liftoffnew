// Progress photos — upload slots for a check-in, and a draggable before/after
// comparison that is the thing clients actually feel motivated by.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, ImageOff, MoveHorizontal, ChevronLeft, ChevronRight, Trash2, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { photoUrls, deletePhoto, type Metric } from './api';

/** The comparisons people actually ask for, oldest span first. */
const PRESETS: { label: string; days: number | null }[] = [
  { label: 'First photo', days: null },
  { label: '3 months', days: 90 },
  { label: '1 month', days: 30 },
  { label: '2 weeks', days: 14 },
];

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
 * Progress photos, built the way people actually look at photos.
 *
 * The previous version was a month calendar with an Archive/Compare mode
 * switch. Three things made it hard work for a normal user:
 *
 *  - A month grid is mostly empty. Checking in every fortnight means 28 blank
 *    cells around two photos, and paging back through empty months to find
 *    anything.
 *  - "Archive" and "Compare" as modes is an abstraction nobody asked for. What
 *    people want is "show me then versus now", immediately, with no setup.
 *  - A front/side toggle hid half the photos behind a switch you had to know
 *    about.
 *
 * So: the then-and-now comparison is the first thing on screen and needs no
 * interaction, and beneath it the shots sit in a dated timeline that only shows
 * months that actually have photos. Tapping one opens a full-screen viewer you
 * can swipe through, which is where delete and "compare with this" live.
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
  const [viewing, setViewing] = useState<string | null>(null); // day key
  const [viewSlot, setViewSlot] = useState<'front' | 'side'>('front');
  const [aPick, setA] = useState<string | null>(null);
  const [bPick, setB] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});

  /** Every check-in that has at least one photo, oldest first. */
  const shots = useMemo(
    () =>
      metrics
        .filter((m) => m.photo_front || m.photo_side)
        .slice()
        .sort((x, y) => x.taken_on.localeCompare(y.taken_on)),
    [metrics],
  );
  const byDay = useMemo(() => new Map(shots.map((m) => [m.taken_on, m])), [shots]);
  const days = useMemo(() => shots.map((m) => m.taken_on), [shots]);

  // Comparison ends are derived, so a photo that gets deleted falls back on its
  // own instead of leaving the slider pointing at nothing.
  const a = aPick && byDay.has(aPick) ? aPick : (days[0] ?? null);
  const b = bPick && byDay.has(bPick) ? bPick : (days[days.length - 1] ?? null);

  // Sign every path once. One check-in a fortnight is ~26 rows a year, so this
  // is a single batch of a few dozen URLs rather than anything that needs
  // windowing — and they expire in an hour regardless.
  const paths = useMemo(
    () => shots.flatMap((m) => [m.photo_front, m.photo_side]).filter((p): p is string => !!p),
    [shots],
  );

  useEffect(() => {
    const missing = paths.filter((p) => !urls[p]);
    if (!missing.length) return;
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
  }, [paths, urls]);

  const urlOf = (day: string | null, slot: 'front' | 'side') => {
    const row = day ? byDay.get(day) : null;
    const path = row?.[slot === 'front' ? 'photo_front' : 'photo_side'];
    return path ? urls[path] : undefined;
  };
  /** Whichever slot this day actually has, preferring front. */
  const anyUrl = (day: string) => urlOf(day, 'front') ?? urlOf(day, 'side');

  const pretty = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  /**
   * The photo closest to `targetDays` before the newest one.
   *
   * This is what makes "how do I look against three months ago" a single tap.
   * Nobody photographs themselves exactly ninety days apart, so an exact-date
   * lookup would almost always miss; the nearest shot is what a person means.
   */
  const nearestOlder = (targetDays: number): string | null => {
    if (days.length < 2) return null;
    const newest = new Date(`${days[days.length - 1]}T12:00:00`).getTime();
    const want = newest - targetDays * 86400000;
    let best: string | null = null;
    let bestGap = Infinity;
    for (const d of days.slice(0, -1)) {
      const gap = Math.abs(new Date(`${d}T12:00:00`).getTime() - want);
      if (gap < bestGap) { bestGap = gap; best = d; }
    }
    return best;
  };

  const weeksBetween = (x: string, y: string) =>
    Math.round(
      Math.abs(new Date(`${y}T12:00:00`).getTime() - new Date(`${x}T12:00:00`).getTime()) /
        (7 * 86400000),
    );

  /** Months that actually contain photos — empty ones are never rendered. */
  const months = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const d of days) {
      const label = new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      });
      groups.set(label, [...(groups.get(label) ?? []), d]);
    }
    // Newest month first: the recent stuff is what gets looked at.
    return [...groups.entries()].reverse();
  }, [days]);

  const remove = async (day: string, slot: 'front' | 'side') => {
    const row = byDay.get(day);
    const path = row?.[slot === 'front' ? 'photo_front' : 'photo_side'];
    if (!row || !path || busy) return;
    setBusy(true);
    try {
      await deletePhoto(row.id, slot, path);
      setViewing(null);
      onChanged?.();
    } catch (e) {
      console.error('Could not delete photo', e);
    } finally {
      setBusy(false);
    }
  };

  if (shots.length === 0) {
    return (
      <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">Progress photos</span>
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
          <ImageOff className="w-7 h-7 text-[var(--text-subtle)]" />
          <p className="text-sm text-[var(--text-subtle)] max-w-xs">
            Add a photo to a check-in. Once there are two, this turns into a
            then-and-now you can drag between.
          </p>
        </div>
      </section>
    );
  }

  const spanDays =
    days.length >= 2
      ? Math.round(
          (new Date(`${days[days.length - 1]}T12:00:00`).getTime() -
            new Date(`${days[0]}T12:00:00`).getTime()) /
            86400000,
        )
      : 0;

  const canCompare = a && b && a !== b;
  // The comparison uses whichever slot both ends share, so it never shows a
  // front shot wiping into a side one.
  const compareSlot: 'front' | 'side' =
    canCompare && urlOf(a, 'front') && urlOf(b, 'front') ? 'front' : 'side';
  const aUrl = canCompare ? urlOf(a, compareSlot) : undefined;
  const bUrl = canCompare ? urlOf(b, compareSlot) : undefined;

  const viewingRow = viewing ? byDay.get(viewing) : null;
  const viewIdx = viewing ? days.indexOf(viewing) : -1;
  const viewHasSlot = (slot: 'front' | 'side') => !!urlOf(viewing, slot);
  const shownSlot: 'front' | 'side' = viewHasSlot(viewSlot) ? viewSlot : viewSlot === 'front' ? 'side' : 'front';

  return (
    <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--text-subtle)]">
          Progress photos
        </span>
        <span className="text-[11.5px] text-[var(--text-subtle)]">
          {shots.length} check-in{shots.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* A nudge once there is actually something to look at. Two photos a week
          apart is the first moment a comparison says anything. */}
      {spanDays >= 7 && days.length >= 2 && (
        <div
          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 mb-3"
          style={{ background: 'var(--accent-soft)' }}
        >
          <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
          <p className="text-[12.5px] text-[var(--text)]">
            <b className="font-semibold">Check out your progress</b>
            <span className="text-[var(--text-muted)]">
              {' '}— {weeksBetween(days[0], days[days.length - 1])} weeks since your first photo.
            </span>
          </p>
        </div>
      )}

      {/* Then and now, with no setup. This is the payoff, so it leads. */}
      {aUrl && bUrl ? (
        <>
          <CompareSlider
            beforeUrl={aUrl}
            afterUrl={bUrl}
            beforeLabel={pretty(a!)}
            afterLabel={pretty(b!)}
          />
          <p className="text-[11.5px] text-[var(--text-subtle)] mt-2.5 text-center">
            Drag to compare · {weeksBetween(a!, b!)} week{weeksBetween(a!, b!) === 1 ? '' : 's'} apart
            {(aPick || bPick) && (
              <>
                {' · '}
                <button
                  onClick={() => {
                    setA(null);
                    setB(null);
                  }}
                  className="font-semibold"
                  style={{ color: 'var(--accent)' }}
                >
                  reset
                </button>
              </>
            )}
          </p>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border-strong)] py-8 px-4 text-center">
          <p className="text-sm text-[var(--text-subtle)]">
            One photo so far. Add another check-in photo and this becomes a
            then-and-now.
          </p>
        </div>
      )}

      {/* One tap per question a person actually asks. Ranges with no photo old
          enough are left out rather than shown dead. */}
      {days.length >= 2 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="text-[11.5px] text-[var(--text-subtle)] self-center mr-0.5">
            Compare with
          </span>
          {PRESETS.filter((pr) => pr.days === null || spanDays >= pr.days * 0.6).map((pr) => {
            const target = pr.days === null ? days[0] : nearestOlder(pr.days);
            const active = !!target && target === a;
            return (
              <button
                key={pr.label}
                onClick={() => target && setA(target)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[12px] font-semibold border transition-colors',
                  active
                    ? 'text-[var(--accent-text)] border-transparent'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]',
                )}
                style={active ? { background: 'var(--accent)' } : undefined}
              >
                {pr.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Dated timeline. Only months holding photos appear at all. */}
      <div className="mt-5 flex flex-col gap-4">
        {months.map(([label, monthDays]) => (
          <div key={label}>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
              {label}
            </span>
            <div className="flex gap-2 mt-1.5 overflow-x-auto no-scrollbar pb-1">
              {monthDays
                .slice()
                .reverse()
                .map((d) => {
                  const u = anyUrl(d);
                  const isEnd = d === a || d === b;
                  return (
                    <button
                      key={d}
                      onClick={() => {
                        setViewSlot('front');
                        setViewing(d);
                      }}
                      className="relative shrink-0 w-[72px] rounded-xl overflow-hidden transition-transform hover:scale-[1.03] active:scale-95"
                      style={{ background: 'var(--elevated)' }}
                      aria-label={`Photo from ${pretty(d)}`}
                    >
                      <span className="block aspect-[3/4]">
                        {u && <img src={u} alt={pretty(d)} className="w-full h-full object-cover" loading="lazy" />}
                      </span>
                      {/* Ends of the current comparison are marked, so the
                          slider above and the timeline agree with each other. */}
                      {isEnd && (
                        <span
                          className="absolute inset-0 rounded-xl pointer-events-none"
                          style={{ boxShadow: 'inset 0 0 0 2px var(--accent)' }}
                        />
                      )}
                      <span className="absolute inset-x-0 bottom-0 py-1 text-[10.5px] font-semibold text-white bg-black/55 backdrop-blur-[2px]">
                        {pretty(d)}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {/* Full-screen viewer: swipe through check-ins, delete, set a comparison end. */}
      <AnimatePresence>
        {viewing && viewingRow && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] flex flex-col"
            style={{ background: 'rgba(0,0,0,0.94)' }}
          >
            <div className="flex items-center justify-between p-4 shrink-0">
              <div>
                <p className="text-[14px] font-semibold text-white">
                  {new Date(`${viewing}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </p>
                <p className="text-[11.5px] text-white/60 mt-0.5">
                  {viewIdx + 1} of {days.length}
                  {viewIdx > 0 && ` · ${weeksBetween(days[0], viewing)} weeks in`}
                </p>
              </div>
              <button
                onClick={() => setViewing(null)}
                className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative flex-1 min-h-0 flex items-center justify-center px-2">
              {urlOf(viewing, shownSlot) ? (
                <motion.img
                  key={`${viewing}-${shownSlot}`}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  src={urlOf(viewing, shownSlot)}
                  alt={pretty(viewing)}
                  className="max-h-full max-w-full object-contain rounded-lg"
                />
              ) : (
                <p className="text-white/60 text-sm">Loading…</p>
              )}

              {viewIdx > 0 && (
                <button
                  onClick={() => setViewing(days[viewIdx - 1])}
                  className="absolute left-2 p-3 rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
                  aria-label="Previous check-in"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {viewIdx < days.length - 1 && (
                <button
                  onClick={() => setViewing(days[viewIdx + 1])}
                  className="absolute right-2 p-3 rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
                  aria-label="Next check-in"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="shrink-0 p-4 flex flex-col gap-3">
              {/* Front/side only appears when the day actually has both. */}
              {viewHasSlot('front') && viewHasSlot('side') && (
                <div className="flex gap-1 p-0.5 rounded-lg bg-white/10 self-center">
                  {(['front', 'side'] as const).map((sl) => (
                    <button
                      key={sl}
                      onClick={() => setViewSlot(sl)}
                      className={cn(
                        'px-4 py-1.5 rounded-md text-[12.5px] font-semibold capitalize transition-colors',
                        shownSlot === sl ? 'bg-white text-black' : 'text-white/70 hover:text-white',
                      )}
                    >
                      {sl}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => { setA(viewing); setViewing(null); }}
                  className="px-3 py-2 rounded-lg text-[12.5px] font-semibold bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  Compare from here
                </button>
                <button
                  onClick={() => { setB(viewing); setViewing(null); }}
                  className="px-3 py-2 rounded-lg text-[12.5px] font-semibold bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  Compare to here
                </button>
                {canDelete && (
                  <button
                    onClick={() => remove(viewing, shownSlot)}
                    disabled={busy}
                    className="px-3 py-2 rounded-lg text-[12.5px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                    style={{ background: 'rgba(239,68,68,0.18)', color: '#fca5a5' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {busy ? 'Deleting…' : `Delete ${shownSlot}`}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
