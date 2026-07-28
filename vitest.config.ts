import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Pure-logic unit tests for src/lib + src/afterburn helpers. Node environment;
// a tiny localStorage polyfill (setup) lets modules that touch storage at import
// time (zustand persist) load cleanly.
const stub = (name: string) => fileURLToPath(new URL(`./src/test/stubs/${name}.ts`, import.meta.url));

export default defineConfig({
  // The Supabase Edge Functions are Deno modules that import through `npm:`
  // specifiers. Aliasing those to in-memory stubs lets a test import the REAL
  // function file — the exact bytes pasted into the Supabase dashboard — and
  // drive its whole request handler, which is where its interesting behaviour
  // lives. See src/afterburn/innovation/co2Edge.test.ts.
  resolve: {
    alias: [
      { find: 'npm:@supabase/supabase-js@2', replacement: stub('supabase-js') },
      { find: 'npm:web-push@3.6.7', replacement: stub('web-push') },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
