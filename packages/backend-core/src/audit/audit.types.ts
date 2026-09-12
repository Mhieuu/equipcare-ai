/**
 * Audit types — Doc04 §5.7 audit_logs.
 *
 * actor_type:
 *   - 'USER'  : có actor_id (UUID users.id)
 *   - 'SYSTEM': background job (worker), actor_id = NULL
 *   - 'API'   : API key / system integration, actor_id có thể NULL
 *
 * action: convention `<module>.<verb>`:
 *   - 'auth.login', 'auth.logout', 'auth.change-password'
 *   - 'iam.user.create', 'iam.user.update', 'iam.user.lock', 'iam.user.reset-password'
 *   - 'iam.role.grant', 'iam.role.revoke'
 *   - 'org.department.create', 'org.location.update', ...
 *   - 'cfg.setting.update'
 *
 * object_type: 'User' | 'Role' | 'UserRole' | 'Department' | 'Location'
 *              | 'AssetType' | 'SystemSetting' | 'Session'
 *
 * object_key: UUID (string) hoặc mã logic (vd 'system_settings:approval.near_expiry_hours')
 */
export type AuditActorType = 'USER' | 'SYSTEM' | 'API';

export interface WriteAuditInput {
  actorId?: string | null;
  actorType?: AuditActorType;
  /** Convention `<module>.<verb>` (vd 'iam.user.create'). */
  action: string;
  /** Loại đối tượng (PascalCase, vd 'User'). */
  objectType: string;
  /** UUID của đối tượng, hoặc code logic nếu không có UUID. */
  objectKey: string;
  /** Giá trị cũ (JSON). */
  oldValue?: unknown;
  /** Giá trị mới (JSON). */
  newValue?: unknown;
  /** Ghi chú tự do. */
  note?: string;
  /** UUID nhóm nhiều log của cùng 1 request. Auto-gen nếu thiếu. */
  correlationKey?: string;
}

export interface AuditLogRecord {
  id: string;
  actorId: string | null;
  actorType: AuditActorType;
  action: string;
  objectType: string;
  objectKey: string;
  oldValue: unknown;
  newValue: unknown;
  note: string | null;
  correlationKey: string;
  createdAt: Date;
}

export interface ListAuditLogsFilter {
  actorId?: string;
  action?: string;
  objectType?: string;
  objectKey?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}
