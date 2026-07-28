import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { db, resetDb } from '../../test/stubs/supabase-js';
import { sent, failures, vapid, resetPush } from '../../test/stubs/web-push';

// Drives the REAL Edge Function — the exact file that gets pasted into the
// Supabase dashboard — against an in-memory Postgres and a fake web-push.
//
// Everything that can actually go wrong with this feature lives in the
// orchestration, not the arithmetic: two phones in two countries silencing each
// other, a slot pushed twice because a cron tick overlapped, a nudge sent to a
// subscription the browser threw away months ago, a missing timezone quietly
// treated as UTC and buzzing someone at 3am. None of that is reachable from a
// unit test of the scheduling rule, and none of it is visible until it happens
// to a real person at a real hour.

type Handler = (req: Request) => Promise<Response>;
let handler: Handler;

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

/** 2026-07-28T04:00Z — 09:30 in Kolkata, 21:00 the previous day in Los Angeles. */
const INDIA_0930 = new Date('2026-07-28T04:00:00Z');

beforeAll(async () => {
  // The function reads its config through Deno's API and registers its handler
  // with Deno.serve. Both have to exist before the module body runs.
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: {
      get: (k: string) =>
        ({
          VAPID_PUBLIC_KEY: 'test-public',
          VAPID_PRIVATE_KEY: 'test-private',
          VAPID_SUBJECT: 'mailto:test@example.com',
          SUPABASE_URL: 'https://test.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role',
        })[k],
    },
    serve: (h: Handler) => {
      handler = h;
    },
  };
  await import('../../../supabase/functions/send-co2-nudge/index.ts');
  expect(handler, 'the function registered a handler').toBeTypeOf('function');
});

beforeEach(() => {
  resetDb();
  resetPush();
});

function device(endpoint: string, user: string, zone: string | null) {
  db.push_subscriptions.push({
    endpoint,
    user_id: user,
    subscription: { endpoint },
    time_zone: zone,
  });
}

function logged(user: string, iso: string) {
  const row = db.workout_data.find((r) => r.id === user);
  const entry = { id: `r-${iso}`, date: iso, co2Score: 40 };
  if (row) (row.data as { recovery: unknown[] }).recovery.push(entry);
  else db.workout_data.push({ id: user, data: { recovery: [entry] } });
}

async function run(at: Date, query = '') {
  // The function reads `new Date()`, so the clock has to be moved rather than
  // passed. Restored immediately — a leaked global clock poisons every later test.
  const Real = Date;
  class Frozen extends Real {
    constructor(...args: ConstructorParameters<typeof Date>) {
      if (args.length === 0) super(at.getTime());
      else super(...args);
    }
    static now() {
      return at.getTime();
    }
  }
  (globalThis as unknown as { Date: unknown }).Date = Frozen;
  try {
    const res = await handler(new Request(`https://edge.test/send-co2-nudge${query}`));
    return { status: res.status, body: await res.json() };
  } finally {
    (globalThis as unknown as { Date: unknown }).Date = Real;
  }
}

