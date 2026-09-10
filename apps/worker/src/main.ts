import IORedis from 'ioredis';
import { disconnectPrisma } from '@equipcare/backend-core';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const queues = ['ai', 'notification', 'scheduler', 'outbox'] as const;
type QueueName = (typeof queues)[number];

interface DemoPayload {
  msg: string;
}

async function main(): Promise<void> {
  console.info('[worker] M0 stub — connected to Redis', redisUrl);
  console.info('[worker] queue targets:', queues.join(', '));

  // M0: chỉ log job giả định. M2-M3 sẽ bind processors thật.
  connection.on('error', (err) => console.error('[worker][redis]', err.message));

  // Demo ping: publish 1 job thử vào queue 'ai' để xác nhận Redis connection
  // (sẽ được M2-M3 thay bằng processor thực).
  await connection.set('worker:heartbeat', new Date().toISOString());
  const heartbeat = await connection.get('worker:heartbeat');
  console.info('[worker] heartbeat =', heartbeat);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.info(`[worker] received ${signal}, shutting down`);
    await disconnectPrisma();
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

// Demo type — silence unused warning
export type { QueueName, DemoPayload };
