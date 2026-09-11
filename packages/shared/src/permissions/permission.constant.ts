/**
 * Permission codes — chỉ là hằng số định danh (Doc03 UseCase + RBAC matrix).
 * Policy thực sự (role → permissions, scope check) thuộc backend-core.
 *
 * Format: <module>:<action>
 */
export const Permission = {
  // Asset
  ASSET_READ: 'asset:read',
  ASSET_CREATE: 'asset:create',
  ASSET_UPDATE: 'asset:update',
  ASSET_DELETE: 'asset:delete',

  // Incident
  INCIDENT_CREATE: 'incident:create',
  INCIDENT_READ: 'incident:read',
  INCIDENT_TRIAGE: 'incident:triage',
  INCIDENT_CLOSE: 'incident:close',
  INCIDENT_REJECT: 'incident:reject',

  // Work Order
  WORK_ORDER_CREATE: 'work-order:create',
  WORK_ORDER_READ: 'work-order:read',
  WORK_ORDER_ASSIGN: 'work-order:assign',
  WORK_ORDER_TRANSITION: 'work-order:transition',
  WORK_ORDER_COMPLETE: 'work-order:complete',
  WORK_ORDER_CANCEL: 'work-order:cancel',

  // Approval
  APPROVAL_CREATE: 'approval:create',
  APPROVAL_DECIDE: 'approval:decide',

  // Inventory
  INVENTORY_PART_READ: 'inventory:part:read',
  INVENTORY_PART_CREATE: 'inventory:part:create',
  INVENTORY_ISSUE: 'inventory:issue',
  INVENTORY_RECEIPT: 'inventory:receipt',
  INVENTORY_TRANSFER: 'inventory:transfer',

  // Cost
  COST_READ: 'cost:read',

  // Maintenance
  MAINTENANCE_PLAN_READ: 'maintenance:plan:read',
  MAINTENANCE_PLAN_MANAGE: 'maintenance:plan:manage',

  // Dashboard / Report
  DASHBOARD_VIEW: 'dashboard:view',
  REPORT_EXPORT: 'report:export',

  // Admin (IAM)
  IAM_USER_READ: 'iam:user:read',
  IAM_USER_MANAGE: 'iam:user:manage',
  IAM_ROLE_READ: 'iam:role:read',
  IAM_ROLE_MANAGE: 'iam:role:manage',
  THRESHOLD_MANAGE: 'threshold:manage',

  // Attachment
  ATTACHMENT_UPLOAD: 'attachment:upload',
  ATTACHMENT_READ: 'attachment:read',

  // Figma v1.1 (plan rev. 6.1 §10.1)
  WORK_ORDER_DISPATCH_READ: 'work-order:dispatch:read',
  INCIDENT_QUEUE_READ: 'incident:queue:read',
  APPROVAL_QUEUE_READ: 'approval:queue:read',
  AUDIT_READ_ALL: 'audit:read:all',
  SYSTEM_CONFIG_UPDATE: 'system-config:update',
  DOCUMENT_READ: 'document:read',
} as const;

export type PermissionCode = (typeof Permission)[keyof typeof Permission];
