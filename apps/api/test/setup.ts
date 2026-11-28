/**
 * Jest setup — chạy TRƯỚC mọi test file.
 *
 * - Set DATABASE_URL mặc định nếu chưa có (để PrismaClient khởi tạo không crash).
 *   Test thực sự sẽ thử kết nối; nếu fail, beforeAll sẽ skip.
 * - Set JWT secrets mặc định để ConfigModule validate không crash.
 */

process.env.DATABASE_URL ??=
    'postgresql://equipcare:equipcare_pwd@localhost:5432/equipcare';
process.env.JWT_ACCESS_SECRET ??= 'test-secret-must-be-at-least-32-bytes-long-aaaaaa';
process.env.REFRESH_TOKEN_PEPPER ??= 'test-refresh-pepper-must-be-at-least-32-bytes';
process.env.ACCESS_TOKEN_TTL ??= '900';

/**
 * NODE_ENV phải LUÔN là 'test' khi chạy test — ghi đè (không dùng `??=`).
 *
 * Vì sao: `NODE_ENV` quyết định hành vi của nhiều thứ:
 *   - rate limit: ở 'test' được nới lỏng (10.000 req), nếu không thì E2E test
 *     chạy hàng trăm request sẽ dính 429 và fail lung tung.
 *   - Swagger `/docs`: chỉ bật khi NODE_ENV !== 'production'.
 *
 * Trước đây dùng `??=` nên nếu máy/CI đã có sẵn `NODE_ENV=production` trong
 * biến môi trường hệ thống, giá trị đó được giữ lại → test fail một cách
 * khó hiểu. Gán cứng để test luôn ổn định bất kể môi trường máy.
 */
process.env.NODE_ENV = 'test';
