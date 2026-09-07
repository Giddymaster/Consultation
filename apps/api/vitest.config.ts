import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Every suite talks to the same Postgres test database. Running files in
    // parallel would let one suite's truncation delete another's fixtures, so
    // the pool is limited to a single fork.
    pool: 'forks',
    maxForks: 1,
    minForks: 1,
    fileParallelism: false,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/modules/**', 'src/lib/**'],
      exclude: ['src/generated/**'],
    },
  },
});
