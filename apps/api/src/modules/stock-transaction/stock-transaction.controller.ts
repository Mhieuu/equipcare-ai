import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Permission } from '@equipcare/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/auth-user.type.js';
import { StockTransactionService } from './stock-transaction.service';
import {
  IssuePartDto,
  ReturnPartDto,
  RecordStockMovementDto,
  ListStockTransactionsQueryDto,
} from './dto/stock-transaction.dto';

/**
 * Stock transactions endpoints (Doc04 section 5.6 + Q-06).
 *
 * Routes:
 *   POST /work-orders/:woId/parts/issue     INVENTORY_ISSUE
 *   POST /work-orders/:woId/parts/return    INVENTORY_RETURN
 *   POST /stock-transactions/receipt        INVENTORY_RECEIPT
 *   POST /stock-transactions/adjust         INVENTORY_ADJUST
 *   GET  /stock-transactions                INVENTORY_PART_READ
 */
@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class StockTransactionController {
  constructor(private readonly service: StockTransactionService) {}

  @Post('work-orders/:woId/parts/issue')
  @Permissions(Permission.INVENTORY_ISSUE)
  @HttpCode(201)
  issueForWorkOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('woId', new ParseUUIDPipe()) workOrderId: string,
    @Body() dto: IssuePartDto,
  ) {
    return this.service.issueForWorkOrder(user.sub, workOrderId, dto);
  }

  @Post('work-orders/:woId/parts/return')
  @Permissions(Permission.INVENTORY_RETURN)
  @HttpCode(201)
  returnForWorkOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('woId', new ParseUUIDPipe()) workOrderId: string,
    @Body() dto: ReturnPartDto,
  ) {
    return this.service.returnForWorkOrder(user.sub, workOrderId, dto);
  }

  @Post('stock-transactions/receipt')
  @Permissions(Permission.INVENTORY_RECEIPT)
  @HttpCode(201)
  receipt(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordStockMovementDto,
  ) {
    return this.service.receipt(user.sub, dto);
  }

  @Post('stock-transactions/adjust')
  @Permissions(Permission.INVENTORY_ADJUST)
  @HttpCode(201)
  adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordStockMovementDto,
  ) {
    return this.service.adjust(user.sub, dto);
  }

  @Get('stock-transactions')
  @Permissions(Permission.INVENTORY_PART_READ)
  list(@Query() q: ListStockTransactionsQueryDto) {
    return this.service.list(q);
  }
}
