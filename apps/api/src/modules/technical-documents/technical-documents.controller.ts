import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { TechnicalDocumentService } from './technical-documents.service.js';
import {
  AddVersionDto,
  CreateTechnicalDocumentDto,
  GrantRoleAccessDto,
  UpdateTechnicalDocumentDto,
} from './dto/technical-document.dto.js';
import type { AuthenticatedUser } from '../../common/types/auth-user.type.js';

/**
 * TechnicalDocumentController — M3 (Doc04 §5.6, plan §12.2 M3).
 *
 * Permission:
 *   - Read  → 'asset:read' (technical document thuộc asset domain)
 *   - Write → 'asset:update' (metadata + version + role)
 *
 * Lưu ý: M3 chưa có permission riêng `technical-document:read/write`; dùng chung
 * `asset:read/update` cho tiện. P1 production nên tách (DOC-05 per-doc RBAC).
 */
@ApiTags('technical-document')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('technical-documents')
export class TechnicalDocumentController {
  constructor(private readonly docs: TechnicalDocumentService) {}

  @Post()
  @Permissions('asset:update')
  @ApiOperation({ summary: 'Tạo tài liệu kỹ thuật (SCR-DOC-01)' })
  create(
    @Body() dto: CreateTechnicalDocumentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.docs.create(dto, actor.sub);
  }

  @Get()
  @Permissions('asset:read')
  @ApiOperation({ summary: 'Danh sách tài liệu (filter asset/type)' })
  list(
    @Query('assetId') assetId?: string,
    @Query('assetTypeId') assetTypeId?: string,
    @Query('documentType') documentType?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.docs.list({
      assetId,
      assetTypeId,
      documentType,
      includeInactive: includeInactive === 'true',
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get(':id')
  @Permissions('asset:read')
  @ApiOperation({ summary: 'Chi tiết + danh sách version + roles' })
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.docs.get(id);
  }

  @Patch(':id')
  @Permissions('asset:update')
  @ApiOperation({ summary: 'Update metadata / activate / deactivate' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTechnicalDocumentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.docs.update(id, dto, actor.sub);
  }

  @Post(':id/versions')
  @Permissions('asset:update')
  @ApiOperation({ summary: 'Thêm version mới (SCR-DOC-04)' })
  addVersion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddVersionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.docs.addVersion(id, dto.fileId, dto.changeNote, actor.sub);
  }

  @Post(':id/roles')
  @Permissions('asset:update')
  @ApiOperation({ summary: 'Grant role access cho document (SCR-DOC-05 per-doc RBAC)' })
  grantRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: GrantRoleAccessDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.docs.grantRole(id, dto.roleId, actor.sub);
  }

  @Delete(':id/roles/:roleId')
  @Permissions('asset:update')
  @ApiOperation({ summary: 'Revoke role access' })
  revokeRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.docs.revokeRole(id, roleId, actor.sub);
  }
}
