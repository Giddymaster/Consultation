import { config } from 'dotenv';
import { resolve } from 'node:path';

/**
 * Loads .env.test before anything imports src/config/env.ts.
 *
 * `override: true` matters: a developer with a shell DATABASE_URL pointing at
 * the development database would otherwise have their real data truncated by
 * the suite.
 */
config({ path: resolve(import.meta.dirname, '../.env.test'), override: true, quiet: true });

if (!process.env.DATABASE_URL?.includes('meridian_test')) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL does not point at a *_test database (got ${process.env.DATABASE_URL ?? 'nothing'}).`,
  );
}

process.env.NODE_ENV = 'test';
