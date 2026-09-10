/**
 * Audit log entry shape (Doc02 §6 — audit).
 */
export interface AuditEntry {
  id: string;
  actorId: string;
  actorEmail?: string;
  action: string;          // vd 'INCIDENT_CREATE', 'WO_TRANSITION'
  entity: string;          // vd 'incident', 'work_order'
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  at: string;              // ISO 8601
}
