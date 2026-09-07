import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { disconnectDatabase } from './lib/prisma.js';
import { startWorker, stopWorker } from './services/jobs/worker.js';

/**
 * Process entry point. Kept deliberately thin: everything testable lives in
 * buildApp(), which the test suite instantiates without binding a port.
 */
async function main(): Promise<void> {
  const app = await buildApp();

  // Scheduled work runs in-process by default. Set RUN_JOBS_IN_PROCESS=false
  // and run `pnpm --filter @meridian/api jobs` to scale it separately.
  if (env.RUN_JOBS_IN_PROCESS) startWorker();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    try {
      stopWorker();
      // Stop accepting connections first, then let in-flight work finish before
      // the database pool closes underneath it.
      await app.close();
      await disconnectDatabase();
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    process.exit(1);
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    process.exit(1);
  });

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, docs: `${env.API_URL}/docs` },
      `${env.BUSINESS_NAME} API listening`,
    );
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

void main();
