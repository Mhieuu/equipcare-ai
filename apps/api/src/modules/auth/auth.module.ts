import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';

/**
 * AuthModule — login / refresh / logout / change-password (M1.B).
 *
 * JwtModule registerAsync để đọc secret từ ConfigService (đã validate Joi ở M1.B
 * Foundation, fail-fast nếu thiếu JWT_ACCESS_SECRET).
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_ACCESS_SECRET');
        if (!secret) {
          throw new Error('JWT_ACCESS_SECRET chưa được cấu hình');
        }
        return {
          secret,
          signOptions: {
            issuer: 'equipcare-api',
            audience: 'equipcare-web',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtStrategy, PassportModule],
})
export class AuthModule {}
