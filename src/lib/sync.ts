// =========================================================================
// Cross-device sync helpers.
//
// Sync is keyed by the signed-in account (Supabase user.id) — each account has
// one private `user_data` cloud row. There is no passphrase; signing into the
// same Google account on another device shares the workspace automatically.
// These helpers cover the per-device id, the local recency marker, and the
// recency-guarded, non-destructive merge.
// =========================================================================

import { safeSetItem } from './utils';

const DEVICE_ID_KEY = 'liftoff_device_id';
const UPDATED_AT_KEY = 'liftoff_updated_at';
const EPOCH = '1970-01-01T00:00:00.000Z';

const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

// Stable random per-device id (the default workspace when no sync code is set).
// If localStorage is unavailable (Safari private mode, etc.) we fall back to a
// process-lifetime id so the app keeps working instead of throwing.
let memoryDeviceId = '';
export function getDeviceId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    /* storage unavailable */
  }
  if (!id) {
    id = memoryDeviceId || uid();
    memoryDeviceId = id;
    safeSetItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// Guarded read — localStorage can throw in private mode / when storage is off.
const readItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const getLocalUpdatedAt = (): string => readItem(UPDATED_AT_KEY) || EPOCH;
export const setLocalUpdatedAt = (ts: string) => safeSetItem(UPDATED_AT_KEY, ts);

type AnyState = Record<string, unknown>;

function asArray(s: AnyState, key: string): unknown[] {
  return Array.isArray(s[key]) ? (s[key] as unknown[]) : [];
}

// Union two lists by a natural key; the first list wins on key conflict.
// Items whose key is empty/undefined/null are always kept (never falsely
// deduped together under an "undefined" key).
function unionBy(base: unknown[], other: unknown[], key: (x: unknown) => string): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const item of [...base, ...other]) {
    const k = key(item);
    if (k && k !== 'undefined' && k !== 'null') {
      if (seen.has(k)) continue;
      seen.add(k);
    }
    out.push(item);
  }
  return out;
}

// Recency-guarded, non-destructive merge:
//  - id-keyed collections (tasks / ideas / notes / habits) and the append-only
//    logs are UNIONED by their natural key, so concurrent additions on either
//    device are never lost. The recency winner ("base") wins on same-key
//    conflicts, so the most recent edit of an item takes precedence.
//  - scalar settings + the roadmap (theme, targetDate, pomodoro, streak,
//    phases, …) take the recency winner via the `...base` spread.
// Trade-off: without tombstones, deleting an item on one device can be undone by
// an add still present on the other. For a personal app, preserving the user's
// data is worth more than propagating every deletion instantly.
export function mergeState(
  local: AnyState,
  cloud: AnyState,
  localTs: string,
  cloudTs: string,
): AnyState {
  const cloudNewer = new Date(cloudTs).getTime() > new Date(localTs).getTime();
  const base = cloudNewer ? cloud : local;
  const other = cloudNewer ? local : cloud;
  const k = (x: unknown) => (x ?? {}) as Record<string, unknown>;
  const byId = (field: string) => (x: unknown) => String(k(x)[field] ?? '');
  const union = (field: string, keyFn: (x: unknown) => string) =>
    unionBy(asArray(base, field), asArray(other, field), keyFn);
  return {
    ...base,
    tasks: union('tasks', byId('id')),
    ideas: union('ideas', byId('id')),
    notes: union('notes', byId('id')),
    habits: union('habits', byId('id')),
    focusSessions: union('focusSessions', byId('id')),
    activityHistory: union('activityHistory', (a) => String(k(a).date)),
    habitLog: union('habitLog', (l) => `${k(l).habitId}:${k(l).date}`),
  };
}
