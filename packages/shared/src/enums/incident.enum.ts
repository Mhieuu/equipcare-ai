/**
 * Trạng thái Incident (Doc04 §3.2: NEW | AWAITING_INFO | IN_PROGRESS | RESOLVED | CLOSED | CANCELLED — không REOPENED).
 */
export const IncidentStatus = {
  NEW: 'NEW',
  AWAITING_INFO: 'AWAITING_INFO',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;
export type IncidentStatus = (typeof IncidentStatus)[keyof typeof IncidentStatus];

/**
 * Loại message trong incident chat (Doc04 §5.5).
 *
 * REPORTER — người báo sự cố (lúc tạo incident).
 * STAFF    — kỹ thuật viên / manager phản hồi.
 * SYSTEM   — system event (state change, audit).
 * AI       — gợi ý từ AI provider (output snapshot — Doc05 §10.1).
 */
export const IncidentMessageType = {
  REPORTER: 'REPORTER',
  STAFF: 'STAFF',
  SYSTEM: 'SYSTEM',
  AI: 'AI',
} as const;
export type IncidentMessageType =
  (typeof IncidentMessageType)[keyof typeof IncidentMessageType];

/**
 * Mức độ ưu tiên Incident (Doc04).
 */
export const IncidentPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type IncidentPriority = (typeof IncidentPriority)[keyof typeof IncidentPriority];

/**
 * Trạng thái AI request (Doc04 §5.8, plan §12.2 M4).
 *
 * Lifecycle: QUEUED → RUNNING → SUCCEEDED | FAILED | TIMED_OUT.
 * Worker xử lý retry/backoff trước khi FAILED.
 */
export const AiRequestStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  TIMED_OUT: 'TIMED_OUT',
} as const;
export type AiRequestStatus = (typeof AiRequestStatus)[keyof typeof AiRequestStatus];

/**
 * Loại AI task (Doc05 §10.1, plan §12.2 M4).
 *
 * INCIDENT_TRIAGE — phân loại / gợi ý cho incident (FR-AI-01).
 * ASSET_SUMMARY  — tóm tắt asset (FR-AI-02; chưa dùng ở M4).
 * OTHER          — mở rộng cho tương lai.
 */
export const AiTaskType = {
  INCIDENT_TRIAGE: 'INCIDENT_TRIAGE',
  ASSET_SUMMARY: 'ASSET_SUMMARY',
  OTHER: 'OTHER',
} as const;
export type AiTaskType = (typeof AiTaskType)[keyof typeof AiTaskType];
