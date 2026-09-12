import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { IamService } from './iam.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { GrantRoleDto } from './dto/grant-role.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import {
  UserDetailDto,
  UserListResponseDto,
  UserSummaryDto,
  ResetPasswordResponseDto,
} from './dto/user-response.dto.js';
import {
  MePermissionsDto,
  PermissionsListDto,
  RoleInfoDto,
} from './dto/iam-response.dto.js';
import type { AuthenticatedUser } from '../../common/types/auth-user.type.js';

/**
 * IAM controller — Doc02 §FR-IAM + Doc03 RBAC matrix.
 *
 * Endpoints (Doc02 §7.4):
 * - GET    /iam/users                  → list + pagination
 * - POST   /iam/users                  → create
 * - GET    /iam/users/:id              → detail + roles
 * - PATCH  /iam/users/:id              → update fields
 * - POST   /iam/users/:id/reset-password → reset + revoke all sessions
 * - POST   /iam/users/:id/lock         → toggle is_locked
 * - POST   /iam/users/:id/unlock
 * - GET    /iam/roles                  → list roles
 * - GET    /iam/permissions            → list all permission codes
 * - POST   /iam/users/:id/roles        → grant role
 * - DELETE /iam/users/:id/roles/:userRoleId → revoke role
 * - GET    /iam/me/permissions         → current user permissions + scopes
 *
 * Mỗi endpoint đều có @Permissions() cụ thể (PermissionGuard check).
 */
@ApiTags('iam')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('iam')
export class IamController {
  constructor(private readonly iam: IamService) {}

  // -------------------------------------------------------------------------
  // /iam/me/* — bất kỳ user nào cũng xem được context của mình
  // -------------------------------------------------------------------------

  @Get('me/permissions')
  @ApiOperation({ summary: 'Quyền + scope của current user (frontend dùng để gate UI)' })
  @ApiResponse({ status: 200, type: MePermissionsDto })
  mePermissions(@CurrentUser() user: AuthenticatedUser): MePermissionsDto {
    return this.iam.mePermissions(user);
  }

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------

  @Get('users')
  @Permissions('iam:user:read')
  @ApiOperation({ summary: 'Danh sách user (paginated)' })
  @ApiResponse({ status: 200, type: UserListResponseDto })
  listUsers(@Query() query: ListUsersQueryDto): Promise<UserListResponseDto> {
    return this.iam.listUsers(query);
  }

  @Post('users')
  @Permissions('iam:user:manage')
  @ApiOperation({ summary: 'Tạo user mới' })
  @ApiResponse({ status: 201, type: UserSummaryDto })
  createUser(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserSummaryDto> {
    return this.iam.createUser(dto, actor.sub);
  }

  @Get('users/:id')
  @Permissions('iam:user:read')
  @ApiOperation({ summary: 'Chi tiết user + roles' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: UserDetailDto })
  getUser(@Param('id', new ParseUUIDPipe()) id: string): Promise<UserDetailDto> {
    return this.iam.getUserById(id);
  }

  @Patch('users/:id')
  @Permissions('iam:user:manage')
  @ApiOperation({ summary: 'Cập nhật full_name / email / department_id' })
  updateUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserSummaryDto> {
    return this.iam.updateUser(id, dto);
  }

  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Permissions('iam:user:manage')
  @ApiOperation({
    summary: 'Reset password — trả plaintext 1 lần, revoke all sessions',
  })
  @ApiResponse({ status: 200, type: ResetPasswordResponseDto })
  resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ResetPasswordResponseDto> {
    return this.iam.resetPassword(id, dto.newPassword, actor.sub);
  }

  @Post('users/:id/lock')
  @HttpCode(HttpStatus.OK)
  @Permissions('iam:user:manage')
  @ApiOperation({ summary: 'Khóa user (revoke sessions)' })
  lockUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserSummaryDto> {
    return this.iam.lockUser(id, actor.sub);
  }

  @Post('users/:id/unlock')
  @HttpCode(HttpStatus.OK)
  @Permissions('iam:user:manage')
  @ApiOperation({ summary: 'Mở khóa user' })
  unlockUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserSummaryDto> {
    return this.iam.unlockUser(id, actor.sub);
  }

  // -------------------------------------------------------------------------
  // Roles / Permissions (read-only)
  // -------------------------------------------------------------------------

  @Get('roles')
  @Permissions('iam:role:read')
  @ApiOperation({ summary: 'Danh sách vai trò' })
  @ApiResponse({ status: 200, type: [RoleInfoDto] })
  listRoles(): Promise<RoleInfoDto[]> {
    return this.iam.listRoles();
  }

  @Get('permissions')
  @Permissions('iam:role:read')
  @ApiOperation({ summary: 'Danh sách tất cả permission codes' })
  @ApiResponse({ status: 200, type: PermissionsListDto })
  async listPermissions(): Promise<PermissionsListDto> {
    return { codes: await this.iam.listPermissions() };
  }

  // -------------------------------------------------------------------------
  // Grant / Revoke role
  // -------------------------------------------------------------------------

  @Post('users/:id/roles')
  @HttpCode(HttpStatus.CREATED)
  @Permissions('iam:role:manage')
  @ApiOperation({ summary: 'Grant role cho user' })
  grantRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: GrantRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ userRoleId: string; roleCode: string }> {
    return this.iam.grantRole(id, dto, actor.sub);
  }

  @Delete('users/:id/roles/:userRoleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('iam:role:manage')
  @ApiOperation({ summary: 'Revoke role khỏi user' })
  revokeRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userRoleId', new ParseUUIDPipe()) userRoleId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.iam.revokeRole(id, userRoleId, actor.sub);
  }
}
