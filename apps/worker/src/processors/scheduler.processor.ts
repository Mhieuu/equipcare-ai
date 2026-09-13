import { PrismaClient } from '@prisma/client';
import { runSchedulerTick, type SchedulerTickResult } from '@equipcare/backend-core';

/**
 * Maintenance scheduler tick - shared implementation in backend-core.
 * Worker chi wrap vao loop, goi runSchedulerTick moi interval.
 */
export async function processMaintenanceTick(
  prisma: PrismaClient,
): Promise<SchedulerTickResult> {
  return runSchedulerTick(prisma);
}

export type { SchedulerTickResult };
export const schedulerProcessorName = 'maintenance-scheduler';
