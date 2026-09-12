import type { PermissionCode } from '@equipcare/shared';

/**
 * Scope object — Doc04 §3.3: GLOBAL | DEPARTMENT | LOCATION | ASSET | INCIDENT.
 */
export interface UserScope {
  scopeType: 'GLOBAL' | 'DEPARTMENT' | 'LOCATION' | 'ASSET' | 'INCIDENT' | string;
  departmentId?: string;
  locationId?: string;
  assetId?: string;
  incidentId?: string;
}

export interface UserRoleScopes {
  userRoleId: string;
  roleCode: string;
  scopes: UserScope[];
}

/**
 * AuthenticatedUser — payload giải mã từ JWT access token.
 *
 * JwtStrategy load thêm `permissions` (union các permission codes của user)
 * và `scopes` (per user_role) để PermissionGuard + @CurrentUser dùng ngay,
 * không cần query lại DB.
 */
export interface AuthenticatedUser {
  /** user.id (UUID) */
  sub: string;
  /** users.auth_version — tăng mỗi lần đổi mật khẩu, vô hiệu hóa JWT cũ */
  ver: number;
  /** 'access' | 'refresh' — phân biệt loại token (mặc định access) */
  typ?: 'access' | 'refresh';
  /** Thời điểm phát hành (Unix seconds) */
  iat?: number;
  /** Thời điểm hết hạn (Unix seconds) */
  exp?: number;
  /** Role codes (ADMIN / MANAGER / TECHNICIAN / USER) của user */
  roles?: string[];
  /** Union permission codes của mọi role active */
  permissions?: PermissionCode[];
  /** Scope objects per user_role */
  scopes?: UserRoleScopes[];
}
