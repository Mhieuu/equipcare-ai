import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AppError } from '@equipcare/backend-core';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import type { GrantRoleDto } from './dto/grant-role.dto.js';
import type {
  UserDetailDto,
  UserListResponseDto,
  UserSummaryDto,
} from './dto/user-response.dto.js';
import type { MePermissionsDto, RoleInfoDto } from './dto/iam-response.dto.js';
import type { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import type { AuthenticatedUser } from '../../common/types/auth-user.type.js';

const BCRYPT_COST = 10;

/**
 * IamService — user + role + permission management (M1.C).
 *
 * Quy tắc nghiệp vụ (Doc02 §FR-IAM + Doc03 RBAC matrix):
 * - createUser: hash password, is_locked=false, must_change_password=true.
 * - updateUser: KHÔNG cho đổi login_name / password_hash qua PATCH.
 * - resetPassword: hash new, tăng auth_version, revoke all sessions, trả
 *   plaintext 1 lần.
 * - lockUser / unlockUser: toggle is_locked, revoke sessions khi lock.
 * - grantRole: tạo user_role (idempotent — nếu đã có role đó active thì không
 *   tạo lại, trả về user_role hiện tại).
 * - revokeRole: set is_active=false, revoked_at=now.
 *
 * Mọi write operation đều ghi granted_by = currentUser (audit Doc02 §NFR-AUDIT-01).
 */
@Injectable()
export class IamService {
  private readonly logger = new Logger(IamService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------

  async listUsers(query: ListUsersQueryDto): Promise<UserListResponseDto> {
    const where: Prisma.usersWhereInput = {};
    if (query.isActive === true) {
      where.is_locked = false;
    } else if (query.isActive === false) {
      where.is_locked = true;
    }
    if (query.departmentId) {
      where.department_id = query.departmentId;
    }
    if (query.search) {
      where.OR = [
        { login_name: { contains: query.search, mode: 'insensitive' } },
        { full_name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.users.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.users.count({ where }),
    ]);

    return {
      items: items.map(this.toSummary),
      total,
      limit,
      offset,
    };
  }

  async getUserById(userId: string): Promise<UserDetailDto> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      include: {
        user_roles: {
          include: {
            role: true,
          },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    if (!user) throw AppError.notFound('Không tìm thấy người dùng');
    return this.toDetail(user);
  }

  async createUser(dto: CreateUserDto, actorId: string): Promise<UserSummaryDto> {
    // Check unique login_name (Prisma sẽ throw P2002 nếu trùng — nhưng check sớm
    // để trả 409 message thân thiện).
    const exists = await this.prisma.users.findUnique({ where: { login_name: dto.loginName } });
    if (exists) {
      throw AppError.conflict('loginName đã tồn tại', { field: 'loginName' });
    }

    const passwordHash = await bcrypt.hash(dto.initialPassword, BCRYPT_COST);
    try {
      const user = await this.prisma.users.create({
        data: {
          login_name: dto.loginName,
          full_name: dto.fullName,
          email: dto.email,
          department_id: dto.departmentId,
          password_hash: passwordHash,
          is_locked: false,
          must_change_password: true,
          auth_version: 1,
        },
      });
      this.logger.log(`user ${user.id} created by actor ${actorId}`);
      return this.toSummary(user);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw AppError.unprocessable(
          'IAM_DEPARTMENT_NOT_FOUND',
          'departmentId không tồn tại',
          { field: 'departmentId' },
        );
      }
      throw err;
    }
  }

  async updateUser(userId: string, dto: UpdateUserDto): Promise<UserSummaryDto> {
    const data: Prisma.usersUpdateInput = {};
    if (dto.fullName !== undefined) data.full_name = dto.fullName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.departmentId !== undefined) {
      data.department = dto.departmentId === null
        ? { disconnect: true }
        : { connect: { id: dto.departmentId } };
    }
    if (Object.keys(data).length === 0) {
      throw AppError.unprocessable(
        'IAM_NO_FIELDS_TO_UPDATE',
        'Không có trường nào để cập nhật',
      );
    }

    try {
      const user = await this.prisma.users.update({
        where: { id: userId },
        data,
      });
      return this.toSummary(user);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') throw AppError.notFound('Không tìm thấy người dùng');
        if (err.code === 'P2003') {
          throw AppError.unprocessable(
            'IAM_DEPARTMENT_NOT_FOUND',
            'departmentId không tồn tại',
            { field: 'departmentId' },
          );
        }
      }
      throw err;
    }
  }

  async lockUser(userId: string, actorId: string): Promise<UserSummaryDto> {
    return this.toggleLock(userId, actorId, true);
  }

  async unlockUser(userId: string, actorId: string): Promise<UserSummaryDto> {
    return this.toggleLock(userId, actorId, false);
  }

  /**
   * Admin reset password — Doc02 §FR-IAM-04.
   * Trả plaintext 1 lần; revoke all sessions của user đó.
   */
  async resetPassword(
    userId: string,
    newPassword: string,
    actorId: string,
  ): Promise<{ temporaryPassword: string; userId: string }> {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('Không tìm thấy người dùng');

    const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    const newAuthVersion = user.auth_version + 1;

    await this.prisma.$transaction(async (tx) => {
      await tx.sessions.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      await tx.users.update({
        where: { id: userId },
        data: {
          password_hash: newHash,
          auth_version: newAuthVersion,
          must_change_password: true,
        },
      });
    });

    this.logger.log(
      `user ${userId} password reset by actor ${actorId} (auth_version → ${newAuthVersion})`,
    );
    return { temporaryPassword: newPassword, userId };
  }

  // -------------------------------------------------------------------------
  // Roles (grant / revoke)
  // -------------------------------------------------------------------------

  async grantRole(
    userId: string,
    dto: GrantRoleDto,
    actorId: string,
  ): Promise<{ userRoleId: string; roleCode: string }> {
    // Verify user tồn tại + role tồn tại.
    const [user, role] = await Promise.all([
      this.prisma.users.findUnique({ where: { id: userId } }),
      this.prisma.roles.findUnique({ where: { id: dto.roleId } }),
    ]);
    if (!user) throw AppError.notFound('Không tìm thấy người dùng');
    if (!role) throw AppError.notFound('Không tìm thấy vai trò');

    // Idempotent: nếu đã có user_role active cho (user, role) thì trả về id đó.
    const existing = await this.prisma.user_roles.findUnique({
      where: { user_id_role_id: { user_id: userId, role_id: dto.roleId } },
    });
    if (existing) {
      if (existing.is_active && !existing.revoked_at) {
        return { userRoleId: existing.id, roleCode: role.code };
      }
      // Đã revoke trước đó → reactivate.
      const reactivated = await this.prisma.user_roles.update({
        where: { id: existing.id },
        data: {
          is_active: true,
          revoked_at: null,
          granted_by: actorId,
        },
      });
      return { userRoleId: reactivated.id, roleCode: role.code };
    }

    const created = await this.prisma.user_roles.create({
      data: {
        user_id: userId,
        role_id: dto.roleId,
        is_active: true,
        granted_by: actorId,
      },
    });
    this.logger.log(`role ${role.code} granted to user ${userId} by actor ${actorId}`);
    return { userRoleId: created.id, roleCode: role.code };
  }

  async revokeRole(userId: string, userRoleId: string, actorId: string): Promise<void> {
    const userRole = await this.prisma.user_roles.findUnique({ where: { id: userRoleId } });
    if (!userRole || userRole.user_id !== userId) {
      throw AppError.notFound('Không tìm thấy user_role');
    }
    if (!userRole.is_active || userRole.revoked_at !== null) {
      // Idempotent — không lỗi nếu đã revoke.
      return;
    }
    await this.prisma.user_roles.update({
      where: { id: userRoleId },
      data: { is_active: false, revoked_at: new Date() },
    });
    this.logger.log(`user_role ${userRoleId} revoked by actor ${actorId}`);
  }

  // -------------------------------------------------------------------------
  // Permissions / Roles (read-only)
  // -------------------------------------------------------------------------

  async listRoles(): Promise<RoleInfoDto[]> {
    const roles = await this.prisma.roles.findMany({ orderBy: { code: 'asc' } });
    return roles.map((r) => ({ id: r.id, code: r.code, name: r.name }));
  }

  async listPermissions(): Promise<string[]> {
    const perms = await this.prisma.permissions.findMany({ orderBy: { code: 'asc' } });
    return perms.map((p) => p.code);
  }

  mePermissions(user: AuthenticatedUser): MePermissionsDto {
    return {
      roles: user.roles ?? [],
      permissions: user.permissions ?? [],
      scopes: user.scopes ?? [],
    };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async toggleLock(
    userId: string,
    actorId: string,
    locked: boolean,
  ): Promise<UserSummaryDto> {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('Không tìm thấy người dùng');

    await this.prisma.$transaction(async (tx) => {
      await tx.users.update({
        where: { id: userId },
        data: { is_locked: locked },
      });
      if (locked) {
        // Khóa user → revoke mọi session còn active.
        await tx.sessions.updateMany({
          where: { user_id: userId, revoked_at: null },
          data: { revoked_at: new Date() },
        });
      }
    });

    this.logger.log(`user ${userId} ${locked ? 'locked' : 'unlocked'} by actor ${actorId}`);
    return this.toSummary({ ...user, is_locked: locked });
  }

  private toSummary(u: {
    id: string;
    login_name: string;
    full_name: string;
    email: string | null;
    department_id: string | null;
    is_locked: boolean;
    must_change_password: boolean;
    auth_version: number;
    created_at: Date;
    updated_at: Date;
  }): UserSummaryDto {
    return {
      id: u.id,
      loginName: u.login_name,
      fullName: u.full_name,
      email: u.email,
      departmentId: u.department_id,
      isLocked: u.is_locked,
      mustChangePassword: u.must_change_password,
      authVersion: u.auth_version,
      createdAt: u.created_at.toISOString(),
      updatedAt: u.updated_at.toISOString(),
    };
  }

  private toDetail(
    user: {
      id: string;
      login_name: string;
      full_name: string;
      email: string | null;
      department_id: string | null;
      is_locked: boolean;
      must_change_password: boolean;
      auth_version: number;
      created_at: Date;
      updated_at: Date;
      user_roles: Array<{
        id: string;
        is_active: boolean;
        granted_by: string | null;
        created_at: Date;
        role: { code: string; name: string };
      }>;
    },
  ): UserDetailDto {
    const summary = this.toSummary(user);
    return {
      ...summary,
      roles: user.user_roles.map((ur) => ({
        userRoleId: ur.id,
        roleCode: ur.role.code,
        roleName: ur.role.name,
        isActive: ur.is_active,
        grantedBy: ur.granted_by,
        grantedAt: ur.created_at.toISOString(),
      })),
    };
  }
}
