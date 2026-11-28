/**
 * Cấu hình rate limit cho API.
 *
 * Bối cảnh (Doc02 §NFR-SEC): hệ thống sẽ được đưa lên internet, nên cần chặn
 * abuse ở 2 mặt:
 *  - Endpoint xác thực: chặn brute-force mật khẩu.
 *  - Endpoint AI: mỗi lần gọi Gemini đều tốn tiền, không được để spam.
 *
 * Có 3 "named throttler" (theo @nestjs/throttler v5):
 *  - `default` — áp cho toàn bộ API.
 *  - `short`   — ngưỡng chặt cho endpoint nhạy cảm (login, refresh, đổi mật khẩu).
 *  - `ai`     — ngưỡng chặt nhất cho endpoint AI (mỗi lượt gọi đều tốn tiền).
 *
 * Biến môi trường cho phép chỉnh khi hosting mà không cần sửa code:
 *  - `RATE_LIMIT_WINDOW_MS`   (mặc định 60000)
 *  - `RATE_LIMIT_MAX`         (mặc định 120)
 *  - `RATE_LIMIT_SHORT_MAX`   (mặc định 20)
 *  - `RATE_LIMIT_AI_MAX`      (mặc định 6)
 *  - `RATE_LIMIT_ENABLED`     (mặc định true; tắt chỉ dùng cho test load)
 *
 * Lưu ý: ở môi trường `test`, ngưỡng được nới lỏng để E2E test (chạy hàng
 * trăm request liên tiếp) không bị chặn nhầm.
 */
import type { ThrottlerModuleOptions } from '@nestjs/throttler';

/** Quy đổi cửa sổ thời gian (ms) — mặc định 60 giây. */
function windowMs(): number {
  const parsed = Number(process.env.RATE_LIMIT_WINDOW_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
}

/** Đọc giới hạn từ env, fallback về giá trị mặc định nếu env không hợp lệ. */
function limitFromEnv(varName: string, fallback: number): number {
  const parsed = Number(process.env[varName]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Rate limit có bật không. */
export function isRateLimitEnabled(): boolean {
  const raw = process.env.RATE_LIMIT_ENABLED;
  return raw !== 'false' && raw !== '0';
}

/**
 * Ngưỡng dùng cho môi trường test — cao hơn rất nhiều để E2E test ổn định.
 *
 * Lý do phải nới: bộ test E2E hiện có chạy hàng trăm request liên tiếp trên
 * cùng IP (127.0.0.1). Với ngưỡng production, các test này sẽ bị 429 nhầm.
 *
 * Ngoại lệ: nếu `RATE_LIMIT_TEST_STRICT=true`, dùng đúng ngưỡng khai báo trong
 * env — dùng cho chính test `rate-limit.e2e-spec.ts` để verify hành vi thật.
 */
function testSafeMax(): number {
  return 10_000;
}

/** Ngưỡng dùng cho môi trường test — cao hơn rất nhiều để E2E test ổn định. */
export function throttlerOptions(): ThrottlerModuleOptions {
  const ttl = windowMs();

  if (process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_TEST_STRICT !== 'true') {
    return [
      { name: 'default', limit: testSafeMax(), ttl },
      { name: 'short', limit: testSafeMax(), ttl },
      { name: 'ai', limit: testSafeMax(), ttl },
    ];
  }

  return [
    { name: 'default', limit: limitFromEnv('RATE_LIMIT_MAX', 120), ttl },
    { name: 'short', limit: limitFromEnv('RATE_LIMIT_SHORT_MAX', 20), ttl },
    { name: 'ai', limit: limitFromEnv('RATE_LIMIT_AI_MAX', 6), ttl },
  ];
}
