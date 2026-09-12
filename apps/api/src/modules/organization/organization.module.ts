import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller.js';
import { OrganizationService } from './organization.service.js';

/**
 * OrganizationModule — departments / locations / asset-types (M1.C).
 *
 * Permission:
 *   - Read  → iam:user:read
 *   - Write → iam:user:manage
 *
 * Lý do dùng iam:* (không tạo permission mới): các resource này hiện chỉ
 * admin cần edit; sau này mở rộng có thể tách 'org:*:manage'.
 */
@Module({
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
