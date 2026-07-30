import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The Edge Function that pushes the morning nudge to a closed phone carries a
// copy of the scheduling rule, because it is deployed by pasting one file into
// the Supabase dashboard and so cannot import from src/. A copy is a liability:
// the failure it invites is the browser saying 09:30 and the phone buzzing at
// 08:30 after someone edits one and forgets the other — invisible in code
// review, invisible in every other test, and only noticed in bed.
//
// So this test holds the two byte-identical. The extraction is re-implemented
// here rather than imported from scripts/sync-co2-shared.mjs on purpose: a check
// that shares its parser with the tool it checks agrees with that tool even when
// both are wrong.

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SOURCE = join(root, 'src/afterburn/innovation/co2Server.ts');
const TARGET = join(root, 'supabase/functions/send-co2-nudge/index.ts');

const BEGIN = '// ===== SHARED WITH supabase/functions/send-co2-nudge/index.ts — BEGIN =====';
const END = '// ===== SHARED WITH supabase/functions/send-co2-nudge/index.ts — END =====';

function block(text: string): string {
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  expect(start, 'BEGIN marker').toBeGreaterThan(-1);
  expect(end, 'END marker').toBeGreaterThan(start);
  return text.slice(start, end + END.length);
}

const source = readFileSync(SOURCE, 'utf8');
const target = readFileSync(TARGET, 'utf8');

describe('the Edge Function copy of the CO2 rule', () => {
  it('is byte-identical to the source block', () => {
    // If this fails: edit src/afterburn/innovation/co2Server.ts, then run
    //   node scripts/sync-co2-shared.mjs
    expect(block(target)).toBe(block(source));
  });

  it('has exactly one marked block in each file', () => {
    for (const [label, text] of [['source', source], ['edge function', target]] as const) {
      expect(text.split(BEGIN).length - 1, `${label} BEGIN`).toBe(1);
      expect(text.split(END).length - 1, `${label} END`).toBe(1);
    }
  });

  it('carries the real logic, not an empty shell', () => {
    // Guards against the sync script "succeeding" by copying nothing — the
    // block would match and the function would have no scheduling rule at all.
    const b = block(source);
    expect(b).toContain('export function co2Due(');
    expect(b).toContain('export function wallClockIn(');
    expect(b).toContain('CO2_TAGLINES');
    expect(b.length).toBeGreaterThan(1500);
  });

  it('stays pasteable: the function imports nothing from the app', () => {
    // Supabase deploys this by pasting a single file. A relative import would
    // deploy fine locally and fail in the dashboard.
    const imports = [...target.matchAll(/^\s*import\s.*?from\s+['"](.+?)['"]/gm)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) {
      expect(spec.startsWith('.'), `relative import: ${spec}`).toBe(false);
      expect(spec.startsWith('npm:') || spec.startsWith('https://') || spec.startsWith('node:')).toBe(true);
    }
    expect(target).not.toContain('from "../../../src');
  });

  it('actually uses the shared rule rather than a hand-rolled one', () => {
    const body = target.slice(target.indexOf(END));
    expect(body).toContain('co2Due(');
    expect(body).toContain('CO2_CRON_GRACE_MINUTES');
    // The de-dup claim must be keyed on all four parts, or one device can
    // silence another that is in a different country.
    expect(body).toContain('time_zone: zone');
    expect(body).toContain('local_day: due.day');
    expect(body).toContain('slot: due.slot');
  });

  it('claims the slot before sending, so a double run cannot double-buzz', () => {
    const body = target.slice(target.indexOf(END));
    const claim = body.indexOf('co2_nudge_log');
    const send = body.indexOf('sendNotification');
    expect(claim).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(claim);
    // 23505 is unique_violation: the insert losing the race is the signal that
    // someone else already sent this slot.
    expect(body).toContain('23505');
  });

  it('drops dead subscriptions rather than retrying them forever', () => {
    const body = target.slice(target.indexOf(END));
    expect(body).toContain('404');
    expect(body).toContain('410');
    expect(body).toContain('push_subscriptions');
  });
});

describe('the migration matches what the function writes', () => {
  const sql = readFileSync(join(root, 'supabase/migrations/20260728_co2_push.sql'), 'utf8');

  it('creates the ledger with the zone in its key', () => {
    expect(sql).toContain('create table if not exists public.co2_nudge_log');
    expect(sql.replace(/\s+/g, ' ')).toContain('primary key (user_id, time_zone, local_day, slot)');
  });

  it('adds the timezone column the sender reads', () => {
    expect(sql.replace(/\s+/g, ' ')).toContain('alter table public.push_subscriptions add column if not exists time_zone text');
  });

  it('locks the ledger away from clients', () => {
    expect(sql).toContain('alter table public.co2_nudge_log enable row level security');
  });
});

describe('the cron runs often enough to hit every local 09:30', () => {
  const sql = readFileSync(join(root, 'supabase/migrations/20260728_schedule_co2_nudge.sql'), 'utf8');

  it('is scheduled every 5 minutes', () => {
    expect(sql).toContain("'*/5 * * * *'");
    expect(sql).toContain('send-co2-nudge');
  });

  it('divides every real UTC offset, including the 45-minute ones', () => {
    // Offsets in the tz database land on 15-minute boundaries. A cron period
    // that does not divide 15 would miss 09:30 in Nepal or Chatham entirely.
    const period = 5;
    expect(15 % period).toBe(0);
  });
});
