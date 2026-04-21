// ─────────────────────────────────────────────────────────────────────────────
// index.ts — server entry point.
// Starts the HTTP server, initialises Socket.io and background jobs,
// and handles graceful shutdown.
// ─────────────────────────────────────────────────────────────────────────────

import { app }              from './app';
import { config } from './config/config';
import { logger, redis, prisma } from './utils/index';
import { initSocketServer }  from './socket/socket.server';
import { initJobs }        from './jobs/index';

const PORT = config.app.port;

async function start(): Promise<void> {
  // Verify Redis is reachable before accepting traffic
  try {
    await redis.ping();
    logger.info('Redis ping OK');
  } catch (err) {
    logger.error({ err }, 'Redis is not reachable — aborting startup');
    process.exit(1);
  }

  // Verify DB is reachable
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database ping OK');
  } catch (err) {
    logger.error({ err }, 'Database is not reachable — aborting startup');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT, env: config.app.nodeEnv }, 'TeamChat server started');
  });


  initSocketServer(server);
  await initJobs();

  // ── Graceful shutdown ─────────────────────────────────────────────────────

  const shutdown = (signal: string) => async (): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');
    // Forcefully close all keep-alive / CLOSE_WAIT connections so the port is
    // released immediately — prevents EADDRINUSE on tsx-watch reloads.
    server.closeAllConnections();
    server.close(async () => {
      logger.info('HTTP server closed');
      await prisma.$disconnect();
      await redis.quit();
      logger.info('Connections closed — exiting');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', shutdown('SIGTERM'));
  process.on('SIGINT',  shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — shutting down');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection — shutting down');
    process.exit(1);
  });
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
