import { PrismaClient, type Prisma } from '@prisma/client';

/**
 * Notification event types (Doc04 §5.8 + M9 plan).
 * Dung enum string de tranh Prisma generate enum nho (giai doan nay scale nho).
 */
export type NotificationEventType =
  | 'INVENTORY_LOW_STOCK'
  | 'APPROVAL_SUBMITTED'
  | 'APPROVAL_DECIDED'
  | 'APPROVAL_REQUEST_INFO'
  | 'WORK_ORDER_OVERDUE'
  | 'WORK_ORDER_ASSIGNED'
  | 'MAINTENANCE_OCCURRENCE_DUE'
  | 'SYSTEM';

export type NotificationObjectType =
  | 'part'
  | 'work_order'
  | 'approval'
  | 'asset'
  | 'maintenance_plan'
  | 'user'
  | 'system';

export const NotificationEventType: Record<NotificationEventType, NotificationEventType> = {
  INVENTORY_LOW_STOCK: 'INVENTORY_LOW_STOCK',
  APPROVAL_SUBMITTED: 'APPROVAL_SUBMITTED',
  APPROVAL_DECIDED: 'APPROVAL_DECIDED',
  APPROVAL_REQUEST_INFO: 'APPROVAL_REQUEST_INFO',
  WORK_ORDER_OVERDUE: 'WORK_ORDER_OVERDUE',
  WORK_ORDER_ASSIGNED: 'WORK_ORDER_ASSIGNED',
  MAINTENANCE_OCCURRENCE_DUE: 'MAINTENANCE_OCCURRENCE_DUE',
  SYSTEM: 'SYSTEM',
};

export const NotificationObjectType: Record<NotificationObjectType, NotificationObjectType> = {
  part: 'part',
  work_order: 'work_order',
  approval: 'approval',
  asset: 'asset',
  maintenance_plan: 'maintenance_plan',
  user: 'user',
  system: 'system',
};

export interface UpsertNotificationInput {
  recipientId: string;
  eventKey: string; // Doc04 UNIQUE(recipient_id, event_key)
  eventType: NotificationEventType;
  title: string;
  objectType: NotificationObjectType;
  objectKey: string;
}

/**
 * Insert notification neu chua ton tai (Doc04 UNIQUE conflict DO NOTHING),
 * tra ve { created, existing }. Caller co the emit Socket.IO neu created=true.
 */
export async function upsertNotification(
  prisma: PrismaClient,
  input: UpsertNotificationInput,
): Promise<{ created: boolean; id: string }> {
  const result = await prisma.notifications.upsert({
    where: {
      recipient_id_event_key: { recipient_id: input.recipientId, event_key: input.eventKey },
    },
    create: {
      recipient_id: input.recipientId,
      event_key: input.eventKey,
      event_type: input.eventType,
      title: input.title,
      object_type: input.objectType,
      object_key: input.objectKey,
    },
    update: {}, // neu da ton tai thi khong reset read_at, giu trang thai nguoi dung
  });

  // Prisma upsert tra ve ban ghi. De phan biet create vs existing, ta kiem tra created_at
  // vs updated_at (trong vong ms sau create).
  const created =
    result.created_at.getTime() === result.updated_at.getTime();
  return { created, id: result.id };
}

/**
 * Emit notification cho nhieu recipient. Dung cho cac nhom admin/manager
 * (vi du: low-stock trigger da xu ly bang DB trigger nen day chi la helper
 *  cho approval submitted -> list of approvers, work_order assigned -> assignee).
 */
export async function emitNotificationToRecipients(
  prisma: PrismaClient,
  tx: Prisma.TransactionClient | PrismaClient,
  recipients: string[],
  base: Omit<UpsertNotificationInput, 'recipientId'>,
): Promise<Array<{ recipientId: string; created: boolean; id: string }>> {
  const results: Array<{ recipientId: string; created: boolean; id: string }> = [];
  for (const rid of recipients) {
    const r = await upsertNotification(tx as PrismaClient, { ...base, recipientId: rid });
    results.push({ recipientId: rid, created: r.created, id: r.id });
  }
  return results;
}
