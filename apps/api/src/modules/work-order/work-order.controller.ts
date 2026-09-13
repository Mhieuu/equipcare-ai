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
import { WorkOrderService } from './work-order.service';
import {
  CreateWorkOrderDto,
  TransitionWorkOrderDto,
  AssignWorkOrderDto,
  CompleteWorkOrderDto,
  CancelWorkOrderDto,
  AddNoteDto,
  ListWorkOrdersQueryDto,
} from './dto/work-order.dto';

/**
 * Work Order endpoints (Doc02 section FR-WO-01..10).
 *
 * Permission map:
 *  - WORK_ORDER_READ         : GET list / detail / sla-status
 *  - WORK_ORDER_CREATE       : POST /work-orders
 *  - WORK_ORDER_ASSIGN       : PATCH /:id/assign
 *  - WORK_ORDER_TRANSITION   : PATCH /:id/transition
 *  - WORK_ORDER_COMPLETE     : POST /:id/complete (chuyen IN_PROGRESS->COMPLETED + result)
 *  - WORK_ORDER_CANCEL       : POST /:id/cancel
 *
 * Note: /notes co permission WORK_ORDER_TRANSITION (pause/resume cung la lifecycle).
 */
@Controller('work-orders')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class WorkOrderController {
  constructor(private readonly service: WorkOrderService) {}

  @Get()
  @Permissions(Permission.WORK_ORDER_READ)
  list(@Query() q: ListWorkOrdersQueryDto) {
    return this.service.list(q);
  }

  @Get(':id')
  @Permissions(Permission.WORK_ORDER_READ)
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.get(id);
  }

  @Get(':id/sla-status')
  @Permissions(Permission.WORK_ORDER_READ)
  slaStatus(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getSlaStatus(id);
  }

  @Post()
  @Permissions(Permission.WORK_ORDER_CREATE)
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkOrderDto,
  ) {
    return this.service.create(dto, user.sub);
  }

  @Patch(':id/assign')
  @Permissions(Permission.WORK_ORDER_ASSIGN)
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignWorkOrderDto,
  ) {
    return this.service.assign(user.sub, id, dto);
  }

  @Patch(':id/transition')
  @Permissions(Permission.WORK_ORDER_TRANSITION)
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: TransitionWorkOrderDto,
  ) {
    return this.service.transition(user.sub, id, dto);
  }

  @Post(':id/complete')
  @Permissions(Permission.WORK_ORDER_COMPLETE)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CompleteWorkOrderDto,
  ) {
    return this.service.complete(user.sub, id, dto);
  }

  @Post(':id/cancel')
  @Permissions(Permission.WORK_ORDER_CANCEL)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelWorkOrderDto,
  ) {
    return this.service.cancel(user.sub, id, dto);
  }

  @Post(':id/notes')
  @Permissions(Permission.WORK_ORDER_TRANSITION)
  @HttpCode(201)
  addNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddNoteDto,
  ) {
    return this.service.addNote(user.sub, id, dto);
  }
}
