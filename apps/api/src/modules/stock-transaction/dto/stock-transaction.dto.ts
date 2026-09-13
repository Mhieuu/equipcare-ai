import {
  IsNumber,
  IsString,
  IsUUID,
  IsOptional,
  MaxLength,
  Min,
  IsDateString,
} from 'class-validator';

export class RecordStockMovementDto {
  @IsUUID()
  partId!: string;

  /** So luong: RECEIPT > 0; ADJUSTMENT co the am. */
  @IsNumber()
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceNote?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class IssuePartDto {
  @IsUUID()
  partId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceNote?: string;
}

export class ReturnPartDto {
  @IsUUID()
  originalStockTxId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListStockTransactionsQueryDto {
  @IsOptional()
  @IsUUID()
  partId?: string;

  @IsOptional()
  @IsUUID()
  workOrderId?: string;
}
