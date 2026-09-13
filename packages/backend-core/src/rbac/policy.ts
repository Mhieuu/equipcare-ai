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

/**
 * Q-07 (Doc04 §7 + plan Q-07): expand LOCATION scope bao gom cac location con
 * (de quy qua parent_id). Tra ve Set<UUID> gom ca location goc.
 *
 * Caller (service) can truyen:
 *   prisma.locationIds(roots) -> Set<string>
 * roi gan vao PolicyContext.scope.locationIds truoc khi isInScope().
 *
 * Implementation: SQL CTE recursive (parent_id tree).
 * Caller: `expandLocationSubtree(prisma, ['<root-uuid>'])`.
 */
export async function expandLocationSubtree(
  prisma: { $queryRaw: (strings: TemplateStringsArray | string, ...values: unknown[]) => Promise<unknown> },
  rootIds: string[],
): Promise<Set<string>> {
  if (rootIds.length === 0) return new Set();
  const rows = (await prisma.$queryRaw`
    WITH RECURSIVE loc_tree AS (
      SELECT id, parent_id FROM locations WHERE id = ANY(${rootIds}::uuid[])
      UNION ALL
      SELECT l.id, l.parent_id FROM locations l
      INNER JOIN loc_tree lt ON l.parent_id = lt.id
      WHERE l.is_active = true
    )
    SELECT id FROM loc_tree
  `) as Array<{ id: string }>;
  return new Set(rows.map((r) => r.id));
}

