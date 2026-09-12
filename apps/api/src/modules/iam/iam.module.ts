import { Module } from '@nestjs/common';
import { IamController } from './iam.controller.js';
import { IamService } from './iam.service.js';

/**
 * IamModule — user + role + permission management (M1.C).
 *
 * JwtAuthGuard + PermissionGuard được apply qua @UseGuards trên controller
 * (không global) để tránh check permission cho /iam/me/permissions và các
 * endpoint public khác.
 *
 * AuthModule phải được import (qua AppModule) để cung cấp JwtStrategy,
 * AuthenticatedUser type — nhưng vì đã global qua APP_GUARD JwtAuthGuard nên
 * IamService chỉ cần PrismaService (qua @Global PrismaModule) là đủ.
 */
@Module({
  controllers: [IamController],
  providers: [IamService],
  exports: [IamService],
})
export class IamModule {}
