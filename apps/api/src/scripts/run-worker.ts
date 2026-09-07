import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { disconnectDatabase } from '../lib/prisma.js';
import { startWorker, stopWorker } from '../services/jobs/worker.js';

/**
 * Standalone worker process.
 *
 * Run this as its own dyno in production (`pnpm --filter @meridian/api jobs`)
 * with RUN_JOBS_IN_PROCESS=false on the API, so scheduled work scales and
 * restarts independently of request handling.
 */
async function main(): Promise<void> {
  logger.info({ env: env.NODE_ENV }, 'Starting Meridian background worker');
  startWorker(60_000);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Worker shutting down');
    stopWorker();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
