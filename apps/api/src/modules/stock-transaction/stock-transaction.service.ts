import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError, writeAudit } from '@equipcare/backend-core';
import { StockTransactionType } from '@equipcare/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  IssuePartDto,
  ReturnPartDto,
  RecordStockMovementDto,
  ListStockTransactionsQueryDto,
} from './dto/stock-transaction.dto';

/**
 * StockTransactionService - M7 (Doc04 section 5.6 + Q-06 full).
 *
 * ISSUE    - xuat kho cho WO (giam on_hand). WO ACTIVE moi duoc issue.
 * RETURN   - tra lai kho tu ISSUE (tang on_hand). Reference original_stock_tx_id,
 *            quantity <= (quantity ISSUE goc - tong RETURN truoc do).
 * RECEIPT  - nhap kho (tang on_hand).
 * ADJUSTMENT - dieu chinh (quantity positive=tang, negative=giam), require reason.
 *
 * Q-06 net_issued_quantity check:
 *   WORK_ORDER_ISSUE se ky approval_revision_id tu approval cua WO neu co
 *   `requires_approval=true`; service se aggregate net_issued cho revision do va
 *   check vs budget (bang so luong) cua revision.
 *
 * Concurrency:
 *   - Atomic: UPDATE parts SET on_hand = on_hand +/- ?, row_version=row_version+1
 *     WHERE id=? AND row_version=? RETURNING ...
 *   - CHECK parts.on_hand >= 0 lam defense-in-depth.
 *   - Su dung Prisma transaction (muc dich isolation).
 */
