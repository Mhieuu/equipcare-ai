import {
  Controller,
  Get,
  Post,
  Patch,
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
import { MaintenancePlanService } from './maintenance-plan.service';
import {
  CreateMaintenancePlanDto,
  UpdateMaintenancePlanDto,
  ListMaintenancePlansQueryDto,
} from './dto/maintenance-plan.dto';

/**
 * Maintenance plans endpoints (Doc04 section 5.10 + M8 plan).
 *
 * Permission map:
 *   MAINTENANCE_PLAN_READ    : GET /plans, /plans/:id, /plans/:id/occurrences
 *   MAINTENANCE_PLAN_MANAGE  : POST /plans, PATCH /plans/:id, POST /pause/resume,
 *                             POST /plans/tick (debug - scheduler)
 */
@Controller('maintenance-plans')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class MaintenancePlanController {
  constructor(private readonly service: MaintenancePlanService) {}

  @Get()
  @Permissions(Permission.MAINTENANCE_PLAN_READ)
  list(@Query() q: ListMaintenancePlansQueryDto) {
    return this.service.list(q);
  }

  @Get(':id')
  @Permissions(Permission.MAINTENANCE_PLAN_READ)
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.get(id);
  }

  @Get(':id/occurrences')
  @Permissions(Permission.MAINTENANCE_PLAN_READ)
  occurrences(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.listOccurrences(id);
  }

  @Post()
  @Permissions(Permission.MAINTENANCE_PLAN_MANAGE)
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMaintenancePlanDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  @Permissions(Permission.MAINTENANCE_PLAN_MANAGE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMaintenancePlanDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }

  @Post(':id/pause')
  @Permissions(Permission.MAINTENANCE_PLAN_MANAGE)
  @HttpCode(200)
  pause(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { reason?: string },
  ) {
    return this.service.pause(user.sub, id, body?.reason);
  }

  @Post(':id/resume')
  @Permissions(Permission.MAINTENANCE_PLAN_MANAGE)
  @HttpCode(200)
  resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.resume(user.sub, id);
  }

  /**
   * Manual scheduler tick (debug). Production se co worker processor chay dinh ky.
   * Co the goi qua HTTP de test manual hoac chay ngay sau khi tao plan.
   */
  @Post('tick')
  @Permissions(Permission.MAINTENANCE_PLAN_MANAGE)
  @HttpCode(200)
  tick() {
    return this.service.runSchedulerTick();
  }
}
