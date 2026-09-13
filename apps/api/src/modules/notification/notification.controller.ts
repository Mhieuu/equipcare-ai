import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/auth-user.type.js';
import { NotificationService } from './notification.service';
import { ListNotificationsQueryDto } from './dto/notification.dto';

/**
 * Notification endpoints (Doc04 §5.8 + M9 plan).
 *
 * Permission: chi can JWT (recipient_id = current user). User khong the doc
 * notification cua user khac (Doc04 §5.8 + Doc07 TC-NOT-04).
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() q: ListNotificationsQueryDto) {
    return this.service.list(user.sub, {
      unread: q.unread === 'true',
      eventType: q.eventType,
      limit: Math.min(Number(q.limit ?? 50) || 50, 200),
    });
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.service.unreadCount(user.sub);
  }

  @Patch('read-all')
  @HttpCode(200)
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.service.markAllRead(user.sub);
  }

  @Patch(':id/read')
  @HttpCode(200)
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.markRead(user.sub, id);
  }
}
