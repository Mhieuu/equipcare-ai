import type { PermissionCode } from '@equipcare/shared';

/**
 * RBAC policy — skeleton. Sẽ đầy đủ ở M2 (Doc03 UseCase + RBAC matrix).
 *
 * M0 chỉ cần khai báo kiểu + 1 helper `hasPermission` để typecheck pass.
 * Logic mapping role → permissions sẽ load từ DB (`role_permissions`) lúc runtime.
 */
export interface PolicyContext {
  userId: string;
  roles: string[];                 // role codes: ADMIN / MANAGER / TECHNICIAN / REPORTER / VIEWER
  permissions: PermissionCode[];   // resolved from DB (role_permissions)
  scope?: {
    departmentIds?: string[];
    locationIds?: string[];
    assetIds?: string[];
  };
}

export function hasPermission(ctx: PolicyContext, required: PermissionCode): boolean {
  return ctx.permissions.includes(required);
}

export function hasAnyPermission(
  ctx: PolicyContext,
  required: PermissionCode[],
): boolean {
  return required.some((p) => ctx.permissions.includes(p));
}

export function isInScope(
  ctx: PolicyContext,
  resource: { departmentId?: string; locationId?: string; assetId?: string },
): boolean {
  if (!ctx.scope) return true; // Admin không có scope → pass all
  if (resource.departmentId && ctx.scope.departmentIds) {
    if (!ctx.scope.departmentIds.includes(resource.departmentId)) return false;
  }
  if (resource.locationId && ctx.scope.locationIds) {
    if (!ctx.scope.locationIds.includes(resource.locationId)) return false;
  }
  if (resource.assetId && ctx.scope.assetIds) {
    if (!ctx.scope.assetIds.includes(resource.assetId)) return false;
  }
  return true;
}
