import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller.js';
import { ConfigService } from './config.service.js';

/**
 * ConfigModule — system_settings (M1.C).
 *
 * Permission:
 *   - Read  → chỉ cần Bearer token (JwtAuthGuard)
 *   - Write → 'system-config:update' (PermissionGuard)
 *
 * Lý do đọc public: frontend cần đọc settings (vd near_expiry_hours) trước
 * khi render inbox. Audit Doc02 §FR-CFG-01.
 */
@Module({
  controllers: [ConfigController],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class SystemConfigModule {}
