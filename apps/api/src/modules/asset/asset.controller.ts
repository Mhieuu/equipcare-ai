import {
  Body,
  Controller,
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
import { AssetService } from './asset.service.js';
import {
  CreateAssetDto,
  ListAssetsQueryDto,
  TransitionAssetStateDto,
  UpdateAssetDto,
} from './dto/asset.dto.js';
import type { AuthenticatedUser } from '../../common/types/auth-user.type.js';

/**
 * AssetController — M2 (Doc02 §FR-ASSET-01..09).
 *
 * Permission (Doc03 RBAC):
 *   - Read  → 'asset:read' (TECHNICIAN+ trở lên)
 *   - Write → 'asset:create' / 'asset:update'
 *
 * Routes:
 *   GET    /assets                       list (filter: type/dept/location/state/search)
 *   GET    /assets/:id                   detail
 *   POST   /assets                       create
 *   PATCH  /assets/:id                   update metadata
 *   POST   /assets/:id/lifecycle         chuyển manual_state (NORMAL/SUSPENDED/RETIRED)
 *   GET    /assets/:id/qr                PNG QR base64 data URL
 */
@ApiTags('asset')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('assets')
export class AssetController {
  constructor(private readonly assets: AssetService) {}

  @Get()
  @Permissions('asset:read')
  @ApiOperation({ summary: 'Danh sách thiết bị (filter)' })
  list(@Query() q: ListAssetsQueryDto) {
    return this.assets.list(q);
  }

  @Get(':id')
  @Permissions('asset:read')
  @ApiOperation({ summary: 'Chi tiết thiết bị (SCR-ASSET-05b tabs Tổng quan)' })
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.assets.get(id);
  }

  @Post()
  @Permissions('asset:create')
  @ApiOperation({ summary: 'Tạo thiết bị mới (FR-ASSET-01)' })
  create(
    @Body() dto: CreateAssetDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.assets.create(dto, actor.sub);
  }

  @Patch(':id')
  @Permissions('asset:update')
  @ApiOperation({ summary: 'Cập nhật metadata (FR-ASSET-02)' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAssetDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.assets.update(id, dto, actor.sub);
  }

  @Post(':id/lifecycle')
  @Permissions('asset:update')
  @ApiOperation({ summary: 'Chuyển manual_state (FR-ASSET-05 + FR-ASSET-07 RETIRED)' })
  transition(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: TransitionAssetStateDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.assets.transitionState(id, dto, actor.sub);
  }

  @Get(':id/qr')
  @Permissions('asset:read')
  @ApiOperation({ summary: 'QR code PNG base64 (FR-ASSET-06)' })
  qr(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.assets.getQrPng(id);
  }
}
