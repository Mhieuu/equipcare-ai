import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/auth-user.type.js';

/**
 * @CurrentUser() — lấy user đã được JwtAuthGuard xác thực.
 *
 * - Không truyền arg → trả về toàn bộ AuthenticatedUser.
 * - Truyền key (vd 'sub', 'ver') → trả về field đó.
 */
export const CurrentUser = createParamDecorator(
  (key: keyof AuthenticatedUser | undefined, ctx: ExecutionContext): unknown => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) return undefined;
    return key ? user[key] : user;
  },
);
