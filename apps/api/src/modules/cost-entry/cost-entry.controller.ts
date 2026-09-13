import {
  Controller,
  Get,
  Post,
  Body,
  Param,
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
import { CostEntryService } from './cost-entry.service';
import { CreateCostEntryDto } from './dto/cost-entry.dto';

/**
 * Cost entries endpoints (Doc04 section 5.6).
 *
 * Permission map:
 *   COST_CREATE : POST /work-orders/:id/cost-entries
 *   COST_READ   : GET /work-orders/:id/cost-entries
 *
 * Nested under work-orders route (REST nested resource Doc02).
 */
@Controller('work-orders/:workOrderId/cost-entries')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CostEntryController {
  constructor(private readonly service: CostEntryService) {}

  @Get()
  @Permissions(Permission.COST_READ)
  list(@Param('workOrderId', new ParseUUIDPipe()) workOrderId: string) {
    return this.service.listByWorkOrder(workOrderId);
  }

  @Post()
  @Permissions(Permission.COST_CREATE)
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Body() dto: CreateCostEntryDto,
  ) {
    return this.service.create(user.sub, workOrderId, dto);
  }
}
