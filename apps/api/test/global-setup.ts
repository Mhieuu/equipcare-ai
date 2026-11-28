/**
 * Jest globalSetup — chuẩn bị trạng thái sạch TRƯỚC khi chạy test.
 *
 * Vấn đề mà file này giải quyết:
 *   TC-AUTH-05 (change-password) đổi mật khẩu `admin.bootstrap` rồi đổi lại
 *   về mật khẩu mặc định ở bước cuối. Nếu test bị fail giữa chừng (mất
 *   mạng, timeout, assertion khác fail trước), bước "đổi lại" KHÔNG chạy
 *   → admin bị kẹt ở mật khẩu `NewSecure@Pass2026!` → mọi test sau đó đăng
 *   nhập bằng `ChangeMe@2026` đều nhận 401 → lỗi lan toả ra toàn bộ suite.
 *
 *   Tức là một lần fail lơ lẻ có thể làm hỏng cả lần chạy test kế tiếp.
 *
 * Cách sửa:
 *   Ở đầu mỗi lần chạy, reset mật khẩu admin về mật khẩu mặc định và xoá
 *   session cũ. Nhờ vậy test luôn bắt đầu từ trạng thái đã biết, độc lập
 *   với kết quả của lần chạy trước.
 *
 * Lưu ý: nếu DB không chạy, setup sẽ bỏ qua (không làm fail cả suite) —
 * các test có beforeAll sẽ tự skip.
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const DEFAULT_ADMIN_LOGIN = 'admin.bootstrap';
const DEFAULT_ADMIN_PASSWORD = 'ChangeMe@2026';

export default async function globalSetup(): Promise<void> {
  // Ép NODE_ENV='test' — giống lý do ở test/setup.ts: rate limit phải được
  // nới lỏng khi test, nếu không E2E sẽ dính 429.
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL ??=
    'postgresql://equipcare:equipcare_pwd@localhost:5432/equipcare';

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();

    const admin = await prisma.users.findUnique({
      where: { login_name: DEFAULT_ADMIN_LOGIN },
      select: { id: true },
    });

    if (!admin) {
      // Chưa có admin → cần chạy seed. Không tự seed ở đây (nặng và chậm),
      // chỉ cảnh báo để lỗi hiển thị rõ nguyên nhân.
      // eslint-disable-next-line no-console
      console.warn(
        `[global-setup] Không tìm thấy user "${DEFAULT_ADMIN_LOGIN}" — ` +
          'hãy chạy `pnpm --filter @equipcare/api db:seed` trước khi test.',
      );
      return;
    }

    // Reset mật khẩu admin về mặc định (bcrypt hash mới mỗi lần → hash luôn khác).
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    await prisma.users.update({
      where: { id: admin.id },
      data: {
        password_hash: passwordHash,
        is_locked: false,
        must_change_password: false,
      },
    });

    // Xoá session cũ: token đã cấp trước đó không còn khớp mật khẩu.
    await prisma.sessions.deleteMany({ where: { user_id: admin.id } });

    // eslint-disable-next-line no-console
    console.log(
      `[global-setup] Đã reset "${DEFAULT_ADMIN_LOGIN}" về mật khẩu mặc định + xoá session cũ.`,
    );
  } catch (err) {
    // Không fail cả suite: các test có beforeAll sẽ tự skip nếu DB không sẵn sàng.
    // eslint-disable-next-line no-console
    console.warn(
      `[global-setup] Bỏ qua reset admin (DB chưa sẵn sàng?): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
