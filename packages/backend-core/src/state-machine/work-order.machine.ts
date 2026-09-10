import { WorkOrderStatus, type WorkOrderStatus as WOStatus } from '@equipcare/shared';
import { AppError } from '../errors/app-error.js';

/**
 * Work Order state machine (Doc04 enum — không PAUSED/RESUMED).
 *
 * Allowed transitions:
 *   NEW          → ASSIGNED | CANCELLED
 *   ASSIGNED     → IN_PROGRESS | CANCELLED
 *   IN_PROGRESS  → WAITING_APPROVAL | COMPLETED | CANCELLED
 *   WAITING_APPROVAL → IN_PROGRESS | COMPLETED | CANCELLED
 *   COMPLETED, CANCELLED → terminal
 *
 * PAUSE / RESUME không thay đổi status; chỉ ghi event vào work_order_status_history.
 */
const TRANSITIONS: Record<WOStatus, WOStatus[]> = {
  [WorkOrderStatus.NEW]: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.ASSIGNED]: [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.IN_PROGRESS]: [
    WorkOrderStatus.WAITING_APPROVAL,
    WorkOrderStatus.COMPLETED,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.WAITING_APPROVAL]: [
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.COMPLETED,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.COMPLETED]: [],
  [WorkOrderStatus.CANCELLED]: [],
};

export function canTransition(from: WOStatus, to: WOStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: WOStatus, to: WOStatus): void {
  if (!canTransition(from, to)) {
    throw AppError.unprocessable(
      'WO_INVALID_TRANSITION',
      `Không thể chuyển Work Order từ ${from} sang ${to}`,
      { from, to },
    );
  }
}
