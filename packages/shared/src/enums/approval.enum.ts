/**
 * Trang thai approval (Doc04 section 5.7).
 *
 * DRAFT            - proposer dang soan (PATCH draft).
 * SUBMITTED        - submitted cho nguoi duyet.
 * INFO_REQUESTED   - nguoi duyet yeu cau them thong tin (proposer sua thanh revision moi).
 * APPROVED         - revision hien tai duoc duyet.
 * REJECTED         - revision hien tai bi tu choi (proposer co the revision moi).
 * CANCELLED        - proposer rut approval (terminal).
 */
export const ApprovalStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  INFO_REQUESTED: 'INFO_REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

/**
 * Approval event type (Doc04 section 5.7 + approval_events.event_type CHECK 0006).
 *
 * SUBMITTED         - revision submitted.
 * DRAFT_UPDATED     - draft con dang chinh sua.
 * REVISION_CREATED  - proposer tao revision moi (khi REJECTED/INFO_REQUESTED).
 * APPROVED          - nguoi duyet chap nhan.
 * REJECTED          - nguoi duyet tu choi.
 * INFO_REQUESTED    - nguoi duyet yeu cau them thong tin.
 * CANCELLED         - proposer rut.
 * REVOKED           - admin rollback.
 */
export const ApprovalEventType = {
  SUBMITTED: 'SUBMITTED',
  DRAFT_UPDATED: 'DRAFT_UPDATED',
  REVISION_CREATED: 'REVISION_CREATED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  INFO_REQUESTED: 'INFO_REQUESTED',
  CANCELLED: 'CANCELLED',
  REVOKED: 'REVOKED',
} as const;
export type ApprovalEventType =
  (typeof ApprovalEventType)[keyof typeof ApprovalEventType];

/**
 * Cost entry category (Doc04 section 5.6).
 */
export const CostCategory = {
  PART: 'PART',
  LABOR: 'LABOR',
  OTHER: 'OTHER',
} as const;
export type CostCategory = (typeof CostCategory)[keyof typeof CostCategory];

/**
 * Cost direction (Doc04 section 5.6).
 * DEBIT  - ghi tang chi phi.
 * CREDIT - ghi giam chi phi (returns, adjustment -).
 */
export const CostDirection = {
  DEBIT: 'DEBIT',
  CREDIT: 'CREDIT',
} as const;
export type CostDirection =
  (typeof CostDirection)[keyof typeof CostDirection];
