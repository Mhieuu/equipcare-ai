import { Module } from '@nestjs/common';
import { AssetController } from './asset.controller.js';
import { AssetService } from './asset.service.js';

/**
 * AssetModule — M2 (Doc02 §FR-ASSET-01..09).
 *
 * Permission:
 *   - Read  → 'asset:read'
 *   - Write → 'asset:create' / 'asset:update'
 *
 * Workflow đọc:
 *   - GET /assets                  → list + filter
 *   - GET /assets/:id              → detail + tabs (Tổng quan / Sự cố / WO / Tài liệu)
 *     (M3 sẽ thêm attachment; M4-M7 sẽ thêm WO/Incident tabs)
 *   - GET /assets/:id/qr           → QR PNG base64
 *
 * Workflow write:
 *   - POST /assets                 → tạo
 *   - PATCH /assets/:id            → sửa metadata
 *   - POST /assets/:id/lifecycle   → chuyển manual_state (RETIRED terminal)
 *
 * Permission guard global JwtAuthGuard bảo đảm Bearer token; PermissionGuard
 * đọc @Permissions('xxx') cho mỗi route.
 */
@Module({
  controllers: [AssetController],
  providers: [AssetService],
  exports: [AssetService],
})
export class AssetModule {}
