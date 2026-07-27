import { describe, it, expect } from 'vitest';
import { searchMoments } from './moments';
import type { Moment } from './types';

const mo = (id: string, text: string, extra: Partial<Moment> = {}): Moment =>
  ({ id, createdAt: `2026-07-${id.padStart(2, '0')}T12:00:00.000Z`, text, ...extra }) as Moment;

const diary: Moment[] = [
  mo('01', 'Coffee on the balcony, everything felt still', { mood: 'calm', place: 'Home' }),
  mo('02', 'Ran my first 10k', { mood: 'radiant', place: 'Cubbon Park', song: 'Alright' }),
  mo('03', 'Long call with Amjad about nothing', { mood: 'grateful' }),
  mo('04', 'Café by the beach in Goa', { mood: 'calm', place: 'Goa' }),
];

describe('searchMoments', () => {
  it('finds a moment by its words', () => {
    expect(searchMoments(diary, 'balcony').map((m) => m.id)).toEqual(['01']);
  });

  it('searches the place and the song, not just the text', () => {
    expect(searchMoments(diary, 'cubbon').map((m) => m.id)).toEqual(['02']);
    expect(searchMoments(diary, 'alright').map((m) => m.id)).toEqual(['02']);
  });

  it('requires every term but lets each match any field', () => {
    // "goa" is a place and "beach" is in the text — one moment holds both.
    expect(searchMoments(diary, 'goa beach').map((m) => m.id)).toEqual(['04']);
    expect(searchMoments(diary, 'goa balcony')).toEqual([]);
  });

  it('ignores case and accents', () => {
    expect(searchMoments(diary, 'CAFE').map((m) => m.id)).toEqual(['04']);
    expect(searchMoments(diary, 'café').map((m) => m.id)).toEqual(['04']);
  });

  it('filters by mood', () => {
    expect(searchMoments(diary, '', 'calm').map((m) => m.id)).toEqual(['01', '04']);
    expect(searchMoments(diary, '', 'radiant').map((m) => m.id)).toEqual(['02']);
  });

  it('combines a mood filter with a query', () => {
    expect(searchMoments(diary, 'goa', 'calm').map((m) => m.id)).toEqual(['04']);
    expect(searchMoments(diary, 'goa', 'radiant')).toEqual([]);
  });

  it('treats "all" and an empty query as no filter', () => {
    expect(searchMoments(diary, '', 'all')).toHaveLength(4);
    expect(searchMoments(diary, '   ')).toHaveLength(4);
  });

  it('finds a mood by name without using the filter', () => {
    expect(searchMoments(diary, 'grateful').map((m) => m.id)).toEqual(['03']);
  });

  it('returns nothing rather than everything for an unmatched term', () => {
    expect(searchMoments(diary, 'zzzz')).toEqual([]);
  });

  it('copes with moments missing optional fields', () => {
    expect(() => searchMoments([mo('05', 'bare')], 'bare')).not.toThrow();
  });
});
