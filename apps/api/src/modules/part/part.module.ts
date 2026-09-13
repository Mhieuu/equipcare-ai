import { Module } from '@nestjs/common';
import { PartController } from './part.controller';
import { PartService } from './part.service';
import { StockTransactionModule } from '../stock-transaction/stock-transaction.module';

@Module({
  imports: [StockTransactionModule],
  controllers: [PartController],
  providers: [PartService],
  exports: [PartService],
})
export class PartModule {}
