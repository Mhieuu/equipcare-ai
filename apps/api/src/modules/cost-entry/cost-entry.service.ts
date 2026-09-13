import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type cost_entries } from '@prisma/client';
import {
  AppError,
  assertCostCategory,
  summarizeNetCost,
  checkNetCostAgainstRevision,
  writeAudit,
} from '@equipcare/backend-core';
import { CostDirection } from '@equipcare/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateCostEntryDto } from './dto/cost-entry.dto';

/**
 * CostEntryService - M6 (Doc04 section 5.6).
 *
 * - Tao cost_entries (PART/LABOR/OTHER, DEBIT/CREDIT).
 * - Q-06 (M6 partial): check net_cost <= approved budget neu approval_revision_id
 *   thuoc revision APPROVED.
 * - Permission: do controller ap @Permissions(COST_CREATE).
 */
@Injectable()
export class CostEntryService {
  private readonly logger = new Logger(CostEntryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /work-orders/:id/cost-entries
   * - category PART: yeu cau approval_revision_id neu WO dang o WAITING_APPROVAL.
   * - net_cost check neu APPROVED revision.
   */
  async create(
    actorId: string,
    workOrderId: string,
    dto: CreateCostEntryDto,
  ): Promise<cost_entries> {
    const category = assertCostCategory(dto.category);
    const direction = dto.direction ?? CostDirection.DEBIT;

    const wo = await this.prisma.work_orders.findUnique({
      where: { id: workOrderId },
      include: {
        cost_entries: true,
      },
    });
    if (!wo) {
      throw AppError.notFound('Khong tim thay Work Order', { workOrderId });
    }

    // Q-06 net_cost check neu co approval_revision_id thuoc revision APPROVED.
    let revisionBudget: Prisma.Decimal | null = null;
    if (dto.approvalRevisionId) {
      const revision = await this.prisma.approval_revisions.findUnique({
        where: { id: dto.approvalRevisionId },
        include: { approval: { select: { status: true } } },
      });
      if (!revision) {
        throw AppError.notFound('Khong tim thay approval revision', {
          approvalRevisionId: dto.approvalRevisionId,
        });
      }
      if (
        revision.approval.status !== 'APPROVED' &&
        revision.approval.status !== 'SUBMITTED'
      ) {
        throw AppError.unprocessable(
          'COST_REVISION_NOT_APPROVED',
          'Chi ghi cost vao revision SUBMITTED hoac APPROVED',
          { approvalStatus: revision.approval.status },
        );
      }
      revisionBudget = revision.other_estimated_cost;
    }

    // Tinh net_cost hien tai + entry moi.
    const existingSummary = summarizeNetCost(
      wo.cost_entries.map((e) => ({
        category: e.category,
        direction: e.direction,
        quantity: e.quantity,
        unit_price: e.unit_price,
      })),
    );

    const newQty = new Prisma.Decimal(dto.quantity);
    const newPrice = new Prisma.Decimal(dto.unitPrice);
    const newAmount = newQty.times(newPrice);

    let nextTotal: Prisma.Decimal;
    if (direction === CostDirection.CREDIT) {
      // credit giam total
      nextTotal = existingSummary.total.minus(newAmount);
    } else {
      nextTotal = existingSummary.total.plus(newAmount);
    }

    if (revisionBudget != null) {
      checkNetCostAgainstRevision(nextTotal, revisionBudget);
    }

    const created = await this.prisma.cost_entries.create({
      data: {
        work_order_id: workOrderId,
        category,
        direction,
        quantity: newQty,
        unit_price: newPrice,
        approval_revision_id: dto.approvalRevisionId ?? null,
        description: dto.description,
        recorded_by: actorId,
        occurred_at: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        operation_key: crypto.randomUUID(),
      },
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'cost_entry.create',
      objectType: 'CostEntry',
      objectKey: created.id,
      correlationKey: workOrderId,
      newValue: {
        category,
        direction,
        quantity: String(newQty),
        unitPrice: String(newPrice),
        approvalRevisionId: dto.approvalRevisionId ?? null,
      },
    });

    return created;
  }

  async listByWorkOrder(workOrderId: string) {
    const wo = await this.prisma.work_orders.findUnique({
      where: { id: workOrderId },
      select: { id: true },
    });
    if (!wo) {
      throw AppError.notFound('Khong tim thay Work Order', { workOrderId });
    }
    const items = await this.prisma.cost_entries.findMany({
      where: { work_order_id: workOrderId },
      orderBy: { occurred_at: 'desc' },
      include: {
        recorded_by_user: {
          select: { id: true, login_name: true, full_name: true },
        },
      },
    });

    const summary = summarizeNetCost(
      items.map((e) => ({
        category: e.category,
        direction: e.direction,
        quantity: e.quantity,
        unit_price: e.unit_price,
      })),
    );

    return {
      items: items.map((e) => ({
        id: e.id,
        category: e.category,
        direction: e.direction,
        quantity: e.quantity.toString(),
        unitPrice: e.unit_price.toString(),
        description: e.description,
        occurredAt: e.occurred_at.toISOString(),
        approvalRevisionId: e.approval_revision_id,
        recordedBy: e.recorded_by_user,
        createdAt: e.created_at.toISOString(),
      })),
      summary: {
        partDebit: summary.partDebit.toString(),
        laborDebit: summary.laborDebit.toString(),
        otherDebit: summary.otherDebit.toString(),
        credit: summary.credit.toString(),
        netCost: summary.total.toString(),
      },
    };
  }
}
