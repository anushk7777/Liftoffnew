import { describe, it, expect } from 'vitest';
import { mergeState, mergeTombstones } from './sync';

const base = () => ({
  tasks: [] as unknown[],
  ideas: [] as unknown[],
  notes: [] as unknown[],
  habits: [] as unknown[],
  focusSessions: [] as unknown[],
  activityHistory: [] as unknown[],
  habitLog: [] as unknown[],
  tombstones: {} as Record<string, string>,
});

describe('mergeState', () => {
  it('unions id-keyed collections from both devices', () => {
    const local = { ...base(), tasks: [{ id: 'a' }] };
    const cloud = { ...base(), tasks: [{ id: 'b' }] };
    const merged = mergeState(local, cloud, '2026-01-02', '2026-01-01');
    const ids = (merged.tasks as { id: string }[]).map((t) => t.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('keeps the recency winner for scalar fields', () => {
    const local = { ...base(), theme: 'light' };
    const cloud = { ...base(), theme: 'dark' };
    // cloud is newer -> its scalar wins
    expect(mergeState(local, cloud, '2026-01-01', '2026-01-02').theme).toBe('dark');
    // local is newer -> its scalar wins
    expect(mergeState(local, cloud, '2026-01-03', '2026-01-02').theme).toBe('light');
  });

  it('does not resurrect a task deleted on one device', () => {
    const recent = new Date().toISOString(); // within tombstone TTL
    const local = { ...base(), tasks: [], tombstones: { 'tasks:x': recent } };
    const cloud = { ...base(), tasks: [{ id: 'x' }] };
    // even when the cloud (which still has x) is the recency winner, delete wins
    const merged = mergeState(local, cloud, '2026-01-01', '2026-01-02');
    expect((merged.tasks as unknown[]).length).toBe(0);
    expect((merged.tombstones as Record<string, string>)['tasks:x']).toBe(recent);
  });

  it('drops habit logs belonging to a tombstoned habit', () => {
    const recent = new Date().toISOString();
    const local = { ...base(), tombstones: { 'habits:h1': recent } };
    const cloud = {
      ...base(),
      habits: [{ id: 'h1' }],
      habitLog: [{ habitId: 'h1', date: '2026-01-01' }],
    };
    const merged = mergeState(local, cloud, '2026-01-03', '2026-01-02');
    expect((merged.habits as unknown[]).length).toBe(0);
    expect((merged.habitLog as unknown[]).length).toBe(0);
  });
});

describe('mergeTombstones', () => {
  it('keeps the newest deletion per key', () => {
    const a = { 'tasks:x': '2026-01-01T00:00:00.000Z' };
    const b = { 'tasks:x': '2026-02-01T00:00:00.000Z' };
    const out = mergeTombstones(a, b, Date.parse('2026-02-15T00:00:00.000Z'));
    expect(out['tasks:x']).toBe('2026-02-01T00:00:00.000Z');
  });

  it('prunes tombstones older than the TTL', () => {
    const now = Date.parse('2026-06-01T00:00:00.000Z');
    const out = mergeTombstones({ 'tasks:y': '2025-01-01T00:00:00.000Z' }, {}, now);
    expect(out['tasks:y']).toBeUndefined();
  });

  it('ignores non-string / malformed inputs', () => {
    expect(mergeTombstones(null, undefined, Date.now())).toEqual({});
  });
});
