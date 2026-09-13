import { Module } from '@nestjs/common';
import { MaintenancePlanController } from './maintenance-plan.controller';
import { MaintenancePlanService } from './maintenance-plan.service';

@Module({
  controllers: [MaintenancePlanController],
  providers: [MaintenancePlanService],
  exports: [MaintenancePlanService],
})
export class MaintenancePlanModule {}
