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
 * Mức độ ưu tiên Incident (Doc04).
 */
export const IncidentPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type IncidentPriority = (typeof IncidentPriority)[keyof typeof IncidentPriority];
