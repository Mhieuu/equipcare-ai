/**
 * Seed idempotent — M1.A Foundation (plan rev. 6.1).
 *
 * Quy tắc (R-06):
 * - UUID cố định trong seed-constants.ts (Doc04 §5.3: granted_by NULL chỉ cho bootstrap).
 * - Upsert theo khóa tự nhiên (login_name, code) — chạy lại không lỗi.
 * - Hash mật khẩu: bcrypt (cost 10).
 *   (P1 production: thay bằng argon2id — đã ghi trong db_schema.md §2.3.)
 */

// Load .env manually (tsx không auto-load, dotenv chưa có trong deps).
// Tìm ở 3 vị trí: cwd, apps/api/, root repo.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '../../.env'),
  resolve(__dirname, '../../../.env'),
];
for (const p of envCandidates) {
  if (existsSync(p)) {
    const content = readFileSync(p, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      // Strip quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
    break;
  }
}

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  BOOTSTRAP_ADMIN_ID,
  BOOTSTRAP_DEPARTMENT_ID,
  BOOTSTRAP_LOCATION_ID,
  ROLE_ADMIN_ID,
  ROLE_MANAGER_ID,
  ROLE_TECHNICIAN_ID,
  ROLE_USER_ID,
} from './seed-constants';

/**
 * Permission codes (Doc04 §2 TK-06, plan rev. 6.1 §10.1).
 * Inlined để tránh import @equipcare/shared (chưa build lúc seed).
 */
const P = {
  ASSET_READ: 'asset:read',
  ASSET_CREATE: 'asset:create',
  ASSET_UPDATE: 'asset:update',
  ASSET_DELETE: 'asset:delete',
  INCIDENT_CREATE: 'incident:create',
  INCIDENT_READ: 'incident:read',
  INCIDENT_TRIAGE: 'incident:triage',
  INCIDENT_CLOSE: 'incident:close',
  INCIDENT_REJECT: 'incident:reject',
  WORK_ORDER_CREATE: 'work-order:create',
  WORK_ORDER_READ: 'work-order:read',
  WORK_ORDER_ASSIGN: 'work-order:assign',
  WORK_ORDER_TRANSITION: 'work-order:transition',
  WORK_ORDER_COMPLETE: 'work-order:complete',
  WORK_ORDER_CANCEL: 'work-order:cancel',
  APPROVAL_CREATE: 'approval:create',
  APPROVAL_DECIDE: 'approval:decide',
  INVENTORY_PART_READ: 'inventory:part:read',
  INVENTORY_PART_CREATE: 'inventory:part:create',
  INVENTORY_ISSUE: 'inventory:issue',
  INVENTORY_RECEIPT: 'inventory:receipt',
  COST_READ: 'cost:read',
  MAINTENANCE_PLAN_READ: 'maintenance:plan:read',
  MAINTENANCE_PLAN_MANAGE: 'maintenance:plan:manage',
  DASHBOARD_VIEW: 'dashboard:view',
  REPORT_EXPORT: 'report:export',
  IAM_USER_READ: 'iam:user:read',
  IAM_USER_MANAGE: 'iam:user:manage',
  IAM_ROLE_READ: 'iam:role:read',
  IAM_ROLE_MANAGE: 'iam:role:manage',
  THRESHOLD_MANAGE: 'threshold:manage',
  ATTACHMENT_UPLOAD: 'attachment:upload',
  ATTACHMENT_READ: 'attachment:read',
  WORK_ORDER_DISPATCH_READ: 'work-order:dispatch:read',
  INCIDENT_QUEUE_READ: 'incident:queue:read',
  APPROVAL_QUEUE_READ: 'approval:queue:read',
  AUDIT_READ_ALL: 'audit:read:all',
  SYSTEM_CONFIG_UPDATE: 'system-config:update',
  DOCUMENT_READ: 'document:read',
} as const;

