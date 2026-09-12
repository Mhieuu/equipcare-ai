import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { envValidationSchema } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { IamModule } from './modules/iam/iam.module.js';
import { OrganizationModule } from './modules/organization/organization.module.js';
import { SystemConfigModule } from './modules/config/config.module.js';
import { AssetModule } from './modules/asset/asset.module.js';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard.js';

/**
 * AppModule — M1.B + Auth.
 *
 * Wiring:
 * - ConfigModule: global, validate env qua Joi, fail-fast nếu thiếu secret.
 * - PrismaModule: global, cung cấp PrismaService cho mọi module con.
 * - HttpExceptionFilter: global, map AppError + Prisma errors → ApiErrorBody chuẩn.
 * - HealthModule: /healthz, /healthz/live, /healthz/ready (ping DB).
 * - AuthModule: login / refresh / logout / change-password.
 * - APP_GUARD JwtAuthGuard: global, mọi route đều cần Bearer token trừ @Public().
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: true,
        allowUnknown: true,
      },
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    IamModule,
    OrganizationModule,
    SystemConfigModule,
    AssetModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