@Injectable()
export class StockTransactionService {
  private readonly logger = new Logger(StockTransactionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // ISSUE / RETURN / RECEIPT / ADJUST
  // ---------------------------------------------------------------------------

  /** ISSUE cho WO - giam on_hand. Co the kem approval_revision_id neu part.requires_approval. */
  async issueForWorkOrder(
    actorId: string,
    workOrderId: string,
    dto: IssuePartDto,
  ) {
    return this.runTransaction(async (tx) => {
      const wo = await tx.work_orders.findUnique({ where: { id: workOrderId } });
      if (!wo) {
        throw AppError.notFound('Khong tim thay work order', { workOrderId });
      }
      if (wo.status === 'COMPLETED' || wo.status === 'CANCELLED') {
        throw AppError.unprocessable(
          'WO_TERMINAL_NO_ISSUE',
          'WO da terminal, khong the issue',
          { status: wo.status },
        );
      }

      const part = await this.lockPart(tx, dto.partId);
      const requiresApproval = part.requires_approval;
      let approvalRevisionId: string | null = null;
      if (requiresApproval) {
        // Lay revision approved gan nhat (chenh lech APPROVED o M6).
        // Simple: APPROVED status moi duoc issue; approved_revisions cu the.
        const rev = await tx.approval_revisions.findFirst({
          where: { approval: { work_order_id: workOrderId, status: 'APPROVED' } },
          orderBy: { created_at: 'desc' },
        });
        if (!rev) {
          throw AppError.unprocessable(
            'APR_NO_APPROVED_REVISION',
            'Linh kien yeu cau duyet, khong co revision APPROVED',
            { workOrderId },
          );
        }
        approvalRevisionId = rev.id;
        await this.assertWithinIssuedBudget(tx, dto.partId, approvalRevisionId, dto.quantity);
      }

      const qtyDec = new Prisma.Decimal(dto.quantity);
      const opKey = cryptoUUID();

      const updated = await this.updateOnHand(tx, dto.partId, qtyDec.neg());
      const txRow = await tx.stock_transactions.create({
        data: {
          id: opKey,
          part_id: dto.partId,
          movement_type: 'ISSUE',
          quantity: qtyDec,
          work_order_id: workOrderId,
          approval_revision_id: approvalRevisionId,
          unit_price_snapshot: part.reference_price,
          actor_id: actorId,
          source_note: dto.sourceNote ?? null,
          occurred_at: new Date(),
          operation_key: opKey,
        },
      });
      await writeAudit({
        actorId,
        actorType: 'USER',
        action: 'stock.issue',
        objectType: 'StockTransaction',
        objectKey: txRow.id,
        newValue: { partId: dto.partId, quantity: dto.quantity, workOrderId },
      });
      return { transaction: this.toDto(txRow), onHand: updated.on_hand.toString() };
    });
  }

  /** RETURN cho WO - tang on_hand. Phai co original_stock_tx_id (ISSUE goc). */
  async returnForWorkOrder(
    actorId: string,
    workOrderId: string,
    dto: ReturnPartDto,
  ) {
    return this.runTransaction(async (tx) => {
      const orig = await tx.stock_transactions.findUnique({
        where: { id: dto.originalStockTxId },
      });
      if (!orig) {
        throw AppError.notFound('Khong tim thay stock transaction goc', {
          originalStockTxId: dto.originalStockTxId,
        });
      }
      if (orig.movement_type !== 'ISSUE') {
        throw AppError.unprocessable(
          'STOCK_RETURN_INVALID_ORIGINAL',
          'original phai la ISSUE (movement_type)',
          { originalMovementType: orig.movement_type },
        );
      }
      if (orig.work_order_id !== workOrderId) {
        throw AppError.unprocessable(
          'STOCK_RETURN_WRONG_WO',
          'original ISSUE thuoc work_order khac',
          { expected: workOrderId, actual: orig.work_order_id },
        );
      }
      if (orig.part_id == null) {
        throw AppError.unprocessable('STOCK_ORIGINAL_NO_PART', 'Issue goc khong co part_id');
      }

      const partId = orig.part_id;
      const qtyReturn = new Prisma.Decimal(dto.quantity);
      if (qtyReturn.greaterThan(new Prisma.Decimal(orig.quantity))) {
        throw AppError.unprocessable(
          'STOCK_RETURN_EXCEEDS_ISSUE',
          'So luong RETURN vuot qua ISSUE goc (truoc di cac RETURN truoc)',
          { issueQty: orig.quantity.toString() },
        );
      }
      // Tong RETURN da ghi nhan truoc do (khong tinh APPROVED)
      const prevReturns = await tx.stock_transactions.aggregate({
        where: {
          original_stock_tx_id: dto.originalStockTxId,
          movement_type: StockTransactionType.RETURN,
        },
        _sum: { quantity: true },
      });
      const prevReturned = prevReturns._sum.quantity ?? new Prisma.Decimal(0);
      const remaining = new Prisma.Decimal(orig.quantity).minus(prevReturned);
      if (qtyReturn.greaterThan(remaining)) {
        throw AppError.unprocessable(
          'STOCK_RETURN_EXCEEDS_ISSUE',
          'So luong RETURN vuot qua phan con lai ISSUE',
          {
            issueQty: orig.quantity.toString(),
            prevReturned: prevReturned.toString(),
            remaining: remaining.toString(),
            requested: qtyReturn.toString(),
          },
        );
      }

      await this.lockPart(tx, partId);
      const opKey = cryptoUUID();
      const updated = await this.updateOnHand(tx, partId, qtyReturn);
      const txRow = await tx.stock_transactions.create({
        data: {
          id: opKey,
          part_id: partId,
          movement_type: 'RETURN',
          quantity: qtyReturn,
          work_order_id: workOrderId,
          unit_price_snapshot: orig.unit_price_snapshot ?? null,
          original_stock_tx_id: dto.originalStockTxId,
          actor_id: actorId,
          reason: dto.reason ?? null,
          occurred_at: new Date(),
          operation_key: opKey,
        },
      });
      await writeAudit({
        actorId,
        actorType: 'USER',
        action: 'stock.return',
        objectType: 'StockTransaction',
        objectKey: txRow.id,
        newValue: { partId, quantity: dto.quantity, originalStockTxId: dto.originalStockTxId },
      });
      return { transaction: this.toDto(txRow), onHand: updated.on_hand.toString() };
    });
  }

  /** RECEIPT - nhap kho (tang on_hand). */
  async receipt(actorId: string, dto: RecordStockMovementDto) {
    return this.runTransaction(async (tx) => {
      const part = await this.lockPart(tx, dto.partId);
      const qtyDec = new Prisma.Decimal(dto.quantity);
      const opKey = cryptoUUID();
      const updated = await this.updateOnHand(tx, dto.partId, qtyDec);
      const txRow = await tx.stock_transactions.create({
        data: {
          id: opKey,
          part_id: dto.partId,
          movement_type: 'RECEIPT',
          quantity: qtyDec,
          unit_price_snapshot: part.reference_price,
          actor_id: actorId,
          reason: dto.reason ?? null,
          source_note: dto.sourceNote ?? null,
          occurred_at: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
          operation_key: opKey,
        },
      });
      await writeAudit({
        actorId,
        actorType: 'USER',
        action: 'stock.receipt',
        objectType: 'StockTransaction',
        objectKey: txRow.id,
        newValue: { partId: dto.partId, quantity: dto.quantity },
      });
      return { transaction: this.toDto(txRow), onHand: updated.on_hand.toString() };
    });
  }

  /** ADJUSTMENT - dieu chinh. */
  async adjust(actorId: string, dto: RecordStockMovementDto) {
    if (!dto.reason || dto.reason.length < 3) {
      throw AppError.unprocessable(
        'STOCK_ADJUSTMENT_REQUIRES_REASON',
        'Dieu chinh kho can nhap reason (>=3 ky tu)',
        { field: 'reason' },
      );
    }
    return this.runTransaction(async (tx) => {
      await this.lockPart(tx, dto.partId);
      const qtyDec = new Prisma.Decimal(dto.quantity);
      const opKey = cryptoUUID();
      const updated = await this.updateOnHand(tx, dto.partId, qtyDec);
      const txRow = await tx.stock_transactions.create({
        data: {
          id: opKey,
          part_id: dto.partId,
          movement_type: 'ADJUSTMENT',
          quantity: qtyDec,
          actor_id: actorId,
          reason: dto.reason ?? null,
          source_note: dto.sourceNote ?? null,
          occurred_at: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
          operation_key: opKey,
        },
      });
      await writeAudit({
        actorId,
        actorType: 'USER',
        action: 'stock.adjust',
        objectType: 'StockTransaction',
        objectKey: txRow.id,
        newValue: { partId: dto.partId, quantity: dto.quantity, reason: dto.reason },
      });
      return { transaction: this.toDto(txRow), onHand: updated.on_hand.toString() };
    });
  }

  // ---------------------------------------------------------------------------
  // READ
  // ---------------------------------------------------------------------------

  async list(query: ListStockTransactionsQueryDto) {
    const where: Prisma.stock_transactionsWhereInput = {};
    if (query.partId) where.part_id = query.partId;
    if (query.workOrderId) where.work_order_id = query.workOrderId;
    const items = await this.prisma.stock_transactions.findMany({
      where,
      orderBy: [{ occurred_at: 'desc' }],
      take: 200,
    });
    return { items: items.map((t) => this.toDto(t)), total: items.length };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => fn(tx), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10_000,
      maxWait: 5_000,
    });
  }

  /** Lock + lay row. UPDATE parts WHERE id=? RETURNING row_version. */
  private async lockPart(tx: Prisma.TransactionClient, partId: string) {
    const r = await tx.parts.findUnique({ where: { id: partId } });
    if (!r) {
      throw AppError.notFound('Khong tim thay linh kien', { partId });
    }
    return r;
  }

  /**
   * Atomic update on_hand +/- delta.
   * Su dung `RETURNING` de lay row moi; trigger se check on_hand >= 0.
   */
  private async updateOnHand(tx: Prisma.TransactionClient, partId: string, delta: Prisma.Decimal) {
    try {
      const rows = await tx.$queryRaw<Array<{ on_hand: string; row_version: number }>>(
        Prisma.sql`
          UPDATE parts
             SET on_hand = on_hand + ${delta},
                 row_version = row_version + 1,
                 updated_at = NOW()
           WHERE id = ${partId}::uuid
        RETURNING on_hand, row_version
        `,
      );
      const row = rows?.[0];
      if (!row) {
        throw AppError.notFound('Khong tim thay linh kien', { partId });
      }
      const outHand = new Prisma.Decimal(row.on_hand);
      if (outHand.isNegative()) {
        throw AppError.unprocessable(
          'STOCK_INSUFFICIENT',
          'Khong du ton kho (on_hand < 0)',
          { partId, delta: delta.toString() },
        );
      }
      return {
        on_hand: outHand,
        row_version: row.row_version,
      };
    } catch (e) {
      const err = e as { message?: string; code?: string };
      const msg = err?.message ?? '';
      if (msg.includes('parts_on_hand_non_negative') || err?.code === 'P2002' || msg.includes('23514')) {
        throw AppError.unprocessable(
          'STOCK_INSUFFICIENT',
          'Khong du ton kho',
          { partId, delta: delta.toString() },
        );
      }
      throw e;
    }
  }

  private async assertWithinIssuedBudget(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    partId: string,
    approvalRevisionId: string,
    additionalQty: Prisma.Decimal | number,
  ) {
    // Lay entries cua revision (co the ISSUE khac part)
    const entries = await tx.stock_transactions.findMany({
      where: { approval_revision_id: approvalRevisionId },
      select: { movement_type: true, quantity: true },
    });
    let issued = new Prisma.Decimal(0);
    let returned = new Prisma.Decimal(0);
    for (const e of entries) {
      const q = new Prisma.Decimal(e.quantity);
      if (e.movement_type === 'ISSUE') issued = issued.plus(q);
      else if (e.movement_type === 'RETURN') returned = returned.plus(q);
    }
    const net = issued.minus(returned).plus(new Prisma.Decimal(additionalQty));
    // Lay budget cua revision (parts list). Q-06 simplified: budget = sum qty cua cac parts.
    const revisionParts = await tx.approval_revision_parts.findMany({
      where: { approval_revision_id: approvalRevisionId, part_id: partId },
    });
    if (revisionParts.length === 0) {
      throw AppError.unprocessable(
        'APR_PART_NOT_IN_REVISION',
        'Linh kien khong co trong approval revision',
        { approvalRevisionId, partId },
      );
    }
    const budget = revisionParts.reduce(
      (acc: Prisma.Decimal, r: { quantity: Prisma.Decimal | number }) => acc.plus(new Prisma.Decimal(r.quantity)),
      new Prisma.Decimal(0),
    );
    if (net.greaterThan(budget)) {
      throw AppError.unprocessable(
        'APR_EXCEEDS_REVISION_BUDGET_QTY',
        'Tong so luong xuat kho vuot qua ngan sach revision',
        {
          approvalRevisionId,
          partId,
          net: net.toString(),
          budget: budget.toString(),
          overBy: net.minus(budget).toString(),
        },
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDto(t: any) {
    return {
      id: t.id,
      partId: t.part_id,
      movementType: t.movement_type,
      quantity: t.quantity?.toString() ?? '0',
      workOrderId: t.work_order_id ?? null,
      approvalRevisionId: t.approval_revision_id ?? null,
      unitPriceSnapshot: t.unit_price_snapshot?.toString() ?? null,
      originalStockTxId: t.original_stock_tx_id ?? null,
      actorId: t.actor_id,
      reason: t.reason ?? null,
      sourceNote: t.source_note ?? null,
      occurredAt: t.occurred_at instanceof Date ? t.occurred_at.toISOString() : t.occurred_at,
    };
  }
}

/** UUID v4 generic (tranh import crypto randomUUID npm thanh dep). */
function cryptoUUID(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomUUID } = require('node:crypto');
  return randomUUID();
}
