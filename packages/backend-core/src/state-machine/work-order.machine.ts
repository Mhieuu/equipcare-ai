import { WorkOrderStatus, type WorkOrderStatus as WOStatus } from '@equipcare/shared';
import { AppError } from '../errors/app-error.js';

/**
 * Work Order state machine (Doc04 section 3.2).
 *
 * Status enum: NEW | ASSIGNED | IN_PROGRESS | COMPLETED | CANCELLED.
 * PAUSED khong co trong enum (Doc04 Q-04) - pause/resume chi la note event.
 * WAITING_APPROVAL se duoc them o M6 (qua PATCH rieng, khong qua transition).
 *
 * Allowed transitions:
 *   NEW         -> ASSIGNED | CANCELLED
 *   ASSIGNED    -> IN_PROGRESS | CANCELLED
 *   IN_PROGRESS -> COMPLETED | CANCELLED
 *   COMPLETED, CANCELLED -> terminal
 *
 * Luu y:
 *   - IN_PROGRESS -> IN_PROGRESS khong qua transition (chi qua API notes).
 *   - Cancel can ly do (Doc02 section FR-WO-09).
 */
const TRANSITIONS: Record<WOStatus, WOStatus[]> = {
  [WorkOrderStatus.NEW]: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.ASSIGNED]: [
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.IN_PROGRESS]: [
    WorkOrderStatus.COMPLETED,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.COMPLETED]: [],
  [WorkOrderStatus.CANCELLED]: [],
};

export function canTransitionWorkOrder(from: WOStatus, to: WOStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertWorkOrderTransition(from: WOStatus, to: WOStatus): void {
  if (!canTransitionWorkOrder(from, to)) {
    throw AppError.unprocessable(
      'WO_INVALID_TRANSITION',
      'Khong the chuyen Work Order tu ' + from + ' sang ' + to,
      { from, to },
    );
  }
}

/** Ly do cancel Work Order (Doc02 section FR-WO-09) - bat buoc. */
export function assertWorkOrderCancelReason(reason: string | undefined): string {
  if (!reason || reason.trim().length === 0) {
    throw AppError.unprocessable(
      'WO_CANCEL_REQUIRES_REASON',
      'Can nhap ly do khi huy Work Order',
      { field: 'reason' },
    );
  }
  return reason.trim();
}

/** Side-effect: set timestamps khi vao IN_PROGRESS. */
export function markStarted(): { started_at: Date } {
  return { started_at: new Date() };
}

/** Side-effect: set timestamps khi vao COMPLETED. */
export function markCompleted(): { completed_at: Date } {
  return { completed_at: new Date() };
}

/** Side-effect: set timestamps khi vao CANCELLED. */
export function markCancelled(actorId: string, reason: string) {
  return {
    cancelled_at: new Date(),
    cancelled_by: actorId,
    cancel_reason: reason,
  };
}
