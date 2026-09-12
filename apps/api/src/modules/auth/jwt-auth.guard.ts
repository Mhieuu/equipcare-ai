import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { AppError } from '@equipcare/backend-core';

/**
 * JwtAuthGuard — global guard cho mọi route trừ khi có @Public().
 *
 * Mặc định: mọi route CẦN Bearer token (Doc02 §FR-AUTH-01).
 * Decorator @Public() đánh dấu route không cần auth (login, refresh, healthz).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  override handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false,
  ): TUser {
    if (err || !user) {
      throw AppError.unauthorized(
        err instanceof Error ? err.message : 'Cần đăng nhập để truy cập',
      );
    }
    return user;
  }
}
