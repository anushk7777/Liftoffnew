// Kairos — pure, dependency-free helpers. All logic that decides *what to
// resurface* lives here so it can be unit-tested and shared verbatim with the
// server-side resurfacing Edge Function.
import type { Moment, MoodId } from './types';

export interface MoodMeta {
  id: MoodId;
  label: string;
  emoji: string;
  /** A CSS color (used for the mood dot / tint). */
  color: string;
}

/** The mood palette, in the order shown in the picker. Evocative, not clinical. */
export const MOODS: MoodMeta[] = [
  { id: 'radiant', label: 'Radiant', emoji: '☀️', color: '#f0a83d' },
  { id: 'content', label: 'Content', emoji: '🌤️', color: '#7bb47f' },
  { id: 'calm', label: 'Calm', emoji: '🌊', color: '#5aa6c7' },
  { id: 'tender', label: 'Tender', emoji: '🌸', color: '#d98fb0' },
  { id: 'grateful', label: 'Grateful', emoji: '🕊️', color: '#a891d6' },
  { id: 'restless', label: 'Restless', emoji: '⚡', color: '#d98a5a' },
  { id: 'heavy', label: 'Heavy', emoji: '🌧️', color: '#7d8aa0' },
];

const MOOD_BY_ID: Record<string, MoodMeta> = Object.fromEntries(MOODS.map((m) => [m.id, m]));

export function moodMeta(id?: MoodId | string): MoodMeta | undefined {
  return id ? MOOD_BY_ID[id] : undefined;
}

/** The anniversaries we resurface, in years. 1/2/3 as the user asked, plus the
 *  milestone 5- and 10-year marks. Order matters only for display. */
export const RESURFACE_YEARS = [1, 2, 3, 5, 10] as const;

/** Local Y/M/D of an ISO timestamp — resurfacing is a *calendar-day* concept,
 *  so we compare civil dates, not 24h multiples. */
export function ymd(iso: string | Date): { y: number; m: number; d: number } {
  const dt = typeof iso === 'string' ? new Date(iso) : iso;
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

/** Same month+day (ignoring year). Feb 29 folds onto Feb 28 in non-leap years so
 *  a leap-day moment still resurfaces every year. */
export function sameCalendarDay(a: { m: number; d: number; y?: number }, b: { m: number; d: number; y: number }): boolean {
  if (a.m === b.m && a.d === b.d) return true;
  // Leap-day moment (Feb 29) → resurface on Feb 28 when *this* year has no Feb 29.
  const bIsLeap = b.y % 4 === 0 && (b.y % 100 !== 0 || b.y % 400 === 0);
  if (a.m === 2 && a.d === 29 && b.m === 2 && b.d === 28 && !bIsLeap) return true;
  return false;
}

export interface Resurfaced {
  moment: Moment;
  yearsAgo: number;
}

/** Moments captured on this same calendar day in an earlier year — the "On This
 *  Day" feed. Newest-anniversary first (1 year ago before 5 years ago), and
 *  within the same year, newest capture first. */
export function onThisDay(moments: Moment[], now: Date = new Date()): Resurfaced[] {
  const today = ymd(now);
  const out: Resurfaced[] = [];
  for (const mo of moments) {
    const md = ymd(mo.createdAt);
    if (md.y >= today.y) continue; // only earlier years
    if (!sameCalendarDay(md, today)) continue;
    out.push({ moment: mo, yearsAgo: today.y - md.y });
  }
  return out.sort((a, b) => a.yearsAgo - b.yearsAgo || b.moment.createdAt.localeCompare(a.moment.createdAt));
}

/** The subset of On-This-Day moments that hit a *milestone* anniversary
 *  (1/2/3/5/10 years) — what the annual email + push actually resurface. */
export function milestoneResurfaced(moments: Moment[], now: Date = new Date()): Resurfaced[] {
  const years = new Set<number>(RESURFACE_YEARS);
  return onThisDay(moments, now).filter((r) => years.has(r.yearsAgo));
}

/** "1 year ago" / "3 years ago" — the resurfacing lead line. */
export function yearsAgoLabel(yearsAgo: number): string {
  return yearsAgo === 1 ? '1 year ago today' : `${yearsAgo} years ago today`;
}

/** Group moments into descending-time buckets by calendar month, for a timeline.
 *  Returns [{ key: '2026-07', label: 'July 2026', moments: [...] }], newest first. */
export interface MonthBucket {
  key: string;
  label: string;
  moments: Moment[];
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function byMonth(moments: Moment[]): MonthBucket[] {
  const sorted = [...moments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const buckets = new Map<string, MonthBucket>();
  for (const mo of sorted) {
    const { y, m } = ymd(mo.createdAt);
    const key = `${y}-${String(m).padStart(2, '0')}`;
    let b = buckets.get(key);
    if (!b) {
      b = { key, label: `${MONTHS[m - 1]} ${y}`, moments: [] };
      buckets.set(key, b);
    }
    b.moments.push(mo);
  }
  return [...buckets.values()];
}

/** A short excerpt of a moment's text for lists / notifications. */
export function excerpt(text: string, max = 140): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** The tappable link for a moment's song: the explicit link if given, else a
 *  YouTube Music search for the typed name (so just typing the song is enough
 *  to find it again). Returns undefined when there's no song. */
export function songLink(moment: { song?: string; songUrl?: string }): string | undefined {
  if (moment.songUrl && moment.songUrl.trim()) return moment.songUrl.trim();
  if (moment.song && moment.song.trim()) return `https://music.youtube.com/search?q=${encodeURIComponent(moment.song.trim())}`;
  return undefined;
}
