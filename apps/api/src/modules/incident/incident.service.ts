import {
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AppError,
  assertIncidentTransition,
  assertCancelReason,
  markResolved,
  markClosed,
  writeAudit,
} from '@equipcare/backend-core';
import {
  IncidentStatus,
  IncidentMessageType,
  ActivityStatus,
} from '@equipcare/shared';
import { CreateIncidentDto, TransitionIncidentDto } from './dto/incident.dto';

/**
 * IncidentService — quản lý lifecycle sự cố.
 *
 * Mọi transition đều:
 *   1) validate state machine
 *   2) chạy trong transaction
 *   3) ghi audit (correlation_key = incident.id)
 *
 * Theo Doc02 §FR-INC-01..09 + Doc04 §5.5.
 *
 * Side-effects cố ý đặt trong service:
 *   - Vào RESOLVED → set `resolved_at`
 *   - Vào CLOSED   → set `closed_at`
 *   - Vào CANCELLED → set `cancelled_at/by/reason`
 *   - Tạo incident_messages('SYSTEM') cho transition event (audit trail UI).
 */
@Injectable()
export class IncidentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actorId: string, dto: CreateIncidentDto) {
    // 1) verify asset exists
    const asset = await this.prisma.assets.findUnique({
      where: { id: dto.assetId },
    });
    if (!asset) {
      throw AppError.notFound('Không tìm thấy tài sản', { assetId: dto.assetId });
    }

    // 2) generate unique code (format INC-yyyymmdd-XXXXX)
    const now = new Date();
    const ymd = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const count = await this.prisma.incidents.count({
      where: { code: { startsWith: `INC-${ymd}-` } },
    });
    const code = `INC-${ymd}-${String(count + 1).padStart(5, '0')}`;

    // 3) create incident + initial REPORTER message
    const created = await this.prisma.$transaction(async (tx) => {
      const incident = await tx.incidents.create({
        data: {
          code,
          asset_id: dto.assetId,
          reporter_id: actorId,
          description: dto.description,
          impact_description: dto.impactDescription,
          occurred_at: dto.occurredAt ? new Date(dto.occurredAt) : null,
          status: IncidentStatus.NEW,
        },
      });
      await tx.incident_messages.create({
        data: {
          incident_id: incident.id,
          author_id: actorId,
          message_type: IncidentMessageType.REPORTER,
          body: dto.description,
        },
      });
      return incident;
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'incident.create',
      objectType: 'incidents',
      objectKey: created.id,
      correlationKey: created.id,
      newValue: { code, assetId: dto.assetId },
    });