const ADMIN_PERMISSIONS: string[] = [
  P.ASSET_READ, P.ASSET_CREATE, P.ASSET_UPDATE, P.ASSET_DELETE,
  P.INCIDENT_CREATE, P.INCIDENT_READ, P.INCIDENT_TRIAGE, P.INCIDENT_CLOSE, P.INCIDENT_REJECT,
  P.WORK_ORDER_CREATE, P.WORK_ORDER_READ, P.WORK_ORDER_ASSIGN, P.WORK_ORDER_TRANSITION, P.WORK_ORDER_COMPLETE, P.WORK_ORDER_CANCEL,
  P.APPROVAL_CREATE, P.APPROVAL_DECIDE,
  P.INVENTORY_PART_READ, P.INVENTORY_PART_CREATE, P.INVENTORY_ISSUE, P.INVENTORY_RECEIPT,
  P.COST_READ,
  P.MAINTENANCE_PLAN_READ, P.MAINTENANCE_PLAN_MANAGE,
  P.DASHBOARD_VIEW, P.REPORT_EXPORT,
  P.IAM_USER_READ, P.IAM_USER_MANAGE, P.IAM_ROLE_READ, P.IAM_ROLE_MANAGE, P.THRESHOLD_MANAGE,
  P.ATTACHMENT_UPLOAD, P.ATTACHMENT_READ,
  P.WORK_ORDER_DISPATCH_READ, P.INCIDENT_QUEUE_READ, P.APPROVAL_QUEUE_READ, P.AUDIT_READ_ALL, P.SYSTEM_CONFIG_UPDATE, P.DOCUMENT_READ,
];

const MANAGER_PERMISSIONS: string[] = [
  P.ASSET_READ, P.ASSET_CREATE, P.ASSET_UPDATE,
  P.INCIDENT_READ, P.INCIDENT_TRIAGE, P.INCIDENT_CLOSE, P.INCIDENT_REJECT,
  P.WORK_ORDER_CREATE, P.WORK_ORDER_READ, P.WORK_ORDER_ASSIGN, P.WORK_ORDER_TRANSITION, P.WORK_ORDER_COMPLETE, P.WORK_ORDER_CANCEL,
  P.APPROVAL_DECIDE,
  P.INVENTORY_PART_READ, P.INVENTORY_ISSUE, P.INVENTORY_RECEIPT,
  P.COST_READ,
  P.MAINTENANCE_PLAN_READ, P.MAINTENANCE_PLAN_MANAGE,
  P.DASHBOARD_VIEW, P.REPORT_EXPORT,
  P.ATTACHMENT_UPLOAD, P.ATTACHMENT_READ,
  P.WORK_ORDER_DISPATCH_READ, P.INCIDENT_QUEUE_READ, P.APPROVAL_QUEUE_READ, P.SYSTEM_CONFIG_UPDATE, P.DOCUMENT_READ,
];

const TECHNICIAN_PERMISSIONS: string[] = [
  P.ASSET_READ,
  P.INCIDENT_CREATE, P.INCIDENT_READ,
  P.WORK_ORDER_READ, P.WORK_ORDER_TRANSITION, P.WORK_ORDER_COMPLETE,
  P.APPROVAL_CREATE,
  P.INVENTORY_PART_READ, P.INVENTORY_ISSUE,
  P.ATTACHMENT_UPLOAD, P.ATTACHMENT_READ,
  P.DOCUMENT_READ,
];

const USER_PERMISSIONS: string[] = [
  P.ASSET_READ,
  P.INCIDENT_CREATE, P.INCIDENT_READ,
  P.ATTACHMENT_UPLOAD,
];

const prisma = new PrismaClient();

const SYSTEM_ADMIN_LOGIN = 'admin.bootstrap';
const SYSTEM_ADMIN_DEFAULT_PASSWORD = 'ChangeMe@2026'; // đổi sau lần đăng nhập đầu tiên

