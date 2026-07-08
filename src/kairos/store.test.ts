import { describe, it, expect, beforeEach } from 'vitest';
import { useKairos } from './store';

// The store imports supabase, but with no VITE_ env vars in the test env
// isSupabaseConfigured is false and the cloud paths short-circuit — so these
// exercise the pure local reducers only.
beforeEach(() => {
  useKairos.setState({ moments: [] });
});

describe('useKairos.addMoment', () => {
  it('captures a moment with a locked timestamp and trims fields', () => {
    const m = useKairos.getState().addMoment({ text: '  hello  ', mood: 'calm', song: '  Bon Iver  ', place: '' });
    expect(m.text).toBe('hello');
    expect(m.song).toBe('Bon Iver');
    expect(m.place).toBeUndefined();
    expect(typeof m.createdAt).toBe('string');
    expect(useKairos.getState().moments).toHaveLength(1);
  });
});

describe('useKairos.updateMoment', () => {
  it('refines words/mood/song but never changes id or createdAt', () => {
    const m = useKairos.getState().addMoment({ text: 'first' });
    const { id, createdAt } = m;
    useKairos.getState().updateMoment(id, { text: '  reworded  ', mood: 'heavy', song: 'New Song' });
    const after = useKairos.getState().moments.find((x) => x.id === id)!;
    expect(after.text).toBe('reworded');
    expect(after.mood).toBe('heavy');
    expect(after.song).toBe('New Song');
    expect(after.createdAt).toBe(createdAt); // locked
    expect(after.id).toBe(id);
  });

  it('clears an optional field when edited to blank', () => {
    const m = useKairos.getState().addMoment({ text: 'x', song: 'Old' });
    useKairos.getState().updateMoment(m.id, { song: '   ' });
    expect(useKairos.getState().moments[0].song).toBeUndefined();
  });
});

describe('useKairos.deleteMoment', () => {
  it('removes the moment by id', () => {
    const m = useKairos.getState().addMoment({ text: 'bye' });
    useKairos.getState().deleteMoment(m.id);
    expect(useKairos.getState().moments).toHaveLength(0);
  });
});
