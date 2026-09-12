import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AttachmentController } from './attachment.controller.js';
import { AttachmentService } from './attachment.service.js';

/**
 * AttachmentModule — M3 (Doc04 §5.6, plan §12.2 M3).
 *
 * Permission:
 *   - Read  → 'attachment:read' (lấy thông tin + download)
 *   - Write → 'attachment:upload' (upload + link + unlink)
 *
 * Storage:
 *   - M3: LocalFsAdapter (đường dẫn `{cwd}/var/storage/` hoặc LOCAL_STORAGE_DIR).
 *   - P1 production: thay bằng S3Adapter (MinIO) qua cùng interface
 *     `StorageAdapter` ở backend-core.
 *
 * Cron cleanup: gọi `AttachmentService.cleanupStaged()` từ worker
 * (sẽ wire ở M3/M10 cùng với scheduler).
 */
@Module({
  imports: [ConfigModule],
  controllers: [AttachmentController],
  providers: [AttachmentService],
  exports: [AttachmentService],
})
export class AttachmentModule {}
