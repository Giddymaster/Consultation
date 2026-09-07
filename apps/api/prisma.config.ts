import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 moved the connection string out of schema.prisma. The CLI reads it
 * from here; the runtime client gets it through the pg driver adapter in
 * src/lib/prisma.ts, so there is exactly one place the URL is configured.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