    return this.findById(created.id);
  }

  async findById(id: string) {
    const incident = await this.prisma.incidents.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, code: true, name: true } },
        reporter: { select: { id: true, login_name: true, full_name: true } },
        closed_by_user: { select: { id: true, login_name: true, full_name: true } },
        cancelled_by_user: {
          select: { id: true, login_name: true, full_name: true },
        },
        messages: {
          orderBy: { created_at: 'asc' },
          include: {
            author: { select: { id: true, login_name: true, full_name: true } },
          },
        },
      },
    });
    if (!incident) {
      throw AppError.notFound('Không tìm thấy sự cố', { id });
    }
    return incident;
  }

  async list(query: {
    page?: number;
    pageSize?: number;
    status?: string;
    priority?: string;
    assetId?: string;
    sort?: string;
  }) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.priority) where.priority_code = query.priority;
    if (query.assetId) where.asset_id = query.assetId;

    const [items, total] = await Promise.all([
      this.prisma.incidents.findMany({
        where,
        include: {
          asset: { select: { id: true, code: true, name: true } },
          reporter: { select: { id: true, login_name: true, full_name: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.incidents.count({ where }),
    ]);

    return { items, page, pageSize, total };
  }

  /**
   * Transition trạng thái.
   *
   * Validate state machine (backend-core), apply side-effects,
   * ghi incident_messages('SYSTEM') event + audit.
   */
  async transition(actorId: string, id: string, dto: TransitionIncidentDto) {
    const current = await this.prisma.incidents.findUnique({ where: { id } });
    if (!current) {
      throw AppError.notFound('Không tìm thấy sự cố', { id });
    }

    const from = current.status as IncidentStatus;
    const to = dto.to as IncidentStatus;

    // 1) Validate state machine (throws AppError.unprocessable nếu invalid)
    assertIncidentTransition(from, to);

    // 2) Validate reason nếu CANCELLED (Doc02 §FR-INC-09)
    if (to === IncidentStatus.CANCELLED) {
      assertCancelReason(dto.reason);
    }

    // 3) Build patch
    const patch: Record<string, unknown> = {
      status: to,
      row_version: { increment: 1 },
    };
    if (to === IncidentStatus.RESOLVED) Object.assign(patch, markResolved());
    if (to === IncidentStatus.CLOSED) Object.assign(patch, markClosed());
    if (to === IncidentStatus.CANCELLED) {
      patch.cancelled_at = new Date();
      patch.cancelled_by = actorId;
      patch.cancel_reason = dto.reason!.trim();
    }

    // 4) Transaction: update + ghi SYSTEM message event
    const updated = await this.prisma.$transaction(async (tx) => {
      const inc = await tx.incidents.update({
        where: { id },
        data: patch,
      });
      await tx.incident_messages.create({
        data: {
          incident_id: id,
          author_id: actorId,
          message_type: IncidentMessageType.SYSTEM,
          body: `Trạng thái: ${from} → ${to}${dto.reason ? ` — Lý do: ${dto.reason}` : ''}`,
        },
      });
      return inc;
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'incident.transition',
      objectType: 'incidents',
      objectKey: id,
      correlationKey: id,
      oldValue: { status: from },
      newValue: { status: to, reason: dto.reason ?? null },
    });

    return this.findById(updated.id);
  }

  async addMessage(
    actorId: string,
    id: string,
    body: string,
    messageType: IncidentMessageType,
  ) {
    const incident = await this.prisma.incidents.findUnique({ where: { id } });
    if (!incident) {
      throw AppError.notFound('Không tìm thấy sự cố', { id });
    }
    if (!body || body.trim().length === 0) {
      throw AppError.unprocessable(
        'INCIDENT_MESSAGE_EMPTY',
        'Nội dung tin nhắn không được rỗng',
        { field: 'body' },
      );
    }

    // Không cho message vào incident đã đóng/hủy
    const terminal: IncidentStatus[] = [
      IncidentStatus.CLOSED,
      IncidentStatus.CANCELLED,
    ];
    if (terminal.includes(incident.status as IncidentStatus)) {
      throw AppError.unprocessable(
        'INCIDENT_TERMINAL',
        'Sự cố đã đóng/hủy, không thể thêm tin nhắn',
        { status: incident.status },
      );
    }

    const created = await this.prisma.incident_messages.create({
      data: {
        incident_id: id,
        author_id: actorId,
        message_type: messageType,
        body: body.trim(),
      },
      include: {
        author: { select: { id: true, login_name: true, full_name: true } },
      },
    });

    // STAFF message có thể kèm auto-transition AWAITING_INFO → IN_PROGRESS
    // (Doc02 §FR-INC-03): staff phản hồi → bắt đầu xử lý.
    if (
      messageType === IncidentMessageType.STAFF &&
      incident.status === IncidentStatus.AWAITING_INFO
    ) {
      await this.transition(actorId, id, { to: IncidentStatus.IN_PROGRESS });
    }

    return created;
  }

  /**
   * Đã dùng (FE loading state). Lưu type guard cho service exports.
   * (giữ để tránh unused-import warning nếu lúc nào đó dùng AssetActivityStatus)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _assetActivityUnused = ActivityStatus;
}
