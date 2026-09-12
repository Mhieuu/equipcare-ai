import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ConfigService } from './config.service.js';
import { CreateSystemSettingDto, UpdateSystemSettingDto } from './dto/config.dto.js';
import type { AuthenticatedUser } from '../../common/types/auth-user.type.js';

/**
 * ConfigController — system_settings (M1.C).
 *
 * Permission:
 *   - GET  (list/get) → public (auth only, không cần permission cụ thể)
 *   - PUT/POST        → 'system-config:update'
 */
@ApiTags('config')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('system-settings')
export class ConfigController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách tất cả settings (Doc02 §FR-CFG-01)' })
  list() {
    return this.config.list();
  }

  @Get(':key')
  @ApiOperation({ summary: 'Đọc 1 setting theo key' })
  get(@Param('key') key: string) {
    return this.config.get(key);
  }

  @Put(':key')
  @Permissions('system-config:update')
  @ApiOperation({ summary: 'Cập nhật setting (admin, SCR-CFG-03)' })
  update(
    @Param('key') key: string,
    @Body() dto: UpdateSystemSettingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.config.update(key, dto, actor.sub);
  }

  @Post()
  @Permissions('system-config:update')
  @ApiOperation({ summary: 'Tạo setting mới (admin)' })
  create(
    @Body() dto: CreateSystemSettingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.config.create(dto, actor.sub);
  }
}
