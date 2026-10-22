import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Query DTO cho GET /iam/asset-types
 */
export class ListAssetTypesQueryDto {
  @ApiPropertyOptional({ description: 'Lọc asset type active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
