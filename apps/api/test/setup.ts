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
process.env.NODE_ENV ??= 'test';
