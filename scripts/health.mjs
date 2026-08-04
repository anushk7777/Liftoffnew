// A daily snapshot of the project's health, appended to docs/HEALTH.md.
// Run: node scripts/health.mjs   (expects `npm run build` to have run first)
//
// This exists because a scheduled job that commits nothing useful is just noise
// wearing a hat. The numbers here are ones that genuinely drift and genuinely
// matter — how big the app has got, how many tests stand behind it, how far the
// dependencies have fallen behind — and a row a day makes that drift visible
// instead of something you notice six months late.
//
// Nothing here can fail the build: every measurement is wrapped, and a metric it
// cannot read is recorded as "?" rather than crashing the run that was supposed
// to be routine maintenance.
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'docs', 'HEALTH.md');

const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/** Total shipped JavaScript, and the largest single chunk — the number that
 *  actually decides how long a phone stares at a blank screen. */
function bundle() {
  const dir = join(root, 'dist', 'assets');
  if (!existsSync(dir)) return { total: null, largest: null };
  const js = readdirSync(dir).filter((f) => f.endsWith('.js'));
  let total = 0;
  let largest = 0;
  for (const f of js) {
    const { size } = statSync(join(dir, f));
    total += size;
    if (size > largest) largest = size;
  }
  return { total: Math.round(total / 1024), largest: Math.round(largest / 1024) };
}

/** Escape sequences, so a parse never depends on how the output was painted. */
const stripAnsi = (s) => String(s).replace(/\[[0-9;]*[A-Za-z]/g, '');

/**
 * Tests and files, from vitest's machine-readable report.
 *
 * The first version scraped the rendered summary with `/Tests\s+(\d+)\s+passed/`
 * and recorded **"? ? X"** on the very first CI run — reporting a passing suite
 * as broken, because a failed parse also drops `green` to false.
 *
 * The cause was never reproduced. The same command, the same Node version, with
 * `CI=true` and `GITHUB_ACTIONS=true` set, parses correctly here; and the
 * runner's Measure step took the suite's normal 12 seconds, so vitest ran to
 * completion. What made its output unreadable there is unknown — and it stayed
 * unknown because `execSync` captures the output, so the log recorded the "?"
 * and nothing else.
 *
 * Two changes follow, and the second matters as much as the first:
 *
 *   1. The reading no longer depends on rendered output at all.
 *      `--reporter=json` is a contract; a summary line is a rendering, and this
 *      rendering broke on the one machine that mattered.
 *   2. When it still cannot read a count, it PRINTS WHAT IT SAW. A measurement
 *      that fails silently is worse than no measurement; next time the log will
 *      say why instead of shrugging.
 *
 * The text parse survives as a fallback, with colour stripped in case that was
 * it after all.
 */
function tests() {
  const report = join(root, 'node_modules', '.cache', 'liftoff-health-tests.json');
  mkdirSync(dirname(report), { recursive: true });
  // NO_COLOR belt-and-braces for the fallback path; `|| true` because a failing
  // suite must still produce a row rather than throw away the whole snapshot.
  const raw = safe(
    () =>
      execSync(`npx vitest run --reporter=json --outputFile=${JSON.stringify(report)} 2>&1 || true`, {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      }),
    '',
  );

  const j = safe(() => JSON.parse(readFileSync(report, 'utf8')), null);
  if (j && Number.isFinite(j.numTotalTests) && j.numTotalTests > 0) {
    return {
      count: j.numTotalTests,
      // `testResults` is one entry per FILE. `numTotalTestSuites` counts
      // `describe` blocks — 195 of them against 41 files — and using it silently
      // changed what the column meant mid-history, which is the kind of break a
      // trend table cannot survive.
      files: Array.isArray(j.testResults) ? j.testResults.length : null,
      green: (j.numFailedTests ?? 0) === 0,
    };
  }

  const out = stripAnsi(raw);
  const t = out.match(/Tests\s+(\d+)\s+passed/);
  const f = out.match(/Test Files\s+(\d+)\s+passed/);
  const failed = /Tests\s+\d+\s+failed/.test(out);
  if (!t) {
    // The whole point of the rewrite: never fail quietly again.
    console.error('health: could not read a test count from either the JSON report or the output.');
    console.error(`health: json report present = ${existsSync(report)}`);
    console.error('health: last 2000 chars of what vitest printed ----------------');
    console.error(out.slice(-2000) || '(nothing at all)');
    console.error('health: -----------------------------------------------------');
  }
  return { count: t ? Number(t[1]) : null, files: f ? Number(f[1]) : null, green: !failed && !!t };
}

/** How far behind the dependencies have drifted. `npm outdated` exits non-zero
 *  when anything is out of date, which is the normal case, so it is read for its
 *  output rather than its status. */
function outdated() {
  const raw = safe(
    () => execSync('npm outdated --json 2>/dev/null || true', { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }),
    '',
  );
  const parsed = safe(() => JSON.parse(raw || '{}'), {});
  return Object.keys(parsed ?? {}).length;
}

const day = new Date().toISOString().slice(0, 10);
const b = safe(bundle, { total: null, largest: null });
const t = safe(tests, { count: null, files: null, green: false });
const o = safe(outdated, null);
const n = (v, suffix = '') => (v == null ? '?' : `${v}${suffix}`);

const row = `| ${day} | ${n(t.count)} | ${n(t.files)} | ${t.green ? '✅' : '❌'} | ${n(b.total, ' KB')} | ${n(b.largest, ' KB')} | ${n(o)} |`;

const HEADER = `# Health

A row a day, written by \`.github/workflows/health.yml\`. Nothing here is
generated for its own sake — these are the numbers that drift quietly and are
expensive to notice late: how much JavaScript a phone has to download, how many
tests stand behind a change, and how far the dependencies have fallen behind.

One row per date is also one commit per day, which is what keeps the
contribution graph green. That is deliberate and it is the honest version: each
of those commits carries a measurement actually taken that day, so the history
still means something to whoever reads it later.

\`Green\` is the test suite. A bundle of \`?\` means the production build failed
that day — the snapshot is taken anyway, because a broken main is exactly the
day the record is worth having.

Read the columns as trends, not as targets.

| Date | Tests | Files | Green | Bundle | Largest chunk | Outdated deps |
| --- | --- | --- | --- | --- | --- | --- |
`;

mkdirSync(dirname(OUT), { recursive: true });
const existing = existsSync(OUT) ? readFileSync(OUT, 'utf8') : HEADER;
// One row per day: a re-run on the same date replaces rather than duplicates.
const lines = existing.split('\n').filter((l) => !l.startsWith(`| ${day} |`));
// Newest last, so the file reads as a timeline.
const body = lines.join('\n').replace(/\n+$/, '');
writeFileSync(OUT, `${body}\n${row}\n`);
console.log(row);
