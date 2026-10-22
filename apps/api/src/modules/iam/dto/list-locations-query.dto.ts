import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Query DTO cho GET /iam/locations
 */
export class ListLocationsQueryDto {
  @ApiPropertyOptional({ description: 'Lọc location active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
