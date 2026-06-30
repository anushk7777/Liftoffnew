import { defineConfig } from 'vitest/config';

// Pure-logic unit tests for src/lib + src/afterburn helpers. Node environment;
// a tiny localStorage polyfill (setup) lets modules that touch storage at import
// time (zustand persist) load cleanly.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
