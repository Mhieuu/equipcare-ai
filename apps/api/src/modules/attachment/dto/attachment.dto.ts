import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * DTO cho Attachment upload + link — M3 (Doc04 §5.6 + plan §12.2 M3).
 *
 * Flow (Doc04 §5.6, plan §12.2 M3):
 *   1. Multipart POST /files → upload + validate → trả `{fileId, state:'STAGED', sha256, sizeBytes, mime}`.
 *   2. POST /files/:fileId/link với LinkAttachmentDto → trong transaction:
 *      a) Insert `attachment_links` (đúng 1 parent — CHECK constraint bảo đảm).
 *      b) Update `files.storage_state = 'READY'`.
 *      c) Audit ghi.
 *   3. GET /files/:fileId/download → stream blob (qua PermissionGuard + scope check).
 *   4. DELETE /files/:fileId → set `is_active=false` (soft) trên link + nếu STAGED → xóa blob.
 *
 * Lưu ý:
 *   - Multipart upload không dùng class-validator cho file content (multer đọc Buffer).
 *     Validation nằm trong service qua `validateUpload()` (magic bytes, MIME, size).
 *   - Link DTO chỉ cho phép 1 parent khác null (CHECK constraint cũng bảo đảm,
 *     nhưng validate ở app để error rõ ràng cho user).
 */

/**
 * LinkAttachmentDto — link 1 file STAGED (hoặc đã READY tới parent khác? → M3 không cho phép,
 * 1 file = 1 link) vào 1 parent đúng.
 *
 * P1 Doc04: mỗi file chỉ gắn vào 1 parent duy nhất. Nếu cần dùng lại → upload mới.
 */
export class LinkAttachmentDto {
  @ApiPropertyOptional({ description: 'UUID asset — chính xác 1 trong 5 trường' })
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  incidentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  incidentMessageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  workOrderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  approvalRevisionId?: string;
}

/**
 * UploadResponseDto — response cho POST /files (multipart).
 */
export class UploadResponseDto {
  @ApiProperty() fileId!: string;
  @ApiProperty() objectKey!: string;
  @ApiProperty() originalName!: string;
  @ApiProperty() mime!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty() sha256!: string;
  @ApiProperty({ enum: ['STAGED'] })
  storageState!: 'STAGED';
  @ApiProperty({ description: 'Còn bao nhiêu giây trước khi worker dọn (nếu không link)' })
  ttlSeconds!: number;
}

/**
 * FileInfoDto — response cho GET /files/:id.
 */
export class FileInfoDto {
  @ApiProperty() fileId!: string;
  @ApiProperty() objectKey!: string;
  @ApiProperty() originalName!: string;
  @ApiProperty() mime!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty() sha256!: string;
  @ApiProperty({ enum: ['STAGED', 'READY', 'REJECTED'] })
  storageState!: string;
  link: {
    id: string;
    parentType: 'asset' | 'incident' | 'incident_message' | 'work_order' | 'approval_revision';
    parentId: string;
    linkedBy: string;
    linkedAt: string;
  } | null = null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() uploadedBy!: { id: string; loginName: string; fullName: string | null };
}
