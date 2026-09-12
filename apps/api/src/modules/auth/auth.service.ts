import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Prisma, type sessions } from '@prisma/client';
import { AppError, writeAudit } from '@equipcare/backend-core';
import { PrismaService } from '../../prisma/prisma.service.js';
import { generateRefreshToken, hashRefreshToken } from '../../common/utils/crypto.util.js';
import type { AuthTokenDto } from './dto/auth-token.dto.js';

/**
 * Refresh token lifetime: 14 ngày (Doc02 §FR-AUTH-02).
 * Đủ dài cho UX "stay logged in", ngắn để giảm blast radius khi lộ.
 */
const REFRESH_TTL_DAYS = 14;

/**
 * AuthService — login, refresh, logout, change-password (Doc02 §7).
 *
 * Quy tắc nghiệp vụ:
 * - login: chỉ check password hash, không check mustChangePassword ở đây
 *   (cho user vào hệ thống để đổi password; guard khác chặn các endpoint
 *   cần auth nếu mustChangePassword=true — sẽ làm ở M1.B tiếp).
 * - refresh: rotate (revoke session cũ, issue session mới), revoke cascade nếu
 *   `auth_version` user tăng (password change → tất cả session cũ chết).
 * - logout: revoke session hiện tại.
 * - change-password: verify current + bcrypt new + increment auth_version
 *   + revoke tất cả session còn lại (Doc02 §NFR-SEC-01).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly bcryptCost = 10;
  private readonly accessTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.accessTtlSeconds = Number(this.config.get<number>('ACCESS_TOKEN_TTL') ?? 900);
  }

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------

  async login(
    loginName: string,
    password: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ token: AuthTokenDto; refreshToken: string }> {
    const user = await this.prisma.users.findUnique({
      where: { login_name: loginName },
    });

    if (!user || user.is_locked) {
      // KHÔNG phân biệt "không tồn tại" vs "sai mật khẩu" — chống enumeration.
      throw AppError.unauthorized('Sai tên đăng nhập hoặc mật khẩu');
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      // Audit: login fail (chống brute-force investigation, Doc02 §NFR-AUDIT-02).
      await writeAudit({
        actorType: 'USER',
        action: 'auth.login.failed',
        objectType: 'User',
        objectKey: user.id,
        newValue: { reason: 'bad_password' },
        note: `login_name=${loginName}`,
      });
      throw AppError.unauthorized('Sai tên đăng nhập hoặc mật khẩu');
    }

    const accessToken = await this.signAccessToken({
      sub: user.id,
      ver: user.auth_version,
    });
    const refreshToken = generateRefreshToken();
    await this.createSession(user.id, user.auth_version, refreshToken, meta);

    // Audit: login success.
    await writeAudit({
      actorId: user.id,
      actorType: 'USER',
      action: 'auth.login.success',
      objectType: 'User',
      objectKey: user.id,
    });

    return {
      token: {
        accessToken,
        expiresIn: this.accessTtlSeconds,
        mustChangePassword: user.must_change_password,
      },
      refreshToken,
    };
  }

  // -------------------------------------------------------------------------
  // Refresh (rotate)
  // -------------------------------------------------------------------------

  async refresh(
    refreshToken: string,
    _meta: { ip?: string; userAgent?: string },
  ): Promise<{ token: AuthTokenDto; refreshToken: string }> {
    const tokenHash = hashRefreshToken(refreshToken);
    const session = await this.prisma.sessions.findUnique({
      where: { token_hash: tokenHash },
      include: { user: true },
    });

    if (!session) {
      throw AppError.unauthorized('Refresh token không hợp lệ');
    }
    if (session.revoked_at !== null) {
      throw AppError.unauthorized('Refresh token đã bị thu hồi');
    }
    if (session.expires_at.getTime() < Date.now()) {
      throw AppError.unauthorized('Refresh token đã hết hạn');
    }
    if (session.user.is_locked) {
      throw AppError.forbidden('Tài khoản đã bị khóa');
    }
    if (session.auth_version !== session.user.auth_version) {
      // Password đã đổi → session cũ vô hiệu.
      await this.prisma.sessions.update({
        where: { id: session.id },
        data: { revoked_at: new Date() },
      });
      throw AppError.unauthorized('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
    }

    // Rotate: revoke session cũ, issue session mới trong 1 transaction.
    const newRefresh = generateRefreshToken();
    const newTokenHash = hashRefreshToken(newRefresh);
    const newExpires = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.sessions.update({
        where: { id: session.id },
        data: { revoked_at: new Date() },
      });
      await tx.sessions.create({
        data: {
          user_id: session.user_id,
          token_hash: newTokenHash,
          expires_at: newExpires,
          auth_version: session.user.auth_version,
        },
      });
    });

    const accessToken = await this.signAccessToken({
      sub: session.user_id,
      ver: session.user.auth_version,
    });

    return {
      token: {
        accessToken,
        expiresIn: this.accessTtlSeconds,
        mustChangePassword: session.user.must_change_password,
      },
      refreshToken: newRefresh,
    };
  }

  // -------------------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------------------

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    // Idempotent: không lỗi nếu session không tồn tại / đã revoke.
    await this.prisma.sessions.updateMany({
      where: { token_hash: tokenHash, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  // -------------------------------------------------------------------------
  // Change password
  // -------------------------------------------------------------------------

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      throw AppError.unauthorized('Không tìm thấy tài khoản');
    }

    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) {
      throw AppError.unauthorized('Mật khẩu hiện tại không đúng');
    }

    const sameAsOld = await bcrypt.compare(newPassword, user.password_hash);
    if (sameAsOld) {
      throw AppError.unprocessable(
        'AUTH_PASSWORD_REUSED',
        'Mật khẩu mới phải khác mật khẩu hiện tại',
      );
    }

    const newHash = await bcrypt.hash(newPassword, this.bcryptCost);
    const newAuthVersion = user.auth_version + 1;

    // Revoke TẤT CẢ session còn sống + cập nhật hash + auth_version + clear
    // must_change_password trong 1 transaction. Sau đó user phải login lại.
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.sessions.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      await tx.users.update({
        where: { id: userId },
        data: {
          password_hash: newHash,
          auth_version: newAuthVersion,
          must_change_password: false,
        },
      });
    });

    this.logger.log(`user ${userId} changed password (auth_version → ${newAuthVersion})`);
    // Audit: change password (Doc02 §NFR-AUDIT-01).
    await writeAudit({
      actorId: userId,
      actorType: 'USER',
      action: 'auth.change-password',
      objectType: 'User',
      objectKey: userId,
      newValue: { authVersion: newAuthVersion, sessionsRevoked: true },
    });
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async signAccessToken(payload: { sub: string; ver: number }): Promise<string> {
    return this.jwt.signAsync(payload, {
      expiresIn: this.accessTtlSeconds,
      issuer: 'equipcare-api',
      audience: 'equipcare-web',
    });
  }

  private async createSession(
    userId: string,
    authVersion: number,
    refreshToken: string,
    _meta: { ip?: string; userAgent?: string },
  ): Promise<sessions> {
    return this.prisma.sessions.create({
      data: {
        user_id: userId,
        token_hash: hashRefreshToken(refreshToken),
        expires_at: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000),
        auth_version: authVersion,
      },
    });
  }
}