describe('send-co2-nudge', () => {
  it('sends the 09:30 nudge to a device in that zone', async () => {
    device('ep-phone', USER, 'Asia/Kolkata');
    const { status, body } = await run(INDIA_0930);

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.sent).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toBe('ep-phone');
    expect(sent[0].payload.title).toBe('CO2 tolerance test');
    expect(sent[0].payload.body).toBe('One slow breath out. Your recovery score is waiting.');
    expect(sent[0].payload.url).toBe('/?co2=1');
    expect(sent[0].payload.tag).toBe('afterburn-co2');
    expect(vapid?.publicKey).toBe('test-public');
  });

  it('says nothing to a device whose morning it is not', async () => {
    // Same instant: 09:30 in India, 21:00 the day before in Los Angeles.
    device('ep-la', USER, 'America/Los_Angeles');
    const { body } = await run(INDIA_0930);

    expect(body.sent).toBe(0);
    expect(body.skippedLoggedOrClosed).toBe(1);
    expect(sent).toHaveLength(0);
  });

  it('nudges two phones in the same zone once each, off one ledger row', async () => {
    device('ep-a', USER, 'Asia/Kolkata');
    device('ep-b', USER, 'Asia/Kolkata');
    const { body } = await run(INDIA_0930);

    expect(body.sent).toBe(2);
    expect(sent.map((s) => s.endpoint).sort()).toEqual(['ep-a', 'ep-b']);
    expect(db.co2_nudge_log).toHaveLength(1);
  });

  it('does not let a phone in one country silence a phone in another', async () => {
    // The bug this guards: keying de-dup on (user, day, slot) alone. Both
    // devices belong to one person and both are in their own local 09:30 — the
    // Indian one now, the Californian one 12.5 hours later — and the local dates
    // are the same string. Whichever fires first would claim the key.
    device('ep-india', USER, 'Asia/Kolkata');
    device('ep-la', USER, 'America/Los_Angeles');

    const first = await run(INDIA_0930);
    expect(first.body.sent).toBe(1);
    expect(sent[0].endpoint).toBe('ep-india');

    // 2026-07-28T16:30Z is 09:30 in Los Angeles, still the 28th in both places.
    const second = await run(new Date('2026-07-28T16:30:00Z'));
    expect(second.body.sent).toBe(1);
    expect(sent[1].endpoint).toBe('ep-la');

    expect(db.co2_nudge_log).toHaveLength(2);
    expect(new Set(db.co2_nudge_log.map((r) => r.local_day))).toEqual(new Set(['2026-07-28']));
    expect(new Set(db.co2_nudge_log.map((r) => r.time_zone))).toEqual(
      new Set(['Asia/Kolkata', 'America/Los_Angeles']),
    );
  });

  it('never sends the same slot twice, however often the cron runs', async () => {
    device('ep-phone', USER, 'Asia/Kolkata');
    // Five overlapping ticks inside one half-hour slot.
    for (const m of [0, 5, 10, 15, 25]) {
      await run(new Date(INDIA_0930.getTime() + m * 60_000));
    }
    expect(sent).toHaveLength(1);
    expect(db.co2_nudge_log).toHaveLength(1);
    // Four attempts were made and rejected by the primary key — that rejection
    // IS the de-dup, so it must actually be happening.
    expect(db.insertAttempts.filter((a) => a.rejected)).toHaveLength(4);
  });

  it('sends each of the four slots once across a morning', async () => {
    device('ep-phone', USER, 'Asia/Kolkata');
    // A tick every 5 minutes from 09:00 to 11:30 local.
    for (let m = -30; m <= 120; m += 5) {
      await run(new Date(INDIA_0930.getTime() + m * 60_000));
    }
    expect(sent).toHaveLength(4);
    expect(sent.map((s) => s.payload.body)).toEqual([
      'One slow breath out. Your recovery score is waiting.',
      'Before the day gets loud — one exhale, one number.',
      "Still time. One breath tells you what today's training should cost.",
      'Last call — the window closes at 11, and a late reading tells you nothing.',
    ]);
    expect(db.co2_nudge_log.map((r) => r.slot)).toEqual([0, 1, 2, 3]);
  });

  it('goes quiet the moment the test is logged', async () => {
    device('ep-phone', USER, 'Asia/Kolkata');
    await run(INDIA_0930); // 09:30 nudge goes out
    expect(sent).toHaveLength(1);

    logged(USER, new Date(INDIA_0930.getTime() + 5 * 60_000).toISOString());

    for (let m = 10; m <= 120; m += 5) {
      await run(new Date(INDIA_0930.getTime() + m * 60_000));
    }
    expect(sent).toHaveLength(1); // nothing more all morning
  });

  it('skips a subscription with no timezone rather than guessing UTC', async () => {
    // Guessing would nudge this device at 09:30 UTC, which is the small hours in
    // half the world. It self-heals: the app writes the zone on next open.
    device('ep-old', USER, null);
    device('ep-new', USER, 'Asia/Kolkata');
    const { body } = await run(INDIA_0930);

    expect(body.missingZone).toBe(1);
    expect(sent.map((s) => s.endpoint)).toEqual(['ep-new']);

    // …and it never nudges at 09:30 UTC either.
    resetPush();
    await run(new Date('2026-07-28T09:30:00Z'));
    expect(sent.filter((s) => s.endpoint === 'ep-old')).toHaveLength(0);
  });

  it('claims the slot BEFORE sending, so a failed send is not retried forever', async () => {
    device('ep-phone', USER, 'Asia/Kolkata');
    failures.set('ep-phone', 500); // a transient provider error
    const { body } = await run(INDIA_0930);

    expect(body.sent).toBe(0);
    expect(db.co2_nudge_log).toHaveLength(1); // claimed anyway
    // The alternative — claim after sending — turns any provider blip into a
    // loop that re-sends every 5 minutes for 90 minutes.
    await run(new Date(INDIA_0930.getTime() + 5 * 60_000));
    expect(db.co2_nudge_log).toHaveLength(1);
  });

  it('drops a subscription the browser has thrown away', async () => {
    device('ep-dead', USER, 'Asia/Kolkata');
    device('ep-live', USER, 'Asia/Kolkata');
    failures.set('ep-dead', 410); // Gone

    await run(INDIA_0930);
    expect(sent.map((s) => s.endpoint)).toEqual(['ep-live']);
    expect(db.push_subscriptions.map((r) => r.endpoint)).toEqual(['ep-live']);
    expect(db.deletes.some((d) => d.table === 'push_subscriptions' && d.value === 'ep-dead')).toBe(true);
  });

  it('keeps a subscription that failed for a reason that might pass', async () => {
    device('ep-flaky', USER, 'Asia/Kolkata');
    failures.set('ep-flaky', 503);
    await run(INDIA_0930);
    expect(db.push_subscriptions).toHaveLength(1);
  });

  it('keeps users apart', async () => {
    device('ep-mine', USER, 'Asia/Kolkata');
    device('ep-theirs', OTHER, 'Asia/Kolkata');
    logged(USER, INDIA_0930.toISOString()); // only I have logged

    const { body } = await run(INDIA_0930);
    expect(sent.map((s) => s.endpoint)).toEqual(['ep-theirs']);
    expect(body.sent).toBe(1);
  });

  it('reads each user’s own recovery data, not the first row it finds', async () => {
    device('ep-mine', USER, 'Asia/Kolkata');
    device('ep-theirs', OTHER, 'Asia/Kolkata');
    logged(OTHER, INDIA_0930.toISOString());

    await run(INDIA_0930);
    expect(sent.map((s) => s.endpoint)).toEqual(['ep-mine']);
  });

  it('prunes the ledger instead of letting it grow forever', async () => {
    device('ep-phone', USER, 'Asia/Kolkata');
    db.co2_nudge_log.push({
      user_id: USER,
      time_zone: 'Asia/Kolkata',
      local_day: '2020-01-01',
      slot: 0,
      sent_at: '2020-01-01T00:00:00.000Z',
    });
    await run(INDIA_0930);
    expect(db.co2_nudge_log.some((r) => r.local_day === '2020-01-01')).toBe(false);
    expect(db.co2_nudge_log.some((r) => r.local_day === '2026-07-28')).toBe(true);
  });

  it('reports rather than crashes when the database refuses', async () => {
    device('ep-phone', USER, 'Asia/Kolkata');
    db.failSelect.push_subscriptions = { message: 'permission denied' };
    const { status, body } = await run(INDIA_0930);

    expect(status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.step).toBe('select push_subscriptions');
    expect(body.error).toContain('permission denied');
  });

  it('survives a user with no workout_data row at all', async () => {
    device('ep-phone', USER, 'Asia/Kolkata');
    // No workout_data row: a fresh account that has never logged anything.
    const { status, body } = await run(INDIA_0930);
    expect(status).toBe(200);
    expect(body.sent).toBe(1);
  });

  it('does nothing at all when nobody is subscribed', async () => {
    const { status, body } = await run(INDIA_0930);
    expect(status).toBe(200);
    expect(body.subscriptions).toBe(0);
    expect(body.sent).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('test mode delivers now and leaves no trace in the ledger', async () => {
    device('ep-phone', USER, 'Asia/Kolkata');
    logged(USER, INDIA_0930.toISOString()); // even though today is logged…

    const { body } = await run(new Date('2026-07-28T20:00:00Z'), '?test=1'); // …and it is the middle of the night
    expect(body.testMode).toBe(true);
    expect(body.sent).toBe(1);
    expect(db.co2_nudge_log).toHaveLength(0);

    // …so a real run afterwards is unaffected.
    resetPush();
    const real = await run(INDIA_0930);
    expect(real.body.sent).toBe(0); // still silenced by the logged reading
  });

  it('refuses to run without VAPID keys instead of failing silently', async () => {
    const saved = (globalThis as unknown as { Deno: { env: { get: (k: string) => string | undefined } } }).Deno;
    (globalThis as unknown as { Deno: unknown }).Deno = {
      ...saved,
      env: { get: (k: string) => (k.startsWith('VAPID') ? undefined : saved.env.get(k)) },
    };
    try {
      const { status, body } = await run(INDIA_0930);
      expect(status).toBe(500);
      expect(body.step).toBe('secrets');
    } finally {
      (globalThis as unknown as { Deno: unknown }).Deno = saved;
    }
  });
});

describe('send-co2-nudge — the cron’s own lateness', () => {
  it('still delivers the 11:00 last call when a tick runs 4 minutes late', async () => {
    device('ep-phone', USER, 'Asia/Kolkata');
    // Skip straight to a late tick: 11:04 local, the first one of the morning.
    await run(new Date('2026-07-28T05:34:00Z'));
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.body).toContain('Last call');
  });

  it('does not turn the grace into a fifth nudge', async () => {
    device('ep-phone', USER, 'Asia/Kolkata');
    for (let m = -30; m <= 150; m += 1) {
      await run(new Date(INDIA_0930.getTime() + m * 60_000));
    }
    expect(sent).toHaveLength(4);
  });

  it('gives up rather than sending a stale nudge long after the window', async () => {
    device('ep-phone', USER, 'Asia/Kolkata');
    await run(new Date('2026-07-28T05:36:00Z')); // 11:06 local
    expect(sent).toHaveLength(0);
  });
});
