import { ApiProperty } from '@nestjs/swagger';

export class UserRoleInfoDto {
  @ApiProperty()
  userRoleId!: string;
  @ApiProperty()
  roleCode!: string;
  @ApiProperty()
  roleName!: string;
  @ApiProperty()
  isActive!: boolean;
  @ApiProperty({ nullable: true })
  grantedBy!: string | null;
  @ApiProperty({ nullable: true })
  grantedAt!: string | null;
}

export class UserSummaryDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  loginName!: string;
  @ApiProperty()
  fullName!: string;
  @ApiProperty({ nullable: true })
  email!: string | null;
  @ApiProperty({ nullable: true })
  departmentId!: string | null;
  @ApiProperty()
  isLocked!: boolean;
  @ApiProperty()
  mustChangePassword!: boolean;
  @ApiProperty()
  authVersion!: number;
  @ApiProperty()
  createdAt!: string;
  @ApiProperty()
  updatedAt!: string;
}

export class UserDetailDto extends UserSummaryDto {
  @ApiProperty({ type: [UserRoleInfoDto] })
  roles!: UserRoleInfoDto[];
}

export class UserListResponseDto {
  @ApiProperty({ type: [UserSummaryDto] })
  items!: UserSummaryDto[];
  @ApiProperty()
  total!: number;
  @ApiProperty()
  limit!: number;
  @ApiProperty()
  offset!: number;
}

export class ResetPasswordResponseDto {
  @ApiProperty({ description: 'Plaintext password — trả 1 lần, không lưu plaintext' })
  temporaryPassword!: string;
  @ApiProperty()
  userId!: string;
}
