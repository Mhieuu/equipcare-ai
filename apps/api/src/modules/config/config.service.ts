import { Injectable, Logger } from '@nestjs/common';
import { AppError, writeAudit } from '@equipcare/backend-core';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateSystemSettingDto, UpdateSystemSettingDto } from './dto/config.dto.js';

/**
 * ConfigService — system_settings (M1.C).
 *
 * Lưu trữ key-value dùng cho ngưỡng nghiệp vụ:
 *   - approval.near_expiry_hours (default 4)
 *   - sla.incident.response_hours (per priority)
 *   - notification.retry.max
 *   - ...
 *
 * Quy tắc Doc02 §FR-CFG-01:
 *   - GET /system-settings           → public (mọi user đều đọc được)
 *   - GET /system-settings/:key      → public
 *   - PUT /system-settings/:key      → admin (system-config:update)
 *   - POST /system-settings          → admin (system-config:update)
 */
@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.system_settings.findMany({ orderBy: { key: 'asc' } });
  }

  get(key: string) {
    return this.prisma.system_settings.findUnique({ where: { key } });
  }

  async create(dto: CreateSystemSettingDto, actorId: string) {
    const exists = await this.prisma.system_settings.findUnique({ where: { key: dto.key } });
    if (exists) throw AppError.conflict('key đã tồn tại', { field: 'key' });

    const created = await this.prisma.system_settings.create({
      data: {
        key: dto.key,
        value: dto.value as object,
        description: dto.description,
        updated_by: actorId,
      },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'cfg.setting.create',
      objectType: 'SystemSetting',
      objectKey: created.key,
      newValue: { value: created.value, description: created.description },
    });
    return created;
  }

  async update(key: string, dto: UpdateSystemSettingDto, actorId: string) {
    const before = await this.prisma.system_settings.findUnique({ where: { key } });
    if (!before) throw AppError.notFound('Không tìm thấy setting');

    const updated = await this.prisma.system_settings.update({
      where: { key },
      data: {
        value: dto.value as object,
        description: dto.description ?? before.description,
        updated_by: actorId,
        // Tăng row_version (optimistic concurrency hint cho frontend).
        row_version: { increment: 1 },
      },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'cfg.setting.update',
      objectType: 'SystemSetting',
      objectKey: key,
      oldValue: { value: before.value, rowVersion: before.row_version },
      newValue: { value: updated.value, rowVersion: updated.row_version },
    });
    return updated;
  }
}
