import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PermissionCode } from '@equipcare/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../../common/types/auth-user.type.js';

/**
 * JwtStrategy — verify access token từ header `Authorization: Bearer ...`
 * và load permission + scope của user để PermissionGuard dùng ngay.
 *
 * Token chứa:
 *   - sub: user.id
 *   - ver: user.auth_version (kiểm tra trong AuthService cho refresh; ở đây
 *     chỉ nhận payload, controller/service check thêm nếu cần).
 *   - iss/aud: kiểm tra để chống token của service khác.
 *
 * Lưu ý hiệu năng (Doc02 §NFR-PERF): Mỗi request phải query DB 1 lần để
 * load permissions. Có thể cache qua Redis ở M2 nếu load test thấy chậm.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET chưa được cấu hình');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      issuer: 'equipcare-api',
      audience: 'equipcare-web',
    });
  }

  /**
   * Payload từ JWT — load đầy đủ user + active roles + permissions + scopes.
   * Trả về AuthenticatedUser (mở rộng thêm permissions + scopes).
   */
  async validate(payload: {
    sub: string;
    ver: number;
    iat?: number;
    exp?: number;
  }): Promise<AuthenticatedUser> {
    // 1) Load user + roles + permissions + scopes trong 1 query.
    const user = await this.prisma.users.findUnique({
      where: { id: payload.sub },
      include: {
        user_roles: {
          where: { is_active: true, revoked_at: null },
          include: {
            role: {
              include: {
                role_permissions: { include: { permission: true } },
              },
            },
            access_scopes: { where: { is_active: true } },
          },
        },
      },
    });

    if (!user || user.is_locked) {
      throw new Error('User không tồn tại hoặc đã bị khóa');
    }

    // 2) Flatten permissions (union của mọi role active).
    const permissions: PermissionCode[] = Array.from(
      new Set(
        user.user_roles.flatMap((ur) =>
          ur.role.role_permissions.map((rp) => rp.permission.code as PermissionCode),
        ),
      ),
    );

    // 3) Build scope list — mỗi user_role có 1+ scope.
    const scopes = user.user_roles.map((ur) => ({
      userRoleId: ur.id,
      roleCode: ur.role.code,
      scopes: ur.access_scopes.map((s) => ({
        scopeType: s.scope_type,
        departmentId: s.department_id ?? undefined,
        locationId: s.location_id ?? undefined,
        assetId: s.asset_id ?? undefined,
        incidentId: s.incident_id ?? undefined,
      })),
    }));

    return {
      sub: user.id,
      ver: user.auth_version,
      iat: payload.iat,
      exp: payload.exp,
      typ: 'access',
      permissions,
      scopes,
      // Cache role codes cho quick check (`isInRole('ADMIN')`).
      roles: user.user_roles.map((ur) => ur.role.code),
    };
  }
}
