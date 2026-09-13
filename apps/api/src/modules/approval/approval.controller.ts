import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Permission } from '@equipcare/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/auth-user.type.js';
import { ApprovalService } from './approval.service';
import {
  CreateApprovalDto,
  UpdateDraftApprovalDto,
  ApprovalActionDto,
  ListApprovalsQueryDto,
} from './dto/approval.dto';

/**
 * Approvals endpoints (Doc04 section 5.7).
 *
 * Permission map:
 *   APPROVAL_QUEUE_READ    : GET /approvals, /approvals/:id
 *   APPROVAL_CREATE        : POST /approvals (create draft)
 *   APPROVAL_UPDATE_DRAFT  : PATCH /approvals/:id/draft
 *   APPROVAL_SUBMIT        : PATCH /approvals/:id (SUBMITTED)
 *   APPROVAL_REQUEST_INFO  : PATCH /approvals/:id (INFO_REQUESTED)
 *   APPROVAL_DECIDE        : PATCH /approvals/:id (APPROVED/REJECTED)
 *   APPROVAL_CANCEL        : PATCH /approvals/:id (CANCELLED)
 *
 * Self-approval guard o 2 layer: service (throw 422) + DB trigger (FR-APR-09).
 */
@Controller('approvals')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ApprovalController {
  constructor(private readonly service: ApprovalService) {}

  @Get()
  @Permissions(Permission.APPROVAL_QUEUE_READ)
  list(@Query() q: ListApprovalsQueryDto) {
    return this.service.list(q);
  }

  @Get(':id')
  @Permissions(Permission.APPROVAL_QUEUE_READ)
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.get(id);
  }

  @Post()
  @Permissions(Permission.APPROVAL_CREATE)
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApprovalDto,
  ) {
    return this.service.createDraft(user.sub, dto);
  }

  @Patch(':id/draft')
  @Permissions(Permission.APPROVAL_UPDATE_DRAFT)
  updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDraftApprovalDto,
  ) {
    return this.service.updateDraft(user.sub, id, dto);
  }

  /**
   * Universal action endpoint. Body.action quyet dinh target state.
   * Permission check o day dam bao caller co it nhat 1 trong cac quyen
   * phu hop (Controller se apply theo action o router rieng neu can).
   */
  @Patch(':id')
  action(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.service.performAction(user.sub, id, dto);
  }

  @Post(':id/revisions')
  @Permissions(Permission.APPROVAL_UPDATE_DRAFT)
  @HttpCode(201)
  newRevision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.createNewRevision(user.sub, id);
  }
}
