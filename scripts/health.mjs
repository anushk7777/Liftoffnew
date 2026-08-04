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

/** Tests and files, read from vitest's own summary rather than counted by hand. */
function tests() {
  // The default reporter, deliberately: `--reporter=basic` drops the very
  // summary line this parses, and the first version of this script recorded "?"
  // for both counts because of it.
  const out = execSync('npx vitest run 2>&1 || true', {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const t = out.match(/Tests\s+(\d+)\s+passed/);
  const f = out.match(/Test Files\s+(\d+)\s+passed/);
  const failed = /Tests\s+\d+\s+failed/.test(out);
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
