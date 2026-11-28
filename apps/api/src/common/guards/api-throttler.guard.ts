import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { isRateLimitEnabled } from './throttler.config.js';

/**
 * ApiThrottlerGuard — global rate-limit guard.
 *
 * Kế thừa `ThrottlerGuard` của @nestjs/throttler để dùng đúng cơ chế
 * named-throttler + decorator `@Throttle({ short|ai: {...} })`.
 *
 * Điểm mở rộng duy nhất: cho phép tắt toàn bộ rate limit qua
 * `RATE_LIMIT_ENABLED=false` (dùng khi chạy test tải / benchmark).
 * Mặc định LUÔN bật — đây là lớp phòng thủ khi API chạy trên internet.
 */
@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isRateLimitEnabled()) {
      return true;
    }
    return super.canActivate(context);
  }
}
