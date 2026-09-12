/**
 * Audit module — domain helpers ghi log + đọc log.
 * KHÔNG HTTP, KHÔNG framework dependency. Chỉ thuần domain.
 *
 * - writeAudit: ghi 1 record vào audit_logs (Doc04 §5.7).
 *   Tự sinh correlation_key nếu thiếu → nhóm các log của cùng 1 request.
 * - listAuditLogs: query filter (Doc02 §NFR-AUDIT-01).
 *
 * Lý do đặt ở backend-core: API và worker đều ghi audit (worker ghi events
 * cho incident/WO/approval), cùng shape → cùng module.
 */
export * from './audit.types.js';
export * from './audit.service.js';
