import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * DTO cho POST /iam/users/:id/roles — grant role cho user.
 *
 * - roleId: FK roles.id.
 * - Khi tạo user_role mới, mặc định is_active=true, granted_by=currentUser.
 * - Scope riêng (department/location/asset/incident) sẽ làm ở bước sau.
 */
export class GrantRoleDto {
  @ApiProperty()
  @IsUUID()
  roleId!: string;
}
