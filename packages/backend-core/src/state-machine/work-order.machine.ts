import { WorkOrderStatus, type WorkOrderStatus as WOStatus } from '@equipcare/shared';
import { AppError } from '../errors/app-error.js';

/**
 * Work Order state machine (Doc04 section 3.2 + M6 bo sung WAITING_APPROVAL).
 *
 * Status enum:
 *   NEW | ASSIGNED | IN_PROGRESS | WAITING_APPROVAL | COMPLETED | CANCELLED.
 *
 * Allowed transitions:
 *   NEW               -> ASSIGNED | CANCELLED
 *   ASSIGNED          -> IN_PROGRESS | CANCELLED
 *   IN_PROGRESS       -> WAITING_APPROVAL | COMPLETED | CANCELLED
 *   WAITING_APPROVAL  -> IN_PROGRESS | COMPLETED | CANCELLED
 *   COMPLETED, CANCELLED -> terminal
 *
 * PAUSED khong co trong enum (Doc04 Q-04) - pause/resume chi la note event.
 * WAITING_APPROVAL: vao qua approval.submit (M6) - service layer approval.service tu dong
 * set WAITING_APPROVAL_START note + doi WO.status. User PATCH /transition cung co the
 * set IN_PROGRESS -> WAITING_APPROVAL neu muon; nhung service khuyen khich dung submit.
 */
const TRANSITIONS: Record<WOStatus, WOStatus[]> = {
  [WorkOrderStatus.NEW]: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.ASSIGNED]: [
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.CANCELLED,
  ],
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
