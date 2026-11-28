import { Controller, Get, Post, Param, UseGuards, HttpCode, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Permission } from '@equipcare/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../../common/types/auth-user.type.js';
import { AiService } from './ai.service';

/**
 * AI endpoints (Doc02 §FR-AI-01..06, plan §12.2 M4).
 *
 *  - POST /ai/incidents/:id/analyze  → 202 { requestId, status }
 *  - GET  /ai/requests/:id           → { id, status, output?, errorCode? }
 *
 * Permission:
 *   INCIDENT_TRIAGE (gọi analyze) + INCIDENT_READ (poll).
 *
 * Note: Mock provider default. AI_PROVIDER=gemini dùng Google Gemini REST API
 *       (cần GEMINI_API_KEY).
 */
@Controller('ai')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AiController {
  constructor(private readonly service: AiService) {}

  @Post('incidents/:id/analyze')
  @Permissions(Permission.INCIDENT_TRIAGE)
  @HttpCode(202)
  // Mỗi lượt gọi Gemini đều tốn tiền — dùng ngưỡng `ai` (env RATE_LIMIT_AI_MAX).
  @Throttle({ ai: {} })
  analyzeIncident(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    // Controller không set status code (default 201). Service layer wraps trả 200,
    // nhưng ta muốn 202 (Doc05 §10.1). Dùng HttpCode trực tiếp.
    return this.service.submitIncidentTriage(user.sub, id);
  }

  @Post('assets/:id/summary')
  @Permissions(Permission.ASSET_READ)
  @HttpCode(202)
  // Tóm tắt tài sản cũng gọi Gemini — cùng ngưỡng với triage.
  @Throttle({ ai: {} })
  analyzeAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.submitAssetSummary(user.sub, id);
  }

  @Get('requests/:id')
  @Permissions(Permission.INCIDENT_READ, Permission.ASSET_READ)
  getRequest(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getRequest(id, user.sub);
  }
}
