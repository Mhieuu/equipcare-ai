import {
  IsOptional,
  IsString,
  IsUUID,
  IsNumber,
  IsBoolean,
  MaxLength,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePartDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(30)
  unit!: string;

  @IsUUID()
  departmentId!: string;

  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  referencePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumStock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierName?: string;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}

export class UpdatePartDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  referencePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumStock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierName?: string;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  rowVersion?: string;
}

export class AdjustPartDto {
  /** So luong dieu chinh: positive = tang, negative = giam. */
  @IsNumber()
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  rowVersion?: string;
}

export class ListPartsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number;

  get take(): number {
    return this.limit ?? this.pageSize ?? 100;
  }

  get skip(): number {
    return this.offset ?? ((this.page ?? 1) - 1) * this.take;
  }

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  isActive?: string;

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  lowStock?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
