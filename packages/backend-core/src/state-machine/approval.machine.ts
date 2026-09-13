import {
  ApprovalStatus,
  type ApprovalStatus as Status,
} from '@equipcare/shared';
import { AppError } from '../errors/app-error.js';

/**
 * Approval state machine (Doc04 section 5.7).
 *
 * Lifecycle (proposer-driven):
 *   DRAFT            -> SUBMITTED          (submit)
 *   DRAFT            -> CANCELLED          (cancel tu draft)
 *   SUBMITTED        -> INFO_REQUESTED     (reviewer yeu cau them thong tin)
 *   SUBMITTED        -> APPROVED           (reviewer duyet)
 *   SUBMITTED        -> REJECTED           (reviewer tu choi)
 *   INFO_REQUESTED   -> DRAFT              (proposer chinh sua thanh revision moi)
 *   INFO_REQUESTED   -> CANCELLED          (proposer rut)
 *   REJECTED         -> DRAFT              (proposer mo revision moi)
 *   APPROVED, CANCELLED -> terminal
 *
 * Self-approval (FR-APR-09): DB trigger (0006_cost_approval) chan approval_event
 * type='APPROVED' khi actor_id == approval.proposer_id.
 *
 * Quy uoc service layer:
 *   - submit(): DRAFT or INFO_REQUESTED -> SUBMITTED (tao revision moi + event SUBMITTED)
 *   - requestInfo(): SUBMITTED -> INFO_REQUESTED
 *   - approve(): SUBMITTED -> APPROVED (cho IN_PROGRESS WO tro lai)
 *   - reject(): SUBMITTED -> REJECTED
 *   - cancel(): SUBMITTED | INFO_REQUESTED -> CANCELLED
 *   - createNewRevision(): APPROVED | REJECTED | INFO_REQUESTED -> DRAFT (revision moi)
 */

const TRANSITIONS: Record<Status, Status[]> = {
  [ApprovalStatus.DRAFT]: [
    ApprovalStatus.SUBMITTED,
    ApprovalStatus.CANCELLED,
  ],
  [ApprovalStatus.SUBMITTED]: [
    ApprovalStatus.APPROVED,
    ApprovalStatus.REJECTED,
    ApprovalStatus.INFO_REQUESTED,
    ApprovalStatus.CANCELLED,
  ],
  [ApprovalStatus.INFO_REQUESTED]: [
    ApprovalStatus.DRAFT, // proposer chinh sua -> revision moi
    ApprovalStatus.CANCELLED,
  ],
  [ApprovalStatus.APPROVED]: [
    ApprovalStatus.DRAFT, // proposer mo revision moi (hap dan cho re-approval)
  ],
  [ApprovalStatus.REJECTED]: [
    ApprovalStatus.DRAFT, // proposer mo revision moi
  ],
  [ApprovalStatus.CANCELLED]: [],
};

export function canTransitionApproval(from: Status, to: Status): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertApprovalTransition(from: Status, to: Status): void {
  if (!canTransitionApproval(from, to)) {
    throw AppError.unprocessable(
      'APR_INVALID_TRANSITION',
      'Khong the chuyen Approval tu ' + from + ' sang ' + to,
      { from, to },
    );
  }
}

/** Action labels (su dung trong controller de map body.action sang target state). */
export type ApprovalAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'request-info'
  | 'cancel';

export function resolveTargetState(
  current: Status,
  action: ApprovalAction,
): Status {
  switch (action) {
    case 'submit':
      if (current === ApprovalStatus.DRAFT) return ApprovalStatus.SUBMITTED;
      break;
    case 'approve':
      if (current === ApprovalStatus.SUBMITTED) return ApprovalStatus.APPROVED;
      break;
    case 'reject':
      if (current === ApprovalStatus.SUBMITTED) return ApprovalStatus.REJECTED;
      break;
    case 'request-info':
      if (current === ApprovalStatus.SUBMITTED) return ApprovalStatus.INFO_REQUESTED;
      break;
    case 'cancel':
      if (
        current === ApprovalStatus.DRAFT ||
        current === ApprovalStatus.SUBMITTED ||
        current === ApprovalStatus.INFO_REQUESTED
      )
        return ApprovalStatus.CANCELLED;
      break;
  }
  throw AppError.unprocessable(
    'APR_INVALID_ACTION_FOR_STATE',
    'Hanh dong ' + action + ' khong hop le voi trang thai ' + current,
    { current, action },
  );
}

export function isTerminal(status: Status): boolean {
  return status === ApprovalStatus.APPROVED || status === ApprovalStatus.CANCELLED;
}
