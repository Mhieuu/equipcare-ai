import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError, writeAudit } from '@equipcare/backend-core';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationGateway } from './notification.gateway';

interface ListOpts {
  unread?: boolean;
  eventType?: string;
  limit: number;
}

/**
 * NotificationService - M9 + M10 (Doc04 §5.8, FR-NOT-06 realtime).
 *
 * Endpoint: GET /notifications, PATCH /:id/read, PATCH /read-all,
 *           GET /notifications/unread-count (badge UI).
 *
 * Realtime: NotificationGateway emit 'notification:updated' khi mark read.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
  ) {}

  async list(userId: string, opts: ListOpts) {
    const where: Prisma.notificationsWhereInput = { recipient_id: userId };
    if (opts.unread) where.read_at = null;
    if (opts.eventType) where.event_type = opts.eventType;

    const items = await this.prisma.notifications.findMany({
      where,
      orderBy: [{ read_at: 'asc' }, { created_at: 'desc' }],
      take: opts.limit,
    });
    return { items: items.map((n) => this.toDto(n)), total: items.length };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notifications.count({
      where: { recipient_id: userId, read_at: null },
    });
    return { count };
  }

  async markRead(actorId: string, id: string) {
    const n = await this.prisma.notifications.findUnique({ where: { id } });
    if (!n) throw AppError.notFound('Khong tim thay thong bao', { id });
    if (n.recipient_id !== actorId) {
      throw AppError.forbidden('Khong co quyen doc thong bao cua nguoi khac');
    }
    if (n.read_at) return this.toDto(n);

    const updated = await this.prisma.notifications.update({
      where: { id },
      data: { read_at: new Date(), row_version: { increment: 1 } },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'notification.read',
      objectType: 'Notification',
      objectKey: id,
    });
    // Realtime push
    const dto = this.toDto(updated);
    this.gateway.emitNotificationUpdated(actorId, dto);
    return dto;
  }

  async markAllRead(actorId: string) {
    const result = await this.prisma.notifications.updateMany({
      where: { recipient_id: actorId, read_at: null },
      data: { read_at: new Date(), row_version: { increment: 1 } },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'notification.read_all',
      objectType: 'User',
      objectKey: actorId,
      newValue: { count: result.count },
    });
    // Realtime push batched update - chi bao so luong
    this.gateway.emitNotificationUpdated(actorId, { readAll: true, count: result.count });
    return { updated: result.count };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDto(n: any) {
    return {
      id: n.id,
      eventKey: n.event_key,
      eventType: n.event_type,
      title: n.title,
      objectType: n.object_type,
      objectKey: n.object_key,
      readAt: n.read_at instanceof Date ? n.read_at.toISOString() : n.read_at,
      createdAt: n.created_at instanceof Date ? n.created_at.toISOString() : n.created_at,
    };
  }
}
