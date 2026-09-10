/**
 * Trạng thái Work Order (Doc04 enum — không có PAUSED/RESUMED; đó là event SLA).
 */
export const WorkOrderStatus = {
  NEW: 'NEW',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_APPROVAL: 'WAITING_APPROVAL',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type WorkOrderStatus = (typeof WorkOrderStatus)[keyof typeof WorkOrderStatus];

/**
 * Loại Work Order (Doc04).
 */
export const WorkOrderType = {
  REPAIR: 'REPAIR',
  MAINTENANCE: 'MAINTENANCE',
  INSPECTION: 'INSPECTION',
} as const;
export type WorkOrderType = (typeof WorkOrderType)[keyof typeof WorkOrderType];

/**
 * Event SLA trong work_order_status_history (Doc04 — Q-04).
 * PAUSED/RESUMED chỉ là event, không phải trạng thái WO.
 */
export const WorkOrderEventType = {
  ASSIGNED: 'ASSIGNED',
  STARTED: 'STARTED',
  PAUSED: 'PAUSED',
  RESUMED: 'RESUMED',
  WAITING_APPROVAL_ENTER: 'WAITING_APPROVAL_ENTER',
  WAITING_APPROVAL_EXIT: 'WAITING_APPROVAL_EXIT',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type WorkOrderEventType = (typeof WorkOrderEventType)[keyof typeof WorkOrderEventType];

/**
 * Lý do pause (Doc04).
 */
export const PauseReason = {
  WAITING_PART: 'WAITING_PART',
  WAITING_RESOURCE: 'WAITING_RESOURCE',
  OTHER: 'OTHER',
} as const;
export type PauseReason = (typeof PauseReason)[keyof typeof PauseReason];
