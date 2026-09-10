/**
 * Trạng thái Incident (Doc04).
 */
export const IncidentStatus = {
  OPEN: 'OPEN',
  TRIAGED: 'TRIAGED',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  REJECTED: 'REJECTED',
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
