import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AppError,
  assertWorkOrderTransition,
  assertWorkOrderCancelReason,
  markStarted,
  markCompleted,
  markCancelled,
  writeAudit,
  computeActiveElapsed,
  isOverdue,
  type SlaInterval,
} from '@equipcare/backend-core';
import { PrismaService } from '../../prisma/prisma.service';
import {
  WorkOrderStatus,
  WorkOrderStatusLabel,
  WorkOrderType,
  WorkOrderCreationMode,
  WorkOrderNoteType,
  IncidentStatus,
  IncidentMessageType,
} from '@equipcare/shared';
import type {
  CreateWorkOrderDto,
  TransitionWorkOrderDto,
  AssignWorkOrderDto,
  CompleteWorkOrderDto,
  CancelWorkOrderDto,
  AddNoteDto,
  ListWorkOrdersQueryDto,
} from './dto/work-order.dto';

/**
 * WorkOrderService — M5 (Doc02 section FR-WO-01..09).
 *
 * Tinh nang:
 *  - CRUD co ban (Doc04 section 5.4)
 *  - Lifecycle state machine (backend-core/work-order.machine.ts)
 *  - Side-effects: timestamps (started_at/completed_at/cancelled_at/by/reason)
 *  - Pause/Resume qua work_order_notes (noteType PAUSE_START/PAUSE_END)
 *  - Auto-resolve incident khi WO REPAIR cuoi cung -> COMPLETED (Doc04 section 5.5)
 *  - Partial unique incident_id (Doc04 DB-03) - service translate loi P2002 thanh AppError
 *  - Optimistic lock row_version (R-04)
 *  - SLA pause-aware (Q-04)
 *
 * Permission check do controller ap @Permissions().
 */
@Injectable()
export class WorkOrderService {
  private readonly logger = new Logger(WorkOrderService.name);

  /** SLA defaults (seconds). Override bang system_settings.sla.{priority}. */
  private readonly slaDefaults: Record<string, number> = {
    CRITICAL: 1 * 60 * 60, // 1h
    HIGH: 4 * 60 * 60, // 4h
    MEDIUM: 24 * 60 * 60, // 24h
    LOW: 72 * 60 * 60, // 72h
  };

  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // CRUD
  // ===========================================================================

  async list(filter: ListWorkOrdersQueryDto) {
    const where: Prisma.work_ordersWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.kind) where.kind = filter.kind;
    if (filter.priority) where.priority_code = filter.priority;
    if (filter.assigneeId) where.assignee_id = filter.assigneeId;
    if (filter.assetId) where.asset_id = filter.assetId;

