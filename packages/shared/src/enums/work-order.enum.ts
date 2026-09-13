/**
 * Trạng thái Work Order (Doc04 enum - khong co PAUSED/RESUMED; do la event SLA).
 *
 * Luu y: WAITING_APPROVAL khong nam trong enum status (M6 se mo rong rieng).
 * Pause/Resume la note event trong work_order_notes.
 */
export const WorkOrderStatus = {
  NEW: 'NEW',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
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

/**
 * Che do tao Work Order (Doc04 section 5.4).
 */
export const WorkOrderCreationMode = {
  MANUAL: 'MANUAL',
  FROM_INCIDENT: 'FROM_INCIDENT',
  FROM_MAINTENANCE: 'FROM_MAINTENANCE',
} as const;
export type WorkOrderCreationMode =
  (typeof WorkOrderCreationMode)[keyof typeof WorkOrderCreationMode];

/**
 * Loai note trong work_order_notes (Doc04 section 5.6 + Q-04).
 *
 * PROGRESS                - ghi chu tien do thuong.
 * PAUSE_START             - WO tam dung (note.pause_reason bat buoc).
 * PAUSE_END               - WO tiep tuc.
 * WAITING_APPROVAL_START  - M6: WAITING_APPROVAL enter.
 * WAITING_APPROVAL_END    - M6: WAITING_APPROVAL exit.
 */
export const WorkOrderNoteType = {
  PROGRESS: 'PROGRESS',
  PAUSE_START: 'PAUSE_START',
  PAUSE_END: 'PAUSE_END',
  WAITING_APPROVAL_START: 'WAITING_APPROVAL_START',
  WAITING_APPROVAL_END: 'WAITING_APPROVAL_END',
} as const;
export type WorkOrderNoteType = (typeof WorkOrderNoteType)[keyof typeof WorkOrderNoteType];
