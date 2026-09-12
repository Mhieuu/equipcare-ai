import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { envValidationSchema } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { HealthModule } from './modules/health/health.module.js';

/**
 * AppModule — M1 Foundation.
 *
 * Wiring:
 * - ConfigModule: global, validate env qua Joi, fail-fast nếu thiếu secret.
 * - PrismaModule: global, cung cấp PrismaService cho mọi module con.
 * - HttpExceptionFilter: global, map AppError + Prisma errors → ApiErrorBody chuẩn.
 * - HealthModule: /healthz, /healthz/live, /healthz/ready (ping DB).
 *
 * M1.B tiếp theo sẽ import AuthModule, IamModule, OrganizationModule.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: true,
        // Không in full env vì có secret; chỉ in message.
        allowUnknown: true,
      },
    }),
    PrismaModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