    const items = await this.prisma.work_orders.findMany({
      where,
      include: {
        asset: { select: { id: true, code: true, name: true } },
        assignee: { select: { id: true, login_name: true, full_name: true } },
        incident: { select: { id: true, code: true } },
      },
      orderBy: [{ due_at: 'asc' }, { created_at: 'desc' }],
      take: 100,
    });
    return { items: items.map((w) => this.toListDto(w)), total: items.length };
  }

  async get(id: string) {
    const wo = await this.prisma.work_orders.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, code: true, name: true } },
        department_snapshot: { select: { id: true, code: true, name: true } },
        assignee: { select: { id: true, login_name: true, full_name: true } },
        created_by_user: { select: { id: true, login_name: true, full_name: true } },
        cancelled_by_user: { select: { id: true, login_name: true, full_name: true } },
        incident: { select: { id: true, code: true, status: true } },
        notes: {
          orderBy: { created_at: 'asc' },
          include: {
            author: { select: { id: true, login_name: true, full_name: true } },
          },
        },
      },
    });
    if (!wo) throw AppError.notFound('Khong tim thay Work Order', { id });
    return this.toDetailDto(wo);
  }

  async create(dto: CreateWorkOrderDto, actorId: string) {
    // 1) Verify FK: asset, incident, assignee, department (snapshot tu asset)
    const asset = await this.prisma.assets.findUnique({
      where: { id: dto.assetId },
    });
    if (!asset) throw AppError.notFound('Khong tim thay tai san', { assetId: dto.assetId });

    let incident: { id: string; status: string } | null = null;
    if (dto.incidentId) {
      incident = await this.prisma.incidents.findUnique({
        where: { id: dto.incidentId },
      });
      if (!incident) {
        throw AppError.notFound('Khong tim thay su co', { incidentId: dto.incidentId });
      }
    }

    if (dto.assigneeId) {
      const assignee = await this.prisma.users.findUnique({
        where: { id: dto.assigneeId },
      });
      if (!assignee) {
        throw AppError.notFound('Khong tim thay nguoi phan cong', {
          assigneeId: dto.assigneeId,
        });
      }
    }

    // 2) due_at: neu khong cung cap, mac dinh theo priority SLA
    let dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (!dueAt) {
      const slaSec = await this.getSlaSeconds(dto.priorityCode);
      dueAt = new Date(Date.now() + slaSec * 1000);
    }

    // 3) code generation: WO-yyyymmdd-XXXXX
    const ymd = this.todayYmd();
    const count = await this.prisma.work_orders.count({
      where: { code: { startsWith: `WO-${ymd}-` } },
    });
    const code = `WO-${ymd}-${String(count + 1).padStart(5, '0')}`;

    // 4) Try create; P2002 (unique incident_id) -> 422 conflict
    try {
      const created = await this.prisma.work_orders.create({
        data: {
          code,
          asset_id: dto.assetId,
          kind: dto.kind,
          incident_id: dto.incidentId ?? null,
          assignee_id: dto.assigneeId ?? null,
          created_by: actorId,
          creation_mode: dto.creationMode,
          description: dto.description,
          priority_code: dto.priorityCode,
          due_at: dueAt,
          department_id_snapshot: asset.department_id,
          downtime_start: dto.downtimeStart ? new Date(dto.downtimeStart) : null,
          checklist_snapshot: (dto.checklist ?? []) as Prisma.InputJsonValue,
          status: dto.assigneeId ? WorkOrderStatus.ASSIGNED : WorkOrderStatus.NEW,
          started_at: dto.assigneeId ? new Date() : null,
        },
      });
      await writeAudit({
        actorId,
        actorType: 'USER',
        action: 'work_order.create',
        objectType: 'WorkOrder',
        objectKey: created.id,
        correlationKey: created.id,
        newValue: { code, kind: dto.kind, priority: dto.priorityCode },
      });
      return this.get(created.id);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002' && dto.incidentId) {
          // Partial unique uniq_open_repair_per_incident
          throw AppError.conflict(
            'Incident da co Work Order REPAIR dang mo',
            { incidentId: dto.incidentId },
          );
        }
      }
      throw e;
    }
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  async transition(actorId: string, id: string, dto: TransitionWorkOrderDto) {
    const wo = await this.prisma.work_orders.findUnique({ where: { id } });
    if (!wo) throw AppError.notFound('Khong tim thay Work Order', { id });

    const from = wo.status as WorkOrderStatus;
    const to = dto.to;

    // Optimistic lock (R-04)
    if (dto.rowVersion !== undefined && Number(dto.rowVersion) !== wo.row_version) {
      throw AppError.conflict(
        'Work Order da duoc cap nhat boi nguoi khac',
        { currentVersion: wo.row_version, providedVersion: Number(dto.rowVersion) },
      );
    }

    // State machine
    assertWorkOrderTransition(from, to);

    // Side-effects theo target state
    const patch: Prisma.work_ordersUpdateInput = {
      status: to,
      row_version: { increment: 1 },
    };
    if (to === WorkOrderStatus.IN_PROGRESS) Object.assign(patch, markStarted());
    if (to === WorkOrderStatus.COMPLETED) {
      Object.assign(patch, markCompleted());
      if (!wo.started_at) {
        // Complete without explicit start -> treat started_at = completed_at for SLA
        patch.started_at = new Date();
      }
    }
    if (to === WorkOrderStatus.CANCELLED) {
      const reason = assertWorkOrderCancelReason(dto.reason);
      Object.assign(patch, markCancelled(actorId, reason));
    }

    // Apply with optimistic lock; P2025 neu row bi xoa trong luc update
    const updated = await this.prisma.work_orders.update({
      where: { id, row_version: wo.row_version },
      data: patch,
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'work_order.transition',
      objectType: 'WorkOrder',
      objectKey: id,
      correlationKey: id,
      oldValue: { status: from },
      newValue: { status: to, reason: dto.reason ?? null },
    });

    // Side-effect: neu COMPLETED + REPAIR va incident con IN_PROGRESS/NEW/...
    // -> incident tu chuyen RESOLVED (Doc04 section 5.5 + M5 plan section 12.2).
    if (
      to === WorkOrderStatus.COMPLETED &&
      wo.kind === WorkOrderType.REPAIR &&
      wo.incident_id
    ) {
      await this.tryResolveIncidentOnComplete(actorId, wo.incident_id);
    }

    return this.get(updated.id);
  }

  async assign(actorId: string, id: string, dto: AssignWorkOrderDto) {
    const wo = await this.prisma.work_orders.findUnique({ where: { id } });
    if (!wo) throw AppError.notFound('Khong tim thay Work Order', { id });

    const assignee = await this.prisma.users.findUnique({
      where: { id: dto.assigneeId },
    });
    if (!assignee) {
      throw AppError.notFound('Khong tim thay nguoi phan cong', {
        assigneeId: dto.assigneeId,
      });
    }

    const from = wo.status as WorkOrderStatus;
    if (from !== WorkOrderStatus.NEW && from !== WorkOrderStatus.ASSIGNED) {
      throw AppError.unprocessable(
        'WO_INVALID_ASSIGN_STATE',
        'Chi assign khi WO dang o NEW hoac ASSIGNED',
        { status: from },
      );
    }

    const updated = await this.prisma.work_orders.update({
      where: { id, row_version: wo.row_version },
      data: {
        assignee_id: dto.assigneeId,
        status: WorkOrderStatus.ASSIGNED,
        row_version: { increment: 1 },
      },
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'work_order.assign',
      objectType: 'WorkOrder',
      objectKey: id,
      correlationKey: id,
      oldValue: { assigneeId: wo.assignee_id },
      newValue: { assigneeId: dto.assigneeId, reason: dto.reason ?? null },
    });

    return this.get(updated.id);
  }

  /**
   * Complete (FR-WO-08) — chi tiet ket qua.
   * Neu state khong phai IN_PROGRESS, tu transition qua COMPLETED.
   */
  async complete(actorId: string, id: string, dto: CompleteWorkOrderDto) {
    const wo = await this.prisma.work_orders.findUnique({ where: { id } });
    if (!wo) throw AppError.notFound('Khong tim thay Work Order', { id });

    const from = wo.status as WorkOrderStatus;

    // Tu IN_PROGRESS -> COMPLETED (qua state machine)
    if (from !== WorkOrderStatus.IN_PROGRESS) {
      // Cho phep NEW/ASSIGNED -> COMPLETED neu co result summary (FR-WO-08)?
      // Theo state machine: chi IN_PROGRESS -> COMPLETED. Neu can shortcut, caller
      // phai transition truoc.
      throw AppError.unprocessable(
        'WO_INVALID_TRANSITION',
        'Chi COMPLETED tu IN_PROGRESS',
        { from, to: WorkOrderStatus.COMPLETED },
      );
    }

    const patch: Prisma.work_ordersUpdateInput = {
      ...markCompleted(),
      row_version: { increment: 1 },
      result_summary: dto.resultSummary ?? null,
      action_taken: dto.actionTaken ?? null,
      confirmed_cause: dto.confirmedCause ?? null,
      downtime_end: dto.downtimeEnd ? new Date(dto.downtimeEnd) : null,
      checklist_results: (dto.checklistResults ?? []) as Prisma.InputJsonValue,
    };

    const updated = await this.prisma.work_orders.update({
      where: { id, row_version: wo.row_version },
      data: { ...patch, status: WorkOrderStatus.COMPLETED },
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'work_order.complete',
      objectType: 'WorkOrder',
      objectKey: id,
      correlationKey: id,
      oldValue: { status: from },
      newValue: { status: WorkOrderStatus.COMPLETED },
    });

    // Auto-resolve incident neu REPAIR
    if (wo.kind === WorkOrderType.REPAIR && wo.incident_id) {
      await this.tryResolveIncidentOnComplete(actorId, wo.incident_id);
    }

    return this.get(updated.id);
  }

  async cancel(actorId: string, id: string, dto: CancelWorkOrderDto) {
    const reason = assertWorkOrderCancelReason(dto.reason);
    return this.transition(actorId, id, {
      to: WorkOrderStatus.CANCELLED,
      reason,
    });
  }

  // ===========================================================================
  // Notes (Doc04 section 5.6 + Q-04)
  // ===========================================================================

  async addNote(actorId: string, id: string, dto: AddNoteDto) {
    const wo = await this.prisma.work_orders.findUnique({ where: { id } });
    if (!wo) throw AppError.notFound('Khong tim thay Work Order', { id });

    // PAUSE_START bat buoc co pause_reason
    if (dto.noteType === WorkOrderNoteType.PAUSE_START && !dto.pauseReason) {
      throw AppError.unprocessable(
        'WO_PAUSE_REQUIRES_REASON',
        'PAUSE_START can nhap ly do tam dung',
        { field: 'pauseReason' },
      );
    }

    // PAUSE_END: phai co PAUSE_START dang mo
    if (dto.noteType === WorkOrderNoteType.PAUSE_END) {
      const openPause = await this.prisma.work_order_notes.findFirst({
        where: { work_order_id: id, note_type: WorkOrderNoteType.PAUSE_START },
        orderBy: { created_at: 'desc' },
      });
      if (!openPause) {
        throw AppError.unprocessable(
          'WO_RESUME_WITHOUT_PAUSE',
          'Khong co PAUSE_START de thoat',
          { workOrderId: id },
        );
      }
      // Co PAUSE_END sau PAUSE_START gan nhat -> khong can check ordered (UI flow).
    }

    const created = await this.prisma.work_order_notes.create({
      data: {
        work_order_id: id,
        author_id: actorId,
        note_type: dto.noteType,
        note: dto.note,
        pause_reason: dto.pauseReason ?? null,
      },
      include: {
        author: { select: { id: true, login_name: true, full_name: true } },
      },
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'work_order.note',
      objectType: 'WorkOrder',
      objectKey: id,
      correlationKey: id,
      newValue: { noteType: dto.noteType, pauseReason: dto.pauseReason ?? null },
    });

    return created;
  }

  // ===========================================================================
  // SLA status (Doc02 section FR-WO-10, plan Q-04)
  // ===========================================================================

  async getSlaStatus(id: string) {
    const wo = await this.prisma.work_orders.findUnique({
      where: { id },
      include: {
        notes: {
          where: {
            note_type: {
              in: [
                WorkOrderNoteType.PAUSE_START,
                WorkOrderNoteType.PAUSE_END,
                WorkOrderNoteType.WAITING_APPROVAL_START,
                WorkOrderNoteType.WAITING_APPROVAL_END,
              ],
            },
          },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    if (!wo) throw AppError.notFound('Khong tim thay Work Order', { id });

    const slaSeconds = await this.getSlaSeconds(wo.priority_code);
    const { pauseIntervals, waitingApprovalIntervals } =
      this.buildSlaIntervals(wo.notes);

    const slaStartedAt = wo.started_at ?? wo.created_at;
    const activeElapsed = computeActiveElapsed({
      slaStartedAt,
      pauseIntervals,
      waitingApprovalIntervals,
    });

    const status = wo.status as WorkOrderStatus;
    const overdue = isOverdue(status, slaSeconds, activeElapsed);
    const remainingSeconds = Math.max(0, slaSeconds - activeElapsed);

    return {
      workOrderId: id,
      priority: wo.priority_code,
      slaSeconds,
      slaStartedAt: slaStartedAt.toISOString(),
      status,
      activeElapsedSeconds: activeElapsed,
      remainingSeconds,
      isOverdue: overdue,
      pauseSeconds: pauseIntervals.length > 0 ? this.sumSeconds(pauseIntervals) : 0,
      waitingApprovalSeconds:
        waitingApprovalIntervals.length > 0
          ? this.sumSeconds(waitingApprovalIntervals)
          : 0,
    };
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Khi WO REPAIR COMPLETED -> neu khong con WO REPAIR khac dang mo cho incident
   * -> tu chuyen incident -> RESOLVED (Doc04 section 5.5).
   *
   * Side-effects:
   *  - incident.resolved_at = now
   *  - incident_messages('SYSTEM') event
   *  - audit_logs
   */
  private async tryResolveIncidentOnComplete(actorId: string, incidentId: string) {
    const openRepairCount = await this.prisma.work_orders.count({
      where: {
        incident_id: incidentId,
        kind: WorkOrderType.REPAIR,
        status: { in: [WorkOrderStatus.NEW, WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS] },
      },
    });
    if (openRepairCount > 0) {
      this.logger.log(
        `Incident ${incidentId} van co ${openRepairCount} WO REPAIR mo, khong tu RESOLVED.`,
      );
      return;
    }

    const inc = await this.prisma.incidents.findUnique({ where: { id: incidentId } });
    if (!inc) return;
    const incStatus = inc.status as IncidentStatus;
    if (incStatus === IncidentStatus.RESOLVED || incStatus === IncidentStatus.CLOSED ||
        incStatus === IncidentStatus.CANCELLED) {
      return; // Da dong, khong can
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.incidents.update({
        where: { id: incidentId },
        data: { status: IncidentStatus.RESOLVED, resolved_at: now, row_version: { increment: 1 } },
      });
      await tx.incident_messages.create({
        data: {
          incident_id: incidentId,
          author_id: actorId,
          message_type: IncidentMessageType.SYSTEM,
          body: `Trang thai: ${incStatus} -> ${IncidentStatus.RESOLVED} (auto: WO REPAIR cuoi cung da COMPLETED)`,
        },
      });
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'incident.auto_resolve',
      objectType: 'incidents',
      objectKey: incidentId,
      correlationKey: incidentId,
      oldValue: { status: incStatus },
      newValue: { status: IncidentStatus.RESOLVED, reason: 'LAST_WO_REPAIR_COMPLETED' },
    });
  }

  /** Build SlaInterval[] tu note timeline. Moi note PAUSE_START mo mot interval; PAUSE_END dong. */
  private buildSlaIntervals(notes: Array<{ note_type: string; created_at: Date }>): {
    pauseIntervals: SlaInterval[];
    waitingApprovalIntervals: SlaInterval[];
  } {
    const pauseIntervals: SlaInterval[] = [];
    const waitingApprovalIntervals: SlaInterval[] = [];
    let openPause: SlaInterval | null = null;
    let openWait: SlaInterval | null = null;
    for (const n of notes) {
      if (n.note_type === WorkOrderNoteType.PAUSE_START) {
        openPause = { startedAt: n.created_at, endedAt: null };
        pauseIntervals.push(openPause);
      } else if (n.note_type === WorkOrderNoteType.PAUSE_END && openPause) {
        openPause.endedAt = n.created_at;
        openPause = null;
      } else if (n.note_type === WorkOrderNoteType.WAITING_APPROVAL_START) {
        openWait = { startedAt: n.created_at, endedAt: null };
        waitingApprovalIntervals.push(openWait);
      } else if (n.note_type === WorkOrderNoteType.WAITING_APPROVAL_END && openWait) {
        openWait.endedAt = n.created_at;
        openWait = null;
      }
    }
    return { pauseIntervals, waitingApprovalIntervals };
  }

  private sumSeconds(intervals: SlaInterval[]): number {
    let total = 0;
    for (const i of intervals) {
      const end = i.endedAt ?? new Date();
      total += Math.max(0, Math.floor((end.getTime() - i.startedAt.getTime()) / 1000));
    }
    return total;
  }

  /** Lay SLA seconds tu system_settings, fallback theo priority. */
  private async getSlaSeconds(priority: string): Promise<number> {
    const row = await this.prisma.system_settings.findUnique({
      where: { key: `sla.${priority.toLowerCase()}_seconds` },
    });
    if (row) {
      const n = Number(row.value);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return this.slaDefaults[priority] ?? this.slaDefaults.MEDIUM;
  }

  private todayYmd(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toListDto(w: any) {
    const status = w.status as WorkOrderStatus;
    return {
      id: w.id,
      code: w.code,
      kind: w.kind,
      status,
      statusLabel: WorkOrderStatusLabel[status],
      priorityCode: w.priority_code,
      dueAt: w.due_at instanceof Date ? w.due_at.toISOString() : w.due_at,
      asset: w.asset ?? null,
      assignee: w.assignee ?? null,
      incident: w.incident ?? null,
      rowVersion: w.row_version,
      createdAt: w.created_at instanceof Date ? w.created_at.toISOString() : w.created_at,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDetailDto(w: any) {
    return {
      ...this.toListDto(w),
      creationMode: w.creation_mode as WorkOrderCreationMode,
      description: w.description,
      startedAt: w.started_at?.toISOString() ?? null,
      completedAt: w.completed_at?.toISOString() ?? null,
      cancelledAt: w.cancelled_at?.toISOString() ?? null,
      cancelledBy: w.cancelled_by_user ?? null,
      cancelReason: w.cancel_reason ?? null,
      department: w.department_snapshot ?? null,
      confirmedCause: w.confirmed_cause ?? null,
      actionTaken: w.action_taken ?? null,
      resultSummary: w.result_summary ?? null,
      checklistSnapshot: w.checklist_snapshot ?? [],
      checklistResults: w.checklist_results ?? [],
      downtimeStart: w.downtime_start?.toISOString() ?? null,
      downtimeEnd: w.downtime_end?.toISOString() ?? null,
      createdBy: w.created_by_user ?? null,
      notes: (w.notes ?? []).map((n: { note_type: string; pause_reason: string | null; created_at: Date; author: unknown; note: string; id: string }) => ({
        id: n.id,
        noteType: n.note_type,
        pauseReason: n.pause_reason,
        note: n.note,
        author: n.author,
        createdAt: n.created_at instanceof Date ? n.created_at.toISOString() : n.created_at,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Planned parts (M7)
  // -------------------------------------------------------------------------

  /**
   * Upsert 1 work_order_parts row cho WO. Moi WO chi co 1 row/part (UNIQUE).
   */
  async planPart(
    actorId: string,
    workOrderId: string,
    partId: string,
    plannedQuantity: number,
    note?: string | null,
  ) {
    if (!Number.isFinite(plannedQuantity) || plannedQuantity < 0) {
      throw AppError.unprocessable(
        'WO_PART_INVALID_QTY',
        'planned_quantity phai >= 0',
        { plannedQuantity },
      );
    }
    const wo = await this.prisma.work_orders.findUnique({ where: { id: workOrderId } });
    if (!wo) throw AppError.notFound('Khong tim thay work order', { workOrderId });
    if (wo.status === 'COMPLETED' || wo.status === 'CANCELLED') {
      throw AppError.unprocessable(
        'WO_TERMINAL_NO_PLAN',
        'WO da terminal, khong the plan them parts',
        { status: wo.status },
      );
    }
    const part = await this.prisma.parts.findUnique({ where: { id: partId } });
    if (!part) throw AppError.notFound('Khong tim thay linh kien', { partId });

    const existing = await this.prisma.work_order_parts.findUnique({
      where: { work_order_id_part_id: { work_order_id: workOrderId, part_id: partId } },
    });

    let result;
    if (existing) {
      result = await this.prisma.work_order_parts.update({
        where: { id: existing.id },
        data: {
          planned_quantity: new Prisma.Decimal(plannedQuantity),
          note: note ?? null,
          row_version: { increment: 1 },
        },
      });
    } else {
      result = await this.prisma.work_order_parts.create({
        data: {
          work_order_id: workOrderId,
          part_id: partId,
          planned_quantity: new Prisma.Decimal(plannedQuantity),
          note: note ?? null,
        },
      });
    }

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'work_order.plan_part',
      objectType: 'WorkOrderPart',
      objectKey: result.id,
      correlationKey: workOrderId,
      newValue: { partId, plannedQuantity, note },
    });

    return this.workOrderPartToDto(result);
  }

  async listPlannedParts(workOrderId: string) {
    const rows = await this.prisma.work_order_parts.findMany({
      where: { work_order_id: workOrderId },
      orderBy: [{ created_at: 'asc' }],
    });
    return rows.map((r) => this.workOrderPartToDto(r));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private workOrderPartToDto(p: any) {
    return {
      id: p.id,
      workOrderId: p.work_order_id,
      partId: p.part_id,
      plannedQuantity: p.planned_quantity?.toString() ?? '0',
      note: p.note ?? null,
      rowVersion: p.row_version,
    };
  }
}
