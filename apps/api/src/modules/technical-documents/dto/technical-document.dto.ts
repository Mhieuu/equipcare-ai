import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { DocumentType } from '@equipcare/shared';

/**
 * DTO cho Technical Documents — M3 (Doc04 §5.6, plan §12.2 M3).
 *
 * Workflow (SCR-DOC-01..05):
 *   1. POST /technical-documents                 → tạo metadata.
 *   2. POST /technical-documents/:id/versions    → upload file version mới.
 *   3. POST /technical-documents/:id/roles       → grant role access (per-doc RBAC).
 *   4. GET  /technical-documents/:id             → chi tiết + version hiện tại.
 *   5. PATCH /technical-documents/:id            → update metadata.
 *   6. DELETE /technical-documents/:id           → soft deactivate (is_active=false).
 */

const TYPES = Object.values(DocumentType);

export class CreateTechnicalDocumentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ enum: TYPES })
  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'UUID asset (nếu gắn vào 1 asset cụ thể)' })
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @ApiPropertyOptional({ description: 'UUID asset_type (nếu gắn cho cả loại)' })
  @IsOptional()
  @IsUUID()
  assetTypeId?: string;
}

export class UpdateTechnicalDocumentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ enum: TYPES })
  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assetId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assetTypeId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AddVersionDto {
  @ApiProperty({ description: 'fileId đã upload qua POST /files' })
  @IsUUID()
  fileId!: string;

  @ApiPropertyOptional({ description: 'Ghi chú phiên bản (vd "Cập nhật bản vẽ mới")' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}

export class GrantRoleAccessDto {
  @ApiProperty()
  @IsUUID()
  roleId!: string;
}
