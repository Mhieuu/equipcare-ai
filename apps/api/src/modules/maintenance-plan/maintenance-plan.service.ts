import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AppError,
  writeAudit,
  toDateOnly,
  runSchedulerTick,
  type SchedulerTickResult,
} from '@equipcare/backend-core';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateMaintenancePlanDto,
  UpdateMaintenancePlanDto,
  ListMaintenancePlansQueryDto,
} from './dto/maintenance-plan.dto';

/**
 * MaintenancePlanService - M8 (Doc04 section 5.10).
 *
 * CRUD plan (asset_id + interval + start_on -> next_due_on),
 * pause/resume (set is_active=false/true),
 * list occurrences.
 *
 * Scheduler tick (runSchedulerTick) shared voi worker (qua backend-core).
 * Test endpoint `POST /maintenance-plans/tick` goi tick thu cong.
 */
@Injectable()
export class MaintenancePlanService {
  private readonly logger = new Logger(MaintenancePlanService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async create(actorId: string, dto: CreateMaintenancePlanDto) {
    const asset = await this.prisma.assets.findUnique({ where: { id: dto.assetId } });
    if (!asset) throw AppError.notFound('Khong tim thay tai san', { assetId: dto.assetId });

    const created = await this.prisma.maintenance_plans.create({
      data: {
        asset_id: dto.assetId,
        name: dto.name,
        interval_unit: dto.intervalUnit,
        interval_value: dto.intervalValue,
        start_on: new Date(dto.startOn),
        next_due_on: new Date(dto.startOn),
        schedule_basis: dto.scheduleBasis ?? 'FIXED',
        checklist: (dto.checklist ?? []) as Prisma.InputJsonValue,
        created_by: actorId,
      },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'maintenance_plan.create',
      objectType: 'MaintenancePlan',
      objectKey: created.id,
      newValue: {
        assetId: dto.assetId,
        name: dto.name,
        interval: dto.intervalValue,
        unit: dto.intervalUnit,
      },
    });
    return this.toDto(created);
  }

  async list(query: ListMaintenancePlansQueryDto) {
    const where: Prisma.maintenance_plansWhereInput = {};
    if (query.assetId) where.asset_id = query.assetId;
    if (query.isActive === 'true') where.is_active = true;
    if (query.isActive === 'false') where.is_active = false;
    const items = await this.prisma.maintenance_plans.findMany({
      where,
      orderBy: [{ next_due_on: 'asc' }],
      take: 200,
    });
    return { items: items.map((p) => this.toDto(p)), total: items.length };
  }

  async get(id: string) {
    const p = await this.prisma.maintenance_plans.findUnique({ where: { id } });
    if (!p) throw AppError.notFound('Khong tim thay ke hoach', { id });
    return this.toDto(p);
  }

  async update(actorId: string, id: string, dto: UpdateMaintenancePlanDto) {
    const p = await this.prisma.maintenance_plans.findUnique({ where: { id } });
    if (!p) throw AppError.notFound('Khong tim thay ke hoach', { id });
    if (dto.rowVersion !== undefined && Number(dto.rowVersion) !== p.row_version) {
      throw AppError.conflict(
        'Plan da duoc cap nhat boi nguoi khac',
        { currentVersion: p.row_version, providedVersion: Number(dto.rowVersion) },
      );
    }
    const patch: Prisma.maintenance_plansUpdateInput = { row_version: { increment: 1 } };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.intervalUnit !== undefined) patch.interval_unit = dto.intervalUnit;
    if (dto.intervalValue !== undefined) patch.interval_value = dto.intervalValue;
    if (dto.checklist !== undefined) patch.checklist = dto.checklist as Prisma.InputJsonValue;
    if (dto.isActive !== undefined) patch.is_active = dto.isActive;

    const updated = await this.prisma.maintenance_plans.update({
      where: { id, row_version: p.row_version },
      data: patch,
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'maintenance_plan.update',
      objectType: 'MaintenancePlan',
      objectKey: id,
      newValue: { name: dto.name, isActive: dto.isActive, intervalValue: dto.intervalValue },
    });
    return this.toDto(updated);
  }

  // ---------------------------------------------------------------------------
  // Pause / Resume
  // ---------------------------------------------------------------------------

  async pause(actorId: string, id: string, reason?: string) {
    const p = await this.prisma.maintenance_plans.findUnique({ where: { id } });
    if (!p) throw AppError.notFound('Khong tim thay ke hoach', { id });
    if (!p.is_active) return this.toDto(p);

    const updated = await this.prisma.maintenance_plans.update({
      where: { id, row_version: p.row_version },
      data: { is_active: false, row_version: { increment: 1 } },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'maintenance_plan.pause',
      objectType: 'MaintenancePlan',
      objectKey: id,
      newValue: { reason: reason ?? null },
    });
    return this.toDto(updated);
  }

  async resume(actorId: string, id: string) {
    const p = await this.prisma.maintenance_plans.findUnique({ where: { id } });
    if (!p) throw AppError.notFound('Khong tim thay ke hoach', { id });
    if (p.is_active) return this.toDto(p);

    const updated = await this.prisma.maintenance_plans.update({
      where: { id, row_version: p.row_version },
      data: { is_active: true, row_version: { increment: 1 } },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'maintenance_plan.resume',
      objectType: 'MaintenancePlan',
      objectKey: id,
    });
    return this.toDto(updated);
  }

  // ---------------------------------------------------------------------------
  // Occurrences + Scheduler tick
  // ---------------------------------------------------------------------------

  async listOccurrences(planId: string) {
    const items = await this.prisma.maintenance_occurrences.findMany({
      where: { plan_id: planId },
      orderBy: [{ due_on: 'asc' }],
    });
    return items.map((o) => this.occurrenceToDto(o));
  }

  /** Wrapper goi backend-core runSchedulerTick (chia se voi worker). */
  async runSchedulerTick(): Promise<SchedulerTickResult> {
    return runSchedulerTick(this.prisma as unknown as import('@prisma/client').PrismaClient);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDto(p: any) {
    return {
      id: p.id,
      assetId: p.asset_id,
      name: p.name,
      intervalUnit: p.interval_unit,
      intervalValue: p.interval_value,
      startOn: p.start_on instanceof Date ? toDateOnly(p.start_on) : p.start_on,
      nextDueOn: p.next_due_on instanceof Date ? toDateOnly(p.next_due_on) : p.next_due_on,
      scheduleBasis: p.schedule_basis,
      checklist: p.checklist ?? [],
      isActive: p.is_active,
      rowVersion: p.row_version,
      createdAt: p.created_at instanceof Date ? p.created_at.toISOString() : p.created_at,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private occurrenceToDto(o: any) {
    return {
      id: o.id,
      planId: o.plan_id,
      assetId: o.asset_id,
      dueOn: o.due_on instanceof Date ? toDateOnly(o.due_on) : o.due_on,
      status: o.status,
      planVersion: o.plan_version,
      createdAt: o.created_at instanceof Date ? o.created_at.toISOString() : o.created_at,
    };
  }
}

// Re-export internal helper de worker su dung chung
export {};
