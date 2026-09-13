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
import { PartService } from './part.service';
import {
  CreatePartDto,
  UpdatePartDto,
  ListPartsQueryDto,
} from './dto/part.dto';

/**
 * Parts endpoints (Doc04 section 5.6).
 *
 * Permission map:
 *   INVENTORY_PART_READ    : GET /parts, /parts/:id
 *   INVENTORY_PART_CREATE  : POST /parts
 *   INVENTORY_PART_UPDATE  : PATCH /parts/:id (sau M7)
 */
@Controller('parts')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PartController {
  constructor(private readonly service: PartService) {}

  @Get()
  @Permissions(Permission.INVENTORY_PART_READ)
  list(@Query() q: ListPartsQueryDto) {
    return this.service.list(q);
  }

  @Get(':id')
  @Permissions(Permission.INVENTORY_PART_READ)
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.get(id);
  }

  @Post()
  @Permissions(Permission.INVENTORY_PART_CREATE)
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePartDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  @Permissions(Permission.INVENTORY_PART_CREATE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePartDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }
}
