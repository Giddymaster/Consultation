import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 moved the connection string out of schema.prisma. The CLI reads it
 * from here; the runtime client gets it through the pg driver adapter in
 * src/lib/prisma.ts, so there is exactly one place the URL is configured.
 *
 * Read directly rather than through Prisma's `env()` helper, which throws while
 * this file is being loaded — before the CLI has even decided which command it
 * is running. `prisma generate` needs no connection at all and runs during
 * every build, so that eager throw turned a build on any host without a
 * build-time DATABASE_URL into a failure. The commands that genuinely need a
 * connection (`migrate`, `db push`, `studio`) still report a missing or
 * unusable URL themselves.
 */
const databaseUrl = process.env.DATABASE_URL ?? '';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
