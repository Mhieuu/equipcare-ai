import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { disconnectPrisma, runSchedulerTick } from '@equipcare/backend-core';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const SCHEDULER_INTERVAL_MS = Number(process.env.SCHEDULER_INTERVAL_MS ?? 60_000);

async function main(): Promise<void> {
  console.info('[worker] starting M8 worker (Redis + scheduler loop)');

  // Worker singleton PrismaClient (Doc04 §10.1 - worker ko dung Nest DI)
  const prisma = new PrismaClient();
  await prisma.$connect();
  console.info('[worker] PostgreSQL connected');

  connection.on('error', (err) => console.error('[worker][redis]', err.message));

  await connection.set('worker:heartbeat', new Date().toISOString());
  const heartbeat = await connection.get('worker:heartbeat');
  console.info('[worker] heartbeat =', heartbeat);

  // Scheduler loop - Doc04 §5.10 + plan M8.
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runSchedulerTick(prisma);
      if (r.advancedPlans + r.createdOccurrences + r.skippedOccurrences + r.createdWorkOrders > 0) {
        console.info('[worker][scheduler] tick', JSON.stringify(r));
      }
    } catch (e) {
      console.error('[worker][scheduler] tick failed', e);
    } finally {
      running = false;
    }
  };

  // Initial tick ngay khi start (de test/manual)
  await tick();

  const interval = setInterval(() => {
    void tick();
  }, SCHEDULER_INTERVAL_MS);

  console.info(`[worker] scheduler loop started, interval=${SCHEDULER_INTERVAL_MS}ms`);

  const shutdown = async (signal: string): Promise<void> => {
    console.info(`[worker] received ${signal}, shutting down`);
    clearInterval(interval);
    await disconnectPrisma();
    await prisma.$disconnect();
    await connection.quit();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[worker] startup failed', err);
  process.exit(1);
});
