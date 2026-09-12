import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { disconnectPrisma } from '@equipcare/backend-core';

/**
 * PrismaService — NestJS-friendly wrapper quanh PrismaClient.
 *
 * Mục tiêu:
 * - Inherit PrismaClient (các model methods như prisma.users.findMany() có sẵn).
 * - Quản lý lifecycle qua Nest (OnModuleInit / OnApplicationShutdown) — đóng kết nối
 *   đúng cách khi app shutdown (graceful).
 * - Đọc `DATABASE_URL` từ ConfigService đã được validate (fail-fast nếu sai).
 * - KHÔNG dùng singleton module-level của backend-core cho DI; backend-core vẫn
 *   giữ singleton cho worker (nơi không có Nest DI).
 *
 * Lưu ý: API và worker là 2 process riêng biệt, mỗi process tạo 1 PrismaClient.
 * Không cache xuyên process.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(ConfigService) config: ConfigService) {
    const url = config.get<string>('DATABASE_URL');
    if (!url) {
      throw new Error('DATABASE_URL chưa được cấu hình');
    }
    super({
      log:
        config.get<string>('NODE_ENV') === 'production'
          ? ['error', 'warn']
          : ['warn', 'error'],
      datasources: { db: { url } },
    });
  }

  async onModuleInit(): Promise<void> {
    // Kết nối lazily; ping DB để phát hiện sai config sớm.
    try {
      await this.$queryRaw`SELECT 1`;
      this.logger.log('PostgreSQL connected');
    } catch (err) {
      this.logger.error('PostgreSQL connect failed', err as Error);
      throw err;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    // Đóng cả singleton backend-core (worker có thể cùng process trong test).
    await this.$disconnect();
    await disconnectPrisma();
    this.logger.log('Prisma disconnected');
  }
}
