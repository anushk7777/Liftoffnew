// The Kairos diary is the most sensitive thing Liftoff stores, and its loader
// had the worst version of the shared-device bug: when local held moments the
// cloud didn't, it PUSHED them up. On a browser where a second account signed
// in, that uploaded one person's private diary into another's account.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fake: {
  session: { user: { id: string } } | null;
  row: { data: { moments: unknown[] }; updated_at: string } | null;
  uploads: { id: string; moments: unknown[] }[];
} = { session: null, row: null, uploads: [] };

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getSession: async () => ({ data: { session: fake.session } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            fake.row ? { data: fake.row, error: null } : { data: null, error: { code: 'PGRST116' } },
        }),
      }),
      upsert: async (payload: { id: string; data: { moments: unknown[] } }) => {
        fake.uploads.push({ id: payload.id, moments: payload.data.moments });
        return { error: null };
      },
    }),
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  },
}));

const { useKairos } = await import('./store');

const momentIds = () => useKairos.getState().moments.map((m) => m.id).sort();

const signInAs = async (userId: string, row: typeof fake.row) => {
  fake.session = { user: { id: userId } };
  fake.row = row;
  await useKairos.getState().loadMoments();
};

const cloudRow = (ids: string[], updatedAt: string) => ({
  data: { moments: ids.map((id) => ({ id, createdAt: updatedAt, text: `moment ${id}`, mood: 'ok' })) },
  updated_at: updatedAt,
});

describe('Kairos diary isolation between accounts on one device', () => {
  beforeEach(() => {
    useKairos.getState().resetDiary();
    fake.uploads = [];
  });

  it("never shows one account's diary to the next", async () => {
    await signInAs('account-A', cloudRow(['m1'], '2026-07-01T00:00:00.000Z'));
    expect(momentIds()).toEqual(['m1']);

    await signInAs('account-B', null);
    expect(momentIds()).toEqual([]);
    expect(useKairos.getState().ownerId).toBe('account-B');
  });

  it("never uploads one account's moments into another's row", async () => {
    await signInAs('account-A', cloudRow(['m1', 'm2'], '2026-07-01T00:00:00.000Z'));
    fake.uploads = [];

    // B has no cloud row. The "seed the cloud from local" branch must not fire
    // with A's moments still in memory.
    await signInAs('account-B', null);
    const leaked = fake.uploads.filter((u) => u.moments.length > 0);
    expect(leaked).toEqual([]);
  });

  it('still adopts newer cloud moments for the same account', async () => {
    await signInAs('account-A', cloudRow(['m1'], '2026-07-01T00:00:00.000Z'));
    await signInAs('account-A', cloudRow(['m1', 'm2'], '2026-07-05T00:00:00.000Z'));
    expect(momentIds()).toEqual(['m1', 'm2']);
  });
});
