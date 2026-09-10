/**
 * Trạng thái Maintenance Plan (Doc04).
 */
export const MaintenancePlanStatus = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type MaintenancePlanStatus =
  (typeof MaintenancePlanStatus)[keyof typeof MaintenancePlanStatus];

/**
 * Trạng thái Occurrence (Doc04 — Q-02).
 * - SCHEDULED: chưa tới due_on
 * - DUE: đang trong kỳ đến hạn (due_on ≤ now < due_on + grace)
 * - OVERDUE: quá hạn (now ≥ due_on + grace) — không bị bỏ qua, scheduler đảm bảo có WO mở/thay thế
 * - SKIPPED: plan PAUSED hoặc nhân viên skip — KHÔNG sinh bù khi resume
 */
export const OccurrenceStatus = {
  SCHEDULED: 'SCHEDULED',
  DUE: 'DUE',
  OVERDUE: 'OVERDUE',
  SKIPPED: 'SKIPPED',
  COMPLETED: 'COMPLETED',
} as const;
export type OccurrenceStatus = (typeof OccurrenceStatus)[keyof typeof OccurrenceStatus];

/**
 * Recurrence pattern (Doc04).
 */
export const RecurrencePattern = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  CUSTOM_CRON: 'CUSTOM_CRON',
} as const;
export type RecurrencePattern =
  (typeof RecurrencePattern)[keyof typeof RecurrencePattern];
