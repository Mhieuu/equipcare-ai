import { Module } from '@nestjs/common';
import { MaintenancePlanController } from './maintenance-plan.controller';
import { MaintenanceOccurrenceController } from './maintenance-occurrence.controller';
import { MaintenancePlanService } from './maintenance-plan.service';

@Module({
  controllers: [MaintenancePlanController, MaintenanceOccurrenceController],
  providers: [MaintenancePlanService],
  exports: [MaintenancePlanService],
})
export class MaintenancePlanModule {}
