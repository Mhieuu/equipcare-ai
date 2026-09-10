import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — singleton TRONG TỪNG PROCESS.
 *
 * Lưu ý: API và worker là 2 process riêng biệt, mỗi process khởi tạo
 * PrismaClient một lần và dùng `globalThis` để tránh tạo lại khi HMR
 * (chỉ trong dev). Trong production container thì lifecycle tự nhiên.
 *
 * KHÔNG cache singleton xuyên process — không có chia sẻ state.
 */
declare global {
  var __equipcarePrisma: PrismaClient | undefined;
}

function buildClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn']
        : ['query', 'info', 'warn', 'error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
}

export const prisma: PrismaClient =
  globalThis.__equipcarePrisma ?? (globalThis.__equipcarePrisma = buildClient());

/**
 * Đóng kết nối an toàn khi process shutdown.
 */
export async function disconnectPrisma(): Promise<void> {
  if (globalThis.__equipcarePrisma) {
    await globalThis.__equipcarePrisma.$disconnect();
    globalThis.__equipcarePrisma = undefined;
  }
}
