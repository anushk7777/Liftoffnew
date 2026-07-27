import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './useStore';

const fresh = () => {
  useStore.setState({ tasks: [], habits: [], activityHistory: [] } as never);
};

describe('importData rejects what is not a backup', () => {
  beforeEach(fresh);

  it('rejects invalid JSON without touching state', () => {
    useStore.setState({ tasks: [{ id: 'keep' }] } as never);
    const r = useStore.getState().importData('{not json');
    expect(r.ok).toBe(false);
    expect(useStore.getState().tasks).toHaveLength(1);
  });

  it('rejects a JSON array', () => {
    expect(useStore.getState().importData('[1,2,3]').ok).toBe(false);
  });

  it('rejects a JSON string or number', () => {
    expect(useStore.getState().importData('"hello"').ok).toBe(false);
    expect(useStore.getState().importData('42').ok).toBe(false);
    expect(useStore.getState().importData('null').ok).toBe(false);
  });

  it('rejects an object that carries none of the workspace collections', () => {
    const r = useStore.getState().importData('{"somethingElse":true}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Liftoff backup/);
  });

  it('accepts a real backup and restores it', () => {
    const backup = JSON.stringify({ tasks: [{ id: 't1', title: 'Restored' }], habits: [], activityHistory: [] });
    expect(useStore.getState().importData(backup)).toEqual({ ok: true });
    expect(useStore.getState().tasks.map((t) => t.id)).toEqual(['t1']);
  });
});

describe('toggleLogDay', () => {
  beforeEach(fresh);

  it('does not mutate the previous entry object when changing type', () => {
    const s = useStore.getState();
    s.toggleLogDay('study');
    const before = useStore.getState().activityHistory[0];
    const snapshot = { ...before };
    useStore.getState().toggleLogDay('rest');
    expect(before).toEqual(snapshot); // the old object is untouched
    expect(useStore.getState().activityHistory[0].type).toBe('rest');
  });

  it('removes the entry when the same type is toggled twice', () => {
    useStore.getState().toggleLogDay('study');
    useStore.getState().toggleLogDay('study');
    expect(useStore.getState().activityHistory).toHaveLength(0);
  });
});
