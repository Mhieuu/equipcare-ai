import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Query DTO cho GET /iam/departments
 */
export class ListDepartmentsQueryDto {
  @ApiPropertyOptional({ description: 'Lọc department active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
