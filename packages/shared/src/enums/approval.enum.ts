/**
 * Trạng thái Approval (Doc04 §3.2: DRAFT | PENDING | NEEDS_INFO | APPROVED | REJECTED | CANCELLED).
 */
export const ApprovalStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  NEEDS_INFO: 'NEEDS_INFO',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

/**
 * Loại event approval (Doc04 §5.5).
 */
export const ApprovalEventType = {
  SUBMIT: 'SUBMIT',
  REQUEST_INFO: 'REQUEST_INFO',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  CANCEL: 'CANCEL',
} as const;
export type ApprovalEventType = (typeof ApprovalEventType)[keyof typeof ApprovalEventType];
