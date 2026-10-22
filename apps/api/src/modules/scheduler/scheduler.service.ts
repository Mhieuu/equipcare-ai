import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { runSchedulerTick } from '@equipcare/backend-core';

/**
 * SchedulerModule — chạy maintenance scheduler tick trong API process.
 *
 * Sau khi cắt apps/worker (BullMQ), scheduler tick được host trực tiếp trong
 * NestJS API bằng setInterval. Mỗi tick gọi `runSchedulerTick(prisma)` để:
 *   1) Advance các plan ACTIVE/FIXED đến next_due_on.
 *   2) Tạo occurrence OVERDUE/PLANNED cho các plan đến hạn.
 *   3) Sinh WorkOrder cho các occurrence chưa có WO.
 *   4) Cập nhật status occurrence khi WO COMPLETED.
 *
 * Interval mặc định: 60 giây, có thể override bằng SCHEDULER_INTERVAL_MS.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const intervalMs = Number(process.env.SCHEDULER_INTERVAL_MS ?? 60000);
    this.logger.log(`Scheduler tick started, every ${intervalMs}ms`);
    this.timer = setInterval(() => {
      this.tick().catch((err) =>
        this.logger.error('Scheduler tick failed', err),
      );
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.logger.log('Scheduler tick stopped');
    }
  }

  private async tick() {
    try {
      const result = await runSchedulerTick(this.prisma);
      if (
        result.advancedPlans > 0 ||
        result.createdOccurrences > 0 ||
        result.skippedOccurrences > 0 ||
        result.createdWorkOrders > 0
      ) {
        this.logger.log(
          `Scheduler tick done — advanced=${result.advancedPlans}, ` +
          `created_occ=${result.createdOccurrences}, ` +
          `skipped=${result.skippedOccurrences}, created_wo=${result.createdWorkOrders}`,
        );
      }
    } catch (err) {
      this.logger.error('Scheduler tick error', err);
    }
  }
}
