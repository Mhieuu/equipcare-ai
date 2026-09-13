import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Permission } from '@equipcare/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
 * Note: Mock provider default. AI_PROVIDER=openai cần thêm OpenAI client (chưa
 *       triển khai ở M4; chừa interface sẵn).
 */
@Controller('ai')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AiController {
  constructor(private readonly service: AiService) {}

  @Post('incidents/:id/analyze')
  @Permissions(Permission.INCIDENT_TRIAGE)
  @HttpCode(202)
  analyzeIncident(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    // Controller không set status code (default 201). Service layer wraps trả 200,
    // nhưng ta muốn 202 (Doc05 §10.1). Dùng HttpCode trực tiếp.
    return this.service.submitIncidentTriage(user.sub, id);
  }

  @Get('requests/:id')
  @Permissions(Permission.INCIDENT_READ)
  getRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.getRequest(id, user.sub);
  }
}
