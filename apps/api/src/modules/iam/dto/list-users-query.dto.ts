import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query DTO cho GET /iam/users — pagination + filter.
 */
export class ListUsersQueryDto {
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

  @ApiPropertyOptional({ description: 'Lọc user active (chưa khóa, không DISABLED)' })
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Lọc theo department_id' })
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Tìm theo login_name / full_name / email (LIKE)' })
  @IsOptional()
  search?: string;
}