async function main(): Promise<void> {
  console.info('[seed] M1.A — Foundation + Auth + IAM');

  // 1. Department bootstrap (đơn vị đầu tiên)
  await prisma.departments.upsert({
    where: { id: BOOTSTRAP_DEPARTMENT_ID },
    update: {},
    create: {
      id: BOOTSTRAP_DEPARTMENT_ID,
      code: 'DEPT-BOOTSTRAP',
      name: 'Đơn vị bootstrap',
      is_active: true,
    },
  });
  console.info('[seed] departments.bootstrap upserted');

  // 2. Location bootstrap (vị trí gốc)
  await prisma.locations.upsert({
    where: { id: BOOTSTRAP_LOCATION_ID },
    update: {},
    create: {
      id: BOOTSTRAP_LOCATION_ID,
      code: 'LOC-BOOTSTRAP',
      name: 'Vị trí mặc định',
      parent_id: null,
      is_active: true,
    },
  });
  console.info('[seed] locations.bootstrap upserted');

  // 3. Bootstrap Admin user (PHẢI tạo trước role_permissions vì FK granted_by → users.id)
  const SYSTEM_ADMIN_LOGIN = 'admin.bootstrap';
  const SYSTEM_ADMIN_DEFAULT_PASSWORD = 'ChangeMe@2026';
  const passwordHash = await bcrypt.hash(SYSTEM_ADMIN_DEFAULT_PASSWORD, 10);
  await prisma.users.upsert({
    where: { login_name: SYSTEM_ADMIN_LOGIN },
    update: {
      must_change_password: true,
    },
    create: {
      id: BOOTSTRAP_ADMIN_ID,
      login_name: SYSTEM_ADMIN_LOGIN,
      full_name: 'Quản trị hệ thống (bootstrap)',
      email: 'admin@equipcare.local',
      department_id: BOOTSTRAP_DEPARTMENT_ID,
      password_hash: passwordHash,
      is_locked: false,
      must_change_password: true,
      auth_version: 1,
    },
  });
  console.info(`[seed] users.bootstrap upserted (login_name=${SYSTEM_ADMIN_LOGIN}, password=${SYSTEM_ADMIN_DEFAULT_PASSWORD})`);

  // 4. 4 vai trò cố định (Doc04 §2 TK-06)
  const roleRows = [
    { id: ROLE_ADMIN_ID, code: 'ADMIN', name: 'Quản trị hệ thống' },
    { id: ROLE_MANAGER_ID, code: 'MANAGER', name: 'Quản lý' },
    { id: ROLE_TECHNICIAN_ID, code: 'TECHNICIAN', name: 'Kỹ thuật viên' },
    { id: ROLE_USER_ID, code: 'USER', name: 'Người sử dụng' },
  ];
  for (const r of roleRows) {
    await prisma.roles.upsert({
      where: { code: r.code },
      update: { name: r.name },
      create: { id: r.id, code: r.code, name: r.name },
    });
  }
  console.info('[seed] roles (4) upserted');

  // 5. Permissions + role_permissions (matrix quyền version 1)
  const allPermissions = new Set([
    ...ADMIN_PERMISSIONS,
    ...MANAGER_PERMISSIONS,
    ...TECHNICIAN_PERMISSIONS,
    ...USER_PERMISSIONS,
  ]);

  const permissionIds = new Map<string, string>();
  for (const code of allPermissions) {
    const row = await prisma.permissions.upsert({
      where: { code },
      update: { description: code },
      create: { code, description: code },
    });
    permissionIds.set(code, row.id);
  }
  console.info(`[seed] permissions (${allPermissions.size}) upserted`);

  const rolePermissionMatrix: Array<{ roleCode: string; permissionCodes: string[] }> = [
    { roleCode: 'ADMIN', permissionCodes: ADMIN_PERMISSIONS },
    { roleCode: 'MANAGER', permissionCodes: MANAGER_PERMISSIONS },
    { roleCode: 'TECHNICIAN', permissionCodes: TECHNICIAN_PERMISSIONS },
    { roleCode: 'USER', permissionCodes: USER_PERMISSIONS },
  ];

  for (const { roleCode, permissionCodes } of rolePermissionMatrix) {
    const role = await prisma.roles.findUniqueOrThrow({ where: { code: roleCode } });
    await prisma.role_permissions.deleteMany({ where: { role_id: role.id } });
    for (const code of permissionCodes) {
      const permissionId = permissionIds.get(code);
      if (!permissionId) continue;
      await prisma.role_permissions.create({
        data: {
          role_id: role.id,
          permission_id: permissionId,
          granted_by: BOOTSTRAP_ADMIN_ID,
        },
      });
    }
  }
  console.info('[seed] role_permissions matrix upserted');

  // 6. user_roles cho Admin (granted_by = NULL — Doc04 §5.3 bootstrap)
  const adminUserRoleId = '00000000-0000-4000-8000-000000000201';
  await prisma.user_roles.upsert({
    where: { id: adminUserRoleId },
    update: { is_active: true, revoked_at: null },
    create: {
      id: adminUserRoleId,
      user_id: BOOTSTRAP_ADMIN_ID,
      role_id: ROLE_ADMIN_ID,
      is_active: true,
      granted_by: null,
    },
  });
  console.info('[seed] user_roles (admin bootstrap) upserted (granted_by=NULL)');

  // 7. access_scopes: Admin GLOBAL (Doc04 §5.3 — admin có global scope)
  const adminScopeId = '00000000-0000-4000-8000-000000000301';
  await prisma.access_scopes.upsert({
    where: { id: adminScopeId },
    update: { is_active: true },
    create: {
      id: adminScopeId,
      user_role_id: adminUserRoleId,
      scope_type: 'GLOBAL',
      department_id: null,
      location_id: null,
      asset_id: null,
      incident_id: null,
      is_active: true,
      granted_by: BOOTSTRAP_ADMIN_ID,
    },
  });
  console.info('[seed] access_scopes (admin GLOBAL) upserted');

  // 8. system_settings seed (Doc04 §7.4)
  const defaultSettings: Array<{ key: string; value: unknown; description: string }> = [
    { key: 'sla.high_seconds', value: 14400, description: 'SLA cho priority HIGH (giây)' },
    { key: 'sla.medium_seconds', value: 86400, description: 'SLA cho priority MEDIUM (giây)' },
    { key: 'sla.low_seconds', value: 259200, description: 'SLA cho priority LOW (giây)' },
    { key: 'sla.waiting_approval_counts_as_overdue', value: false, description: 'Q-04 defer' },
    { key: 'approval.threshold_cost', value: 500000, description: 'Ngưỡng chi phí bắt buộc duyệt (VND)' },
    { key: 'approval.requires_approval_part', value: false, description: 'Linh kiện requires_approval bắt buộc duyệt' },
    { key: 'approval.near_expiry_hours', value: 4, description: 'Tab Sắp quá hạn trong Hộp thư phê duyệt (giờ)' },
    { key: 'file.size_limit_bytes', value: 26214400, description: 'Kích thước tệp tối đa (bytes)' },
    { key: 'file.mime_allowlist', value: ['image/png', 'image/jpeg', 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], description: 'MIME cho phép' },
    { key: 'ai.timeout_ms', value: 45000, description: 'Timeout AI (ms)' },
    { key: 'ai.max_retries', value: 2, description: 'Số lần retry AI' },
    { key: 'maintenance.due_grace_hours', value: 24, description: 'Q-02 grace hours' },
    { key: 'low_stock.check_interval_minutes', value: 60, description: 'Tần suất quét tồn thấp' },
  ];
  for (const s of defaultSettings) {
    await prisma.system_settings.upsert({
      where: { key: s.key },
      update: { value: s.value as object, description: s.description },
      create: {
        key: s.key,
        value: s.value as object,
        description: s.description,
        updated_by: BOOTSTRAP_ADMIN_ID,
      },
    });
  }
  console.info(`[seed] system_settings (${defaultSettings.length}) upserted`);

  console.info('[seed] DONE');
}

main()
  .catch((err) => {
    console.error('[seed] failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
