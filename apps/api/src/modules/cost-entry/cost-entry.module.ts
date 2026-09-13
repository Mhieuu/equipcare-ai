import { Module } from '@nestjs/common';
import { CostEntryController } from './cost-entry.controller';
import { CostEntryService } from './cost-entry.service';

@Module({
  controllers: [CostEntryController],
  providers: [CostEntryService],
  exports: [CostEntryService],
})
export class CostEntryModule {}
