import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO cho PUT /system-settings/:key.
 *
 * Doc02 §FR-CFG-01:
 *  - key: dot.notation (vd 'approval.near_expiry_hours', 'asset.retirement.grace_days')
 *  - value: JSON bất kỳ (number, string, boolean, object, array).
 *
 * Lý do dùng `any`: setting có thể là bất kỳ kiểu nào. Validate ngữ nghĩa
 * (vd near_expiry_hours phải ≥ 1) sẽ check ở Service theo `key` cụ thể.
 */
export class UpdateSystemSettingDto {
  @ApiProperty({ description: 'Giá trị JSON mới (number/string/bool/object/array)' })
  @IsObject()
  value!: unknown;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

/**
 * DTO cho POST /system-settings — tạo mới (admin).
 */
export class CreateSystemSettingDto {
  @ApiProperty({ example: 'approval.near_expiry_hours' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  key!: string;

  @ApiProperty()
  @IsObject()
  value!: unknown;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;
}
