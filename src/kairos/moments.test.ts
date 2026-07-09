import { describe, it, expect } from 'vitest';
import { onThisDay, sameCalendarDay, byMonth, yearsAgoLabel, excerpt, moodMeta, songLink } from './moments';
import type { Moment } from './types';

const mo = (id: string, iso: string, text = 'x'): Moment => ({ id, createdAt: iso, text });

describe('sameCalendarDay', () => {
  it('matches identical month+day across years', () => {
    expect(sameCalendarDay({ m: 7, d: 8 }, { m: 7, d: 8, y: 2026 })).toBe(true);
    expect(sameCalendarDay({ m: 7, d: 9 }, { m: 7, d: 8, y: 2026 })).toBe(false);
  });

  it('folds a Feb-29 moment onto Feb-28 in a non-leap year', () => {
    expect(sameCalendarDay({ m: 2, d: 29 }, { m: 2, d: 28, y: 2027 })).toBe(true); // 2027 non-leap
    expect(sameCalendarDay({ m: 2, d: 29 }, { m: 2, d: 28, y: 2028 })).toBe(false); // 2028 leap → real Feb 29 exists
  });
});

describe('onThisDay', () => {
  const now = new Date('2026-07-08T10:00:00');

  it('surfaces earlier-year moments on the same calendar day, nearest first', () => {
    const moments = [
      mo('a', '2025-07-08T09:00:00'), // 1 yr ago
      mo('b', '2023-07-08T22:00:00'), // 3 yr ago
      mo('c', '2024-07-08T08:00:00'), // 2 yr ago
      mo('d', '2025-07-09T09:00:00'), // wrong day
      mo('e', '2026-07-08T01:00:00'), // same year → excluded
    ];
    const out = onThisDay(moments, now);
    expect(out.map((r) => r.moment.id)).toEqual(['a', 'c', 'b']);
    expect(out.map((r) => r.yearsAgo)).toEqual([1, 2, 3]);
  });

  it('orders same-year-ago moments newest capture first', () => {
    const out = onThisDay([mo('early', '2025-07-08T06:00:00'), mo('late', '2025-07-08T20:00:00')], now);
    expect(out.map((r) => r.moment.id)).toEqual(['late', 'early']);
  });

  it('returns nothing when no earlier-year moment matches', () => {
    expect(onThisDay([mo('a', '2026-07-08T09:00:00')], now)).toHaveLength(0);
  });
});

describe('onThisDay — every year', () => {
  const now = new Date('2026-07-08T10:00:00');
  it('resurfaces every earlier year on the date, not only milestones', () => {
    const moments = [
      mo('y1', '2025-07-08T09:00:00'),
      mo('y4', '2022-07-08T09:00:00'), // 4 yrs — still resurfaces
      mo('y5', '2021-07-08T09:00:00'),
      mo('y10', '2016-07-08T09:00:00'),
    ];
    expect(onThisDay(moments, now).map((r) => r.yearsAgo)).toEqual([1, 4, 5, 10]);
  });
});

describe('byMonth', () => {
  it('buckets moments by calendar month, newest month + newest moment first', () => {
    const buckets = byMonth([
      mo('a', '2026-07-01T09:00:00'),
      mo('b', '2026-07-20T09:00:00'),
      mo('c', '2026-06-15T09:00:00'),
    ]);
    expect(buckets.map((b) => b.key)).toEqual(['2026-07', '2026-06']);
    expect(buckets[0].label).toBe('July 2026');
    expect(buckets[0].moments.map((m) => m.id)).toEqual(['b', 'a']);
  });
});

describe('small helpers', () => {
  it('labels years-ago in natural language', () => {
    expect(yearsAgoLabel(1)).toBe('1 year ago today');
    expect(yearsAgoLabel(3)).toBe('3 years ago today');
  });
  it('truncates long text with an ellipsis', () => {
    expect(excerpt('short')).toBe('short');
    expect(excerpt('a'.repeat(200), 10)).toHaveLength(10);
  });
  it('resolves mood metadata by id', () => {
    expect(moodMeta('calm')?.emoji).toBe('🌊');
    expect(moodMeta(undefined)).toBeUndefined();
    expect(moodMeta('nope')).toBeUndefined();
  });

  it('builds a song link: explicit url wins, else a YouTube Music search', () => {
    expect(songLink({})).toBeUndefined();
    expect(songLink({ songUrl: 'https://music.youtube.com/watch?v=abc' })).toBe('https://music.youtube.com/watch?v=abc');
    expect(songLink({ song: 'Bon Iver — Holocene' })).toBe('https://music.youtube.com/search?q=Bon%20Iver%20%E2%80%94%20Holocene');
    expect(songLink({ song: '  ' })).toBeUndefined();
  });
});
