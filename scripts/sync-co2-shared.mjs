// Copy the CO2 scheduling rule from the app into the Edge Function.
// Run: node scripts/sync-co2-shared.mjs
//
// The Edge Function is deployed by pasting one self-contained file into the
// Supabase dashboard, so it cannot import from src/. Rather than maintain the
// same window/slot/wording logic twice by hand — the classic way a reminder ends
// up firing at the right hour in the browser and the wrong hour on a phone —
// the block is written once in src/afterburn/innovation/co2Server.ts and copied
// here verbatim.
//
// src/afterburn/innovation/co2ServerParity.test.ts checks the two copies match.
// It deliberately re-implements the extraction rather than importing it from
// here: a test that shares its parser with the tool it is checking would agree
// with that tool even when both are wrong.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'src/afterburn/innovation/co2Server.ts');
const TARGET = join(root, 'supabase/functions/send-co2-nudge/index.ts');

const BEGIN = '// ===== SHARED WITH supabase/functions/send-co2-nudge/index.ts — BEGIN =====';
const END = '// ===== SHARED WITH supabase/functions/send-co2-nudge/index.ts — END =====';

/** The marked block including both marker lines. Throws with a useful message
 *  rather than returning something half-right if a marker went missing. */
function extractBlock(text, label) {
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start === -1) throw new Error(`${label}: missing BEGIN marker`);
  if (end === -1) throw new Error(`${label}: missing END marker`);
  if (end < start) throw new Error(`${label}: END marker comes before BEGIN`);
  return text.slice(start, end + END.length);
}

const block = extractBlock(readFileSync(SOURCE, 'utf8'), 'co2Server.ts');
const target = readFileSync(TARGET, 'utf8');
// A function replacement, so `$` sequences inside the code are copied literally
// instead of being read as replacement patterns.
const updated = target.replace(extractBlock(target, 'send-co2-nudge/index.ts'), () => block);

if (updated === target) {
  console.log('already in sync — nothing to do');
} else {
  writeFileSync(TARGET, updated);
  console.log('✓ copied the shared block into supabase/functions/send-co2-nudge/index.ts');
}
