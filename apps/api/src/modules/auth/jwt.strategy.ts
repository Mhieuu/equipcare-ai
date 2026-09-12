import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../../common/types/auth-user.type.js';

/**
 * JwtStrategy — verify access token từ header `Authorization: Bearer ...`.
 *
 * Token chứa:
 *   - sub: user.id
 *   - ver: user.auth_version (kiểm tra trong AuthService cho refresh; ở đây
 *     chỉ nhận payload, controller/service check thêm nếu cần).
 *   - iss/aud: kiểm tra để chống token của service khác.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
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

  validate(payload: { sub: string; ver: number; iat?: number; exp?: number }): AuthenticatedUser {
    return {
      sub: payload.sub,
      ver: payload.ver,
      iat: payload.iat,
      exp: payload.exp,
      typ: 'access',
    };
  }
}
