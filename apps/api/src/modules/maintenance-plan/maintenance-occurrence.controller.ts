import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  AppError,
  runSchedulerTick,
  writeAudit,
} from '@equipcare/backend-core';
import { Permission } from '@equipcare/shared';
import type { AuthenticatedUser } from '../../common/types/auth-user.type.js';

/**
 * MaintenanceOccurrenceController - M10 (Doc05 §7 + plan §12.2).
 *
 * Endpoints:
 *   - POST /maintenance-occurrences/:id/skip       (override scheduler, mark SKIPPED)
 *   - POST /maintenance-occurrences/:id/generate-now  (force-create WO now)
 *   - GET  /maintenance-occurrences/:id           (detail)
 *
 * Permissions: MAINTENANCE_PLAN_MANAGE
 */
@Controller('maintenance-occurrences')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class MaintenanceOccurrenceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  @Permissions(Permission.MAINTENANCE_PLAN_READ)
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    const occ = await this.prisma.maintenance_occurrences.findUnique({ where: { id } });
    if (!occ) throw AppError.notFound('Khong tim thay occurrence', { id });
    return {
      id: occ.id,
      planId: occ.plan_id,
      assetId: occ.asset_id,
      dueOn: occ.due_on,
      status: occ.status,
      planVersion: occ.plan_version,
      planSnapshot: occ.plan_snapshot,
      createdAt: occ.created_at,
    };
  }

  @Post(':id/skip')
  @Permissions(Permission.MAINTENANCE_PLAN_MANAGE)
  async skip(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { reason?: string },
  ) {
    const occ = await this.prisma.maintenance_occurrences.findUnique({ where: { id } });
    if (!occ) throw AppError.notFound('Khong tim thay occurrence', { id });
    if (occ.status === 'COMPLETED') {
      throw AppError.unprocessable(
        'OCCURRENCE_ALREADY_COMPLETED',
        'Occurrence da COMPLETED, khong the skip',
        { id, status: occ.status },
      );
    }
    if (occ.status === 'SKIPPED') {
      return { id, status: occ.status, alreadySkipped: true };
    }
    const updated = await this.prisma.maintenance_occurrences.update({
      where: { id },
      data: { status: 'SKIPPED' },
    });
    await writeAudit({
      actorId: actor.sub,
      actorType: 'USER',
      action: 'maintenance_occurrence.skip',
      objectType: 'MaintenanceOccurrence',
      objectKey: id,
      oldValue: { status: occ.status },
      newValue: { status: 'SKIPPED', reason: body?.reason ?? null },
    });
    return { id: updated.id, status: updated.status };
  }

  /**
   * Force-create WO for a PLANNED/OVERDUE occurrence ngay lap tuc.
   * Race với scheduler tick duoc xu ly boi partial unique `uniq_open_wo_per_occurrence`.
   */
  @Post(':id/generate-now')
  @Permissions(Permission.MAINTENANCE_PLAN_MANAGE)
  async generateNow(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    // Reuse scheduler tick: no se xu ly occurrence nay neu due.
    const result = await runSchedulerTick(this.prisma as unknown as PrismaService);
    const occ = await this.prisma.maintenance_occurrences.findUnique({
      where: { id },
      include: { work_orders: true },
    });
    if (!occ) throw AppError.notFound('Khong tim thay occurrence', { id });
    await writeAudit({
      actorId: actor.sub,
      actorType: 'USER',
      action: 'maintenance_occurrence.generate_now',
      objectType: 'MaintenanceOccurrence',
      objectKey: id,
      newValue: { tickResult: result, workOrders: occ.work_orders.length },
    });
    void actor;
    return {
      id,
      status: occ.status,
      workOrders: occ.work_orders.map((w) => ({ id: w.id, code: w.code, status: w.status })),
      tickResult: result,
    };
  }
}
