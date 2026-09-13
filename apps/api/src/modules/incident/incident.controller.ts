import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import {
  IncidentMessageType,
  Permission,
} from '@equipcare/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/auth-user.type.js';
import { IncidentService } from './incident.service';
import {
  CreateIncidentDto,
  TransitionIncidentDto,
  CreateIncidentMessageDto,
  ListIncidentsQueryDto,
} from './dto/incident.dto';

/**
 * Incident endpoints (Doc02 §FR-INC-01..09).
 *
 * Permission map (theo SCR-INC-01..06 + queue Figma v1.1):
 *  - INCIDENT_READ          : GET list / detail
 *  - INCIDENT_CREATE        : POST /incidents
 *  - INCIDENT_TRANSITION    : POST /:id/transition
 *  - INCIDENT_MESSAGE_CREATE: POST /:id/messages
 */
@Controller('incidents')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class IncidentController {
  constructor(private readonly service: IncidentService) {}

  @Get()
  @Permissions(Permission.INCIDENT_READ)
  list(@Query() q: ListIncidentsQueryDto) {
    return this.service.list(q);
  }

  @Get(':id')
  @Permissions(Permission.INCIDENT_READ)
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findById(id);
  }

  @Post()
  @Permissions(Permission.INCIDENT_CREATE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateIncidentDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  @Post(':id/transition')
  @Permissions(Permission.INCIDENT_TRANSITION)
  @HttpCode(200)
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: TransitionIncidentDto,
  ) {
    return this.service.transition(user.sub, id, dto);
  }

  @Post(':id/messages')
  @Permissions(Permission.INCIDENT_MESSAGE_CREATE)
  @HttpCode(201)
  addMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateIncidentMessageDto,
  ) {
    return this.service.addMessage(
      user.sub,
      id,
      dto.body ?? '',
      IncidentMessageType.STAFF,
    );
  }
}
