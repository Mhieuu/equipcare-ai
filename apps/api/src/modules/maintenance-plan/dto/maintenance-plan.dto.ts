import {
  IsUUID,
  IsString,
  MaxLength,
  IsIn,
  IsInt,
  Min,
  IsDateString,
  IsOptional,
  IsArray,
  IsBoolean,
} from 'class-validator';
import {
  MaintenanceIntervalUnit,
  MaintenanceScheduleBasis,
} from '@equipcare/backend-core';

export class CreateMaintenancePlanDto {
  @IsUUID()
  assetId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsIn(Object.values(MaintenanceIntervalUnit))
  intervalUnit!: MaintenanceIntervalUnit;

  @IsInt()
  @Min(1)
  intervalValue!: number;

  /** ISO date (YYYY-MM-DD). */
  @IsDateString()
  startOn!: string;

  @IsOptional()
  @IsString()
  @IsIn(Object.values(MaintenanceScheduleBasis))
  scheduleBasis?: MaintenanceScheduleBasis;

  @IsOptional()
  @IsArray()
  checklist?: unknown[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateMaintenancePlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(Object.values(MaintenanceIntervalUnit))
  intervalUnit?: MaintenanceIntervalUnit;

  @IsOptional()
  @IsInt()
  @Min(1)
  intervalValue?: number;

  @IsOptional()
  @IsArray()
  checklist?: unknown[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  rowVersion?: string;
}

export class ListMaintenancePlansQueryDto {
  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  isActive?: string;
}
