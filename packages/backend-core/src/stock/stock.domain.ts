import { Prisma, type stock_transactions } from '@prisma/client';
import {
  StockTransactionType,
  type StockTransactionType as Movement,
  STOCK_INBOUND,
  STOCK_OUTBOUND,
} from '@equipcare/shared';
import { AppError } from '../errors/app-error.js';

/**
 * Stock domain (Doc04 section 5.6 + Q-06 full).
 *
 * Quy uoc invariant:
 *   - parts.on_hand >= 0 (CHECK constraint 0007_inventory)
 *   - movement types ISSUE/TRANSFER_OUT: giam on_hand
 *   - movement types RETURN/RECEIPT/TRANSFER_IN: tang on_hand
 *   - ADJUSTMENT: +/- tuy theo quantity (positive=tang, negative=giam)
 *   - RETURN phai co original_stock_tx_id; qty return <= qty con lai cua ISSUE goc.
 *   - operation_key UUID UNIQUE (idempotency cho retry request).
 *
 * Q-06 net_issued_quantity aggregation (per approval_revision):
 *   net_issued_quantity(revision) =
 *     SUM(quantity WHERE movement_type='ISSUE' AND approval_revision_id=X)
 *     - SUM(quantity WHERE movement_type='RETURN' AND original_stock_tx_id IN
 *                       (SELECT id FROM stock_transactions WHERE movement_type='ISSUE' AND approval_revision_id=X))
 *
 * Q-06 check khi ISSUE moi:
 *   next_net_issued_quantity > revision_budget (qty) -> reject 422 APR_EXCEEDS_REVISION_BUDGET_QTY
 *
 * Concurrency:
 *   - Atomic: UPDATE parts SET on_hand = on_hand +/- ? WHERE id=? RETURNING on_hand.
 *   - CHECK on_hand >= 0 se block neu vi pham.
 *   - Service layer check truoc: SELECT on_hand FOR UPDATE (via Prisma transaction).
 */

export interface StockMovementCreateInput {
  partId: string;
  movementType: Movement;
  quantity: Prisma.Decimal | number; // positive
  workOrderId?: string | null;
  approvalRevisionId?: string | null;
  unitPriceSnapshot?: Prisma.Decimal | number | null;
  originalStockTxId?: string | null; // RETURN: tham chieu ISSUE goc
  actorId: string;
  reason?: string | null;
  sourceNote?: string | null;
  occurredAt?: Date;
}

export interface NetIssuedBreakdown {
  totalIssued: Prisma.Decimal;
  totalReturned: Prisma.Decimal;
  netIssued: Prisma.Decimal;
}

/**
 * Tinh net_issued_quantity tu list stock_transactions cua 1 approval_revision.
 * ISSUE cong vao, RETURN (co original_stock_tx_id cung approval_revision_id) tru ra.
 */
export function computeNetIssued(
  entries: Array<{
    movement_type: string;
    quantity: Prisma.Decimal | number;
  }>,
): NetIssuedBreakdown {
  let issued = new Prisma.Decimal(0);
  let returned = new Prisma.Decimal(0);
  for (const e of entries) {
    const qty = new Prisma.Decimal(e.quantity);
    if (e.movement_type === 'ISSUE') issued = issued.plus(qty);
    else if (e.movement_type === 'RETURN') returned = returned.plus(qty);
  }
  return { totalIssued: issued, totalReturned: returned, netIssued: issued.minus(returned) };
}

/** Q-06 check net_issued_quantity khong vuot budget. */
export function checkNetIssuedAgainstBudget(
  nextNetIssued: Prisma.Decimal | number,
  budget: Prisma.Decimal | number | null | undefined,
): void {
  if (budget == null) return;
  const next = new Prisma.Decimal(nextNetIssued);
  const b = new Prisma.Decimal(budget);
  if (next.greaterThan(b)) {
    throw AppError.unprocessable(
      'APR_EXCEEDS_REVISION_BUDGET_QTY',
      'Tong so luong xuat kho vuot qua ngan sach phan bo',
      {
        netIssued: next.toString(),
        budget: b.toString(),
        overBy: next.minus(b).toString(),
      },
    );
  }
}

/** Movement co tang on_hand (+). */
export function isInbound(movement: Movement): boolean {
  return STOCK_INBOUND.includes(movement);
}

/** Movement co giam on_hand (-). */
export function isOutbound(movement: Movement): boolean {
  return STOCK_OUTBOUND.includes(movement);
}

/** Sign: +1 inbound, -1 outbound, ADJUSTMENT tuy theo quantity sign. */
export function movementSign(
  movement: Movement,
  quantity: Prisma.Decimal | number,
): number {
  if (movement === StockTransactionType.ADJUSTMENT) {
    return new Prisma.Decimal(quantity).isNegative() ? -1 : 1;
  }
  return isInbound(movement) ? 1 : -1;
}

/** Validate RETURN phai co original_stock_tx_id. */
export function assertReturnHasOriginal(
  movement: Movement,
  originalStockTxId: string | null | undefined,
): void {
  if (movement === StockTransactionType.RETURN && !originalStockTxId) {
    throw AppError.unprocessable(
      'STOCK_RETURN_REQUIRES_ORIGINAL',
      'RETURN phai tham chieu original_stock_tx_id (Issue goc)',
      { field: 'originalStockTxId' },
    );
  }
}

/** Lay issue goc (khi RETURN). Service tra ve null neu khong ton tai. */
export async function findOriginalIssue(
  prisma: { stock_transactions: { findUnique: (args: { where: { id: string } }) => Promise<stock_transactions | null> } },
  originalStockTxId: string,
) {
  const tx = await prisma.stock_transactions.findUnique({
    where: { id: originalStockTxId },
  });
  if (!tx) {
    throw AppError.notFound('Khong tim thay stock transaction goc', {
      originalStockTxId,
    });
  }
  if (tx.movement_type !== 'ISSUE') {
    throw AppError.unprocessable(
      'STOCK_RETURN_INVALID_ORIGINAL',
      'original_stock_tx_id phai la ISSUE (movement_type)',
      { originalMovementType: tx.movement_type },
    );
  }
  if (tx.part_id == null) {
    // Khong the xay ra (part_id NOT NULL) nhung safety guard
    throw AppError.unprocessable(
      'STOCK_ORIGINAL_NO_PART',
      'Stock transaction goc khong co part_id',
    );
  }
  return tx;
}

/**
 * Tinh tong RETURN con lai cua ISSUE goc (cho validation RETURN khong vuot).
 */
export async function sumReturnsForIssue(
  prisma: { stock_transactions: { aggregate: (args: { where: { original_stock_tx_id: string; movement_type: Movement }; _sum: { quantity: true } }) => Promise<{ _sum: { quantity: Prisma.Decimal | null } }> } },
  originalIssueId: string,
): Promise<Prisma.Decimal> {
  const r = await prisma.stock_transactions.aggregate({
    where: { original_stock_tx_id: originalIssueId, movement_type: StockTransactionType.RETURN },
    _sum: { quantity: true },
  });
  return r._sum.quantity ?? new Prisma.Decimal(0);
}
