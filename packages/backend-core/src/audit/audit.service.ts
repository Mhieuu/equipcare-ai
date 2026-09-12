import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma/prisma.service.js';
import type {
  AuditLogRecord,
  ListAuditLogsFilter,
  WriteAuditInput,
} from './audit.types.js';

/**
 * writeAudit — ghi 1 record vào audit_logs (Doc04 §5.7).
 *
 * KHÔNG throw: audit log là best-effort. Lỗi ghi chỉ log warn, KHÔNG
 * làm fail request chính. Doc02 §NFR-AUDIT-03.
 *
 * @param input xem WriteAuditInput (audit.types.ts).
 * @param tx OPTIONAL Prisma transaction client (cho audit ghi cùng với
 *           write chính → atomic).
 */
export async function writeAudit(
  input: WriteAuditInput,
  tx?: PrismaClient,
): Promise<AuditLogRecord | null> {
  const client = tx ?? defaultPrisma;
  try {
    const record = await client.audit_logs.create({
      data: {
        actor_id: input.actorId ?? null,
        actor_type: input.actorType ?? (input.actorId ? 'USER' : 'SYSTEM'),
        action: input.action,
        object_type: input.objectType,
        object_key: input.objectKey,
        old_value: input.oldValue === undefined ? undefined : (input.oldValue as object),
        new_value: input.newValue === undefined ? undefined : (input.newValue as object),
        note: input.note,
        correlation_key: input.correlationKey ?? randomUUID(),
      },
    });
    return mapRecord(record);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[audit] write failed (non-fatal):', (err as Error).message);
    return null;
  }
}

/**
 * listAuditLogs — đọc log có filter + pagination.
 * API endpoint `GET /iam/audit-logs` chỉ wrapper service này.
 */
export async function listAuditLogs(
  filter: ListAuditLogsFilter,
  client: PrismaClient = defaultPrisma,
): Promise<{ items: AuditLogRecord[]; total: number }> {
  const where: Record<string, unknown> = {};
  if (filter.actorId) where.actor_id = filter.actorId;
  if (filter.action) where.action = filter.action;
  if (filter.objectType) where.object_type = filter.objectType;
  if (filter.objectKey) where.object_key = filter.objectKey;
  if (filter.from || filter.to) {
    const range: Record<string, Date> = {};
    if (filter.from) range.gte = filter.from;
    if (filter.to) range.lte = filter.to;
    where.created_at = range;
  }

  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;

  const [rows, total] = await client.$transaction([
    client.audit_logs.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
    }),
    client.audit_logs.count({ where }),
  ]);

  return { items: rows.map(mapRecord), total };
}

function mapRecord(r: {
  id: string;
  actor_id: string | null;
  actor_type: string;
  action: string;
  object_type: string;
  object_key: string;
  old_value: unknown;
  new_value: unknown;
  note: string | null;
  correlation_key: string;
  created_at: Date;
}): AuditLogRecord {
  return {
    id: r.id,
    actorId: r.actor_id,
    actorType: r.actor_type as AuditLogRecord['actorType'],
    action: r.action,
    objectType: r.object_type,
    objectKey: r.object_key,
    oldValue: r.old_value,
    newValue: r.new_value,
    note: r.note,
    correlationKey: r.correlation_key,
    createdAt: r.created_at,
  };
}
