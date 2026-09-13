import { IsOptional, IsString, IsIn, IsNumber, Min } from 'class-validator';
import { CostCategory, CostDirection } from '@equipcare/shared';

export class CreateCostEntryDto {
  @IsString()
  @IsIn(Object.values(CostCategory))
  category!: CostCategory;

  @IsOptional()
  @IsString()
  @IsIn(Object.values(CostDirection))
  direction?: CostDirection;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsString()
  approvalRevisionId?: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  occurredAt?: string; // ISO timestamp; default now
}
