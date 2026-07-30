// A fake `@supabase/supabase-js` for testing the Edge Functions in-process.
//
// vitest aliases the function's `npm:@supabase/supabase-js@2` specifier here
// (see vitest.config.ts), which lets the REAL function file — the exact bytes
// that get pasted into the Supabase dashboard — run against an in-memory
// database. Everything interesting about the CO2 sender lives in its
// orchestration rather than its arithmetic: grouping devices by zone, claiming a
// slot before sending, honouring a unique-violation, dropping dead
// subscriptions. None of that is visible to a pure unit test.
//
// Only the query shapes the functions actually use are supported. An
// unsupported call throws loudly rather than resolving to something plausible.

export interface FakeError {
  message: string;
  code?: string;
}

export interface FakeDb {
  push_subscriptions: Record<string, unknown>[];
  workout_data: Record<string, unknown>[];
  co2_nudge_log: Record<string, unknown>[];
  /** Force a table's next read to fail, to exercise the error paths. */
  failSelect: Record<string, FakeError | undefined>;
  /** Every insert attempted, including the ones rejected as duplicates. */
  insertAttempts: { table: string; row: Record<string, unknown>; rejected: boolean }[];
  /** Rows removed by `.delete()`, in order. */
  deletes: { table: string; where: string; value: unknown }[];
}

export const db: FakeDb = emptyDb();

function emptyDb(): FakeDb {
  return {
    push_subscriptions: [],
    workout_data: [],
    co2_nudge_log: [],
    failSelect: {},
    insertAttempts: [],
    deletes: [],
  };
}

export function resetDb() {
  Object.assign(db, emptyDb());
}

/** The composite primary keys the migrations declare. An insert that repeats one
 *  must fail with Postgres's unique_violation, because that failure IS the
 *  de-dup mechanism the sender relies on. */
const PRIMARY_KEYS: Record<string, string[]> = {
  co2_nudge_log: ['user_id', 'time_zone', 'local_day', 'slot'],
  reminder_log: ['user_id', 'task_id', 'scheduled_at'],
  push_subscriptions: ['endpoint'],
};

type Row = Record<string, unknown>;

class Query implements PromiseLike<{ data: Row[] | Row | null; error: FakeError | null }> {
  private filters: [string, unknown][] = [];
  private mode: 'select' | 'delete' | 'insert' = 'select';
  private single = false;
  private payload: Row | null = null;

  constructor(private table: string) {}

  select(_cols?: string) {
    this.mode = 'select';
    return this;
  }
  insert(row: Row) {
    this.mode = 'insert';
    this.payload = row;
    return this;
  }
  delete() {
    this.mode = 'delete';
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push([col, value]);
    return this;
  }
  lt(col: string, value: unknown) {
    this.filters.push([`${col}<`, value]);
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  private rows(): Row[] {
    const table = (db as unknown as Record<string, Row[]>)[this.table];
    if (!Array.isArray(table)) throw new Error(`fake supabase: unknown table ${this.table}`);
    return table.filter((r) =>
      this.filters.every(([col, value]) =>
        col.endsWith('<') ? String(r[col.slice(0, -1)]) < String(value) : r[col] === value,
      ),
    );
  }

  private run(): { data: Row[] | Row | null; error: FakeError | null } {
    if (this.mode === 'insert') {
      const row = this.payload!;
      const keys = PRIMARY_KEYS[this.table];
      const table = (db as unknown as Record<string, Row[]>)[this.table];
      const clash =
        keys && table.some((existing) => keys.every((k) => existing[k] === row[k]));
      db.insertAttempts.push({ table: this.table, row, rejected: Boolean(clash) });
      if (clash) {
        return { data: null, error: { message: 'duplicate key value', code: '23505' } };
      }
      table.push({ ...row, sent_at: row.sent_at ?? new Date().toISOString() });
      return { data: null, error: null };
    }

    if (this.mode === 'delete') {
      const doomed = this.rows();
      const table = (db as unknown as Record<string, Row[]>)[this.table];
      for (const r of doomed) {
        table.splice(table.indexOf(r), 1);
        const [col, value] = this.filters[0] ?? ['', undefined];
        db.deletes.push({ table: this.table, where: col, value });
      }
      return { data: null, error: null };
    }

    const failure = db.failSelect[this.table];
    if (failure) return { data: null, error: failure };
    const found = this.rows();
    return { data: this.single ? (found[0] ?? null) : found, error: null };
  }

  then<A, B = never>(
    onfulfilled?: ((v: { data: Row[] | Row | null; error: FakeError | null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export function createClient(_url: string, _key: string) {
  return {
    from: (table: string) => new Query(table),
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: { id, email: 'test@example.com' } } }),
      },
    },
  };
}
