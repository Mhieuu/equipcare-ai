import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [PrismaModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
