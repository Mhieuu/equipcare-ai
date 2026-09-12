import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AssetManualState } from '@equipcare/shared';

/**
 * DTO cho Asset CRUD — M2 (Doc02 §FR-ASSET-01..04).
 *
 * - code: mã nghiệp vụ (unique), không đổi sau khi tạo.
 * - asset_type_id / department_id / location_id: FK Restrict (Doc04 §5.3).
 * - specifications: JSON tùy ý (Doc02 §FR-ASSET-01: technical specs).
 *   Validate ngữ nghĩa (vd specs.power_kw) do service handle.
 *
 * Code pattern: 2-50 ký tự, chữ hoa + số + . _ - (vd 'PUMP-A-001').
 */
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,49}$/;

// =============================================================================
// Create / Update
// =============================================================================

export class CreateAssetDto {
  @ApiProperty({ example: 'PUMP-A-001' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(CODE_PATTERN, { message: 'code chỉ chứa chữ hoa, số, . _ -' })
  code!: string;

  @ApiProperty({ example: 'Bơm ly tâm số 1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty()
  @IsUUID()
  assetTypeId!: string;

  @ApiProperty()
  @IsUUID()
  departmentId!: string;

  @ApiProperty()
  @IsUUID()
  locationId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierName?: string;

  @ApiPropertyOptional({ description: 'ISO date YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  purchasedOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  commissionedOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  warrantyUntil?: string;

  @ApiPropertyOptional({
    description: 'Specifications JSON (vd {power_kw: 75, voltage: 380})',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  specifications?: Record<string, unknown>;
}

export class UpdateAssetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assetTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  purchasedOn?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  commissionedOn?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  warrantyUntil?: string | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  specifications?: Record<string, unknown>;
}

// =============================================================================
// Lifecycle (Doc02 §FR-ASSET-05 + FR-ASSET-07)
// =============================================================================

export class TransitionAssetStateDto {
  @ApiProperty({ enum: AssetManualState })
  @IsString()
  to!: AssetManualState;

  @ApiPropertyOptional({ description: 'Bắt buộc khi RETIRED (FR-ASSET-07)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// =============================================================================
// List query
// =============================================================================

export class ListAssetsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assetTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ enum: AssetManualState })
  @IsOptional()
  manualState?: AssetManualState;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  limit?: number = 50;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  offset?: number = 0;
}
