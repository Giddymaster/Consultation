import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env, isProduction } from '../config/env.js';

/**
 * Single Prisma instance for the process. Prisma 7 takes the connection through
 * a driver adapter rather than the schema, so the URL is configured in exactly
 * two places: here for the runtime, and prisma.config.ts for the CLI.
 *
 * The instance is cached on globalThis so `tsx watch` reloads do not exhaust
 * the connection pool by opening a new pool on every file change.
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

const globalForPrisma = globalThis as unknown as { __meridianPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.__meridianPrisma ??
  new PrismaClient({
    adapter,
    log: isProduction ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!isProduction) globalForPrisma.__meridianPrisma = prisma;

export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

/** Cheap liveness probe used by GET /health and by deployment readiness checks. */
export async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
