import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Common code pattern cho organization entities:
 *  - department code: 2-30 ký tự, không dấu cách (VD 'HC', 'KT', 'SC').
 *  - location code: 2-40 ký tự (VD 'HN-HQ-01', 'HCM-DC-A').
 *  - asset_type code: 2-40 ký tự (VD 'PUMP-CENTRIFUGAL', 'MOTOR-AC').
 *
 * Quy tắc Doc04: code là mã nghiệp vụ, không đổi sau khi tạo.
 */
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,49}$/;

// =============================================================================
// Department
// =============================================================================

export class CreateDepartmentDto {
  @ApiProperty({ example: 'HC' })
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  @Matches(CODE_PATTERN, { message: 'code chỉ chứa chữ hoa, số, . _ -' })
  code!: string;

  @ApiProperty({ example: 'Phòng Hành chính' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;
}

export class UpdateDepartmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// =============================================================================
// Location
// =============================================================================

export class CreateLocationDto {
  @ApiProperty({ example: 'HN-HQ' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(CODE_PATTERN, { message: 'code chỉ chứa chữ hoa, số, . _ -' })
  code!: string;

  @ApiProperty({ example: 'Trụ sở chính Hà Nội' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ required: false, description: 'FK locations.id (null = root)' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateLocationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ description: 'FK locations.id; null = đưa về root' })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// =============================================================================
// Asset type
// =============================================================================

export class CreateAssetTypeDto {
  @ApiProperty({ example: 'PUMP-CENTRIFUGAL' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(CODE_PATTERN, { message: 'code chỉ chứa chữ hoa, số, . _ -' })
  code!: string;

  @ApiProperty({ example: 'Bơm ly tâm' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateAssetTypeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// =============================================================================
// List query (chung)
// =============================================================================

export class ListOrgQueryDto {
  @ApiPropertyOptional({ default: 200, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  limit?: number = 200;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  offset?: number = 0;

  @ApiPropertyOptional({ description: 'Lọc entity active' })
  @IsOptional()
  isActive?: boolean;
}
