import { Prisma } from '@prisma/client';
import {
  CostCategory,
  type CostCategory as Cat,
} from '@equipcare/shared';
import { AppError } from '../errors/app-error.js';

/**
 * Cost domain (Doc04 section 5.6 + Q-06 net_cost aggregation).
 *
 * net_cost(WO, approvalRevision?) =
 *   SUM(cost_entries.debit WHERE category='PART' AND approval_revision_id = X)
 *   + SUM(cost_entries.debit WHERE category IN ('LABOR','OTHER'))
 *   - SUM(cost_entries.credit (returns) AND category = ...)
 *
 * Q-06 (deferred M7):
 *   net_issued_quantity: sum(stock_transactions.quantity) movement_type='ISSUE'
 *                        - RETURN (for same approval_revision_id) >= 0
 *   Q-06 (M6 only net_cost):
 *   net_cost must be computed BEFORE applying new cost entry.
 *   If new entry WOULD exceed approved_revision.other_estimated_cost -> reject 422.
 *
 * Money types: Decimal(18,2) for unit_price; Decimal(18,3) for quantity.
 * All aggregation dùng Prisma Decimal / BigInt via sql.
 *
 * NOTE: M6 chua co parts table (M7), nen net_issued_quantity luon = 0.
 *       Chi check net_cost (Doc04 + Q-06).
 */

export interface CostEntryCreateInput {
  workOrderId: string;
  category: Cat;
  direction: 'DEBIT' | 'CREDIT';
  quantity: Prisma.Decimal | number;
  unitPrice: Prisma.Decimal | number;
  approvalRevisionId?: string | null;
  description: string;
  recordedBy: string;
  occurredAt: Date;
}

export interface NetCostBreakdown {
  /** Sum debit PART cost (theo approval revision cu the neu co). */
  partDebit: Prisma.Decimal;
  /** Sum debit LABOR cost (M6: khong gan revision — chi tính cho WO-level). */
  laborDebit: Prisma.Decimal;
  /** Sum debit OTHER cost. */
  otherDebit: Prisma.Decimal;
  /** Sum credit (returns). */
  credit: Prisma.Decimal;
  /** net_cost = part + labor + other - credit. */
  total: Prisma.Decimal;
}

/**
 * Q-06 net_cost check (M6).
 * Neu cost entry moi (DEBIT) lam cho revision.other_estimated_cost bi vuot ->
 * reject 422 APR_EXCEEDS_REVISION_BUDGET.
 */
export function checkNetCostAgainstRevision(
  nextNetCost: Prisma.Decimal | number,
  approvedBudget: Prisma.Decimal | number | null | undefined,
): void {
  if (approvedBudget == null) return; // Khong co budget -> khong check
  const next = new Prisma.Decimal(nextNetCost);
  const budget = new Prisma.Decimal(approvedBudget);
  if (next.greaterThan(budget)) {
    throw AppError.unprocessable(
      'APR_EXCEEDS_REVISION_BUDGET',
      'Tong chi phi vuot qua ngan sach phan bo',
      {
        netCost: next.toString(),
        approvedBudget: budget.toString(),
        overBy: next.minus(budget).toString(),
      },
    );
  }
}

/** Validate category (database CHECK); chu yeu de base service. */
export function assertCostCategory(category: string): Cat {
  if (!Object.values(CostCategory).includes(category as Cat)) {
    throw AppError.unprocessable(
      'COST_INVALID_CATEGORY',
      'Cost category khong hop le: ' + category,
      { category },
    );
  }
  return category as Cat;
}

/** Tinh net_cost tu list cost_entries (approval_revision_id co the null). */
export function summarizeNetCost(entries: Array<{
  category: string;
  direction: string;
  quantity: Prisma.Decimal | number;
  unit_price: Prisma.Decimal | number;
}>): NetCostBreakdown {
  let partDebit = new Prisma.Decimal(0);
  let laborDebit = new Prisma.Decimal(0);
  let otherDebit = new Prisma.Decimal(0);
  let credit = new Prisma.Decimal(0);
  for (const e of entries) {
    const qty = new Prisma.Decimal(e.quantity);
    const price = new Prisma.Decimal(e.unit_price);
    const amt = qty.times(price);
    if (e.direction === 'CREDIT') {
      credit = credit.plus(amt);
    } else {
      if (e.category === 'PART') partDebit = partDebit.plus(amt);
      else if (e.category === 'LABOR') laborDebit = laborDebit.plus(amt);
      else if (e.category === 'OTHER') otherDebit = otherDebit.plus(amt);
    }
  }
  const total = partDebit
    .plus(laborDebit)
    .plus(otherDebit)
    .minus(credit);
  return { partDebit, laborDebit, otherDebit, credit, total };
}
