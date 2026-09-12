import { SetMetadata } from '@nestjs/common';
import type { PermissionCode } from '@equipcare/shared';

/**
 * @Permissions('asset:read', 'asset:update') — endpoint yêu cầu user
 * có ÍT NHẤT 1 permission trong danh sách (OR logic).
 *
 * PermissionGuard (apply qua APP_GUARD hoặc @UseGuards) sẽ check:
 *   1. user.permissions chứa ít nhất 1 trong các code → pass
 *   2. không có → 403 FORBIDDEN
 */
export const PERMISSIONS_KEY = 'requiredPermissions';
export const Permissions = (...codes: PermissionCode[]) => SetMetadata(PERMISSIONS_KEY, codes);
