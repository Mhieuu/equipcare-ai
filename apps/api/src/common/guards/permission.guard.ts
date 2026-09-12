import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppError } from '@equipcare/backend-core';
import type { PermissionCode } from '@equipcare/shared';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import type { AuthenticatedUser } from '../types/auth-user.type.js';

/**
 * PermissionGuard — check user có ít nhất 1 permission trong @Permissions(...).
 *
 * Áp dụng:
 * - @UseGuards(PermissionGuard) cho từng controller.
 * - HOẶC register global qua APP_GUARD (mặc định skip nếu không có
 *   @Permissions metadata, để các endpoint public / auth-only vẫn OK).
 *
 * Lưu ý: PermissionGuard phải chạy SAU JwtAuthGuard (đã có user.permissions).
 * NestJS chạy APP_GUARD theo thứ tự khai báo; với @UseGuards riêng lẻ thì
 * thứ tự là [JwtAuthGuard, PermissionGuard].
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionCode[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Không có metadata → endpoint không yêu cầu permission cụ thể → pass.
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) {
      throw AppError.unauthorized('Cần đăng nhập');
    }
    if (!user.permissions || user.permissions.length === 0) {
      throw AppError.forbidden('Không có quyền truy cập');
    }
    const has = required.some((p) => user.permissions!.includes(p));
    if (!has) {
      throw AppError.forbidden('Không đủ quyền để thực hiện hành động này');
    }
    return true;
  }
}
