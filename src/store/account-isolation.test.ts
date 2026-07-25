// Liftoff keeps an offline copy of the workspace in localStorage, and that copy
// is not scoped to an account. Without a guard, signing in as a second Google
// account on the same browser merged the first account's workspace into theirs
// — and the next save uploaded it into their cloud row. These tests pin the
// isolation down.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fake: {
  session: { user: { id: string } } | null;
  row: { data: Record<string, unknown>; updated_at: string } | null;
} = { session: null, row: null };

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getSession: async () => ({ data: { session: fake.session } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            fake.row
              ? { data: fake.row, error: null }
              : { data: null, error: { code: 'PGRST116' } },
        }),
      }),
    }),
  },
}));

const { useStore } = await import('./useStore');

const taskIds = () => useStore.getState().tasks.map((t) => t.id).sort();

const signInAs = async (userId: string, row: typeof fake.row) => {
  fake.session = { user: { id: userId } };
  fake.row = row;
  await useStore.getState().loadFromDB();
};

const cloudRowWithTask = (id: string, updatedAt: string) => ({
  data: { tasks: [{ id, title: `task ${id}`, status: 'todo', priority: 'medium' }] },
  updated_at: updatedAt,
});

describe('workspace isolation between accounts on one device', () => {
  beforeEach(() => {
    useStore.getState().resetWorkspace();
  });

  it("does not carry the previous account's data into a new account", async () => {
    await signInAs('account-A', cloudRowWithTask('a1', '2026-07-01T00:00:00.000Z'));
    expect(taskIds()).toContain('a1');
    expect(useStore.getState().ownerId).toBe('account-A');

    // A different Google account signs in on the same browser, with no cloud
    // row of its own. It must land on a blank workspace, not inherit A's.
    await signInAs('account-B', null);
    expect(taskIds()).not.toContain('a1');
    expect(useStore.getState().ownerId).toBe('account-B');
  });

  it("shows the new account only its own cloud data", async () => {
    await signInAs('account-A', cloudRowWithTask('a1', '2026-07-01T00:00:00.000Z'));
    await signInAs('account-B', cloudRowWithTask('b1', '2026-07-02T00:00:00.000Z'));
    expect(taskIds()).toEqual(['b1']);
  });

  it('keeps merging across devices for the SAME account', async () => {
    await signInAs('account-A', cloudRowWithTask('a1', '2026-07-01T00:00:00.000Z'));
    // Same account, another device's row arrives: additions must survive.
    await signInAs('account-A', cloudRowWithTask('a2', '2026-07-03T00:00:00.000Z'));
    expect(taskIds()).toEqual(['a1', 'a2']);
  });

  it('adopts an untracked local workspace for the account that signs in', async () => {
    // Written before ownerId existed: a real workspace that must not be wiped.
    useStore.setState({ ownerId: null });
    await signInAs('account-A', null);
    expect(useStore.getState().ownerId).toBe('account-A');
  });

  it('resetWorkspace clears the workspace and its owner', async () => {
    await signInAs('account-A', cloudRowWithTask('a1', '2026-07-01T00:00:00.000Z'));
    useStore.getState().resetWorkspace();
    expect(taskIds()).toEqual([]);
    expect(useStore.getState().ownerId).toBeNull();
  });
});
