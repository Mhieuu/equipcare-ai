import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsString } from 'class-validator';

/**
 * DTO cho POST /iam/users/:id/roles — grant role cho user.
 *
 * - roleId: FK roles.id.
 * - Khi tạo user_role mới, mặc định is_active=true, granted_by=currentUser.
 * - Scope riêng (department/location/asset/incident) sẽ làm ở bước sau.
 */
export class GrantRoleDto {
  @ApiPropertyOptional({ description: 'FK roles.id' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ description: 'Mã vai trò (role.code), thay thế cho roleId' })
  @IsOptional()
  @IsString()
  roleCode?: string;
}
