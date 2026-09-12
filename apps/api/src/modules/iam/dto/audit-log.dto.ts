import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/**
 * Query DTO cho GET /iam/audit-logs.
 *
 * Filter Doc02 §NFR-AUDIT-02:
 * - actorId, action (prefix match), objectType, objectKey
 * - from / to (date range, inclusive)
 * - pagination
 */
export class ListAuditLogsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Filter exact action code' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  objectType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  objectKey?: string;

  @ApiPropertyOptional({ description: 'ISO datetime, inclusive lower bound' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ description: 'ISO datetime, inclusive upper bound' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class AuditLogDto {
  @ApiProperty()
  id!: string;
  @ApiProperty({ nullable: true })
  actorId!: string | null;
  @ApiProperty()
  actorType!: string;
  @ApiProperty()
  action!: string;
  @ApiProperty()
  objectType!: string;
  @ApiProperty()
  objectKey!: string;
  @ApiProperty()
  oldValue!: unknown;
  @ApiProperty()
  newValue!: unknown;
  @ApiProperty({ nullable: true })
  note!: string | null;
  @ApiProperty()
  correlationKey!: string;
  @ApiProperty()
  createdAt!: string;
}

export class AuditLogListResponseDto {
  @ApiProperty({ type: [AuditLogDto] })
  items!: AuditLogDto[];
  @ApiProperty()
  total!: number;
  @ApiProperty()
  limit!: number;
  @ApiProperty()
  offset!: number;
}
