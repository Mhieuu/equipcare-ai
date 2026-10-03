import { ApiProperty } from '@nestjs/swagger';
import { Permission } from '@equipcare/shared';

/**
 * Response cho GET /iam/permissions — list toàn bộ permission codes.
 */
export class PermissionsListDto {
  @ApiProperty({ type: [String], description: 'Tất cả permission codes hiện có' })
  codes!: string[];
}

export class RoleInfoDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  code!: string;
  @ApiProperty()
  name!: string;
}

/**
 * Thông tin người dùng hiện tại trả về cho frontend.
 */
export class MeUserDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  loginName!: string;
  @ApiProperty()
  fullName!: string;
  @ApiProperty({ nullable: true })
  email!: string | null;
}

/**
 * Response cho GET /iam/me/permissions — context của current user.
 * Frontend dùng để ẩn/hiện menu, check trước khi gọi API, và hydrate user store.
 */
export class MePermissionsDto {
  @ApiProperty({ type: MeUserDto })
  user!: MeUserDto;
  @ApiProperty({ type: [String] })
  roles!: string[];
  @ApiProperty({
    type: [String],
    description: 'Permission codes hiện có (union từ mọi role active)',
  })
  permissions!: (typeof Permission)[keyof typeof Permission][];
  @ApiProperty({
    description: 'Scope objects per user_role. Rỗng nếu admin (không có scope).',
  })
  scopes!: unknown[];
}
