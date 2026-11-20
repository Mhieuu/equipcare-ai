import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AppError,
  assertApprovalTransition,
  resolveTargetState,
  writeAudit,
} from '@equipcare/backend-core';
import {
  ApprovalEventType,
  ApprovalStatus,
  WorkOrderStatus,
  WorkOrderNoteType,
  Permission,
  type PermissionCode,
} from '@equipcare/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateApprovalDto,
  UpdateDraftApprovalDto,
  ApprovalActionDto,
  ListApprovalsQueryDto,
} from './dto/approval.dto';

/** Input dong yeu xuat kho cho 1 revision (Q-06). */
interface ApprovalRevisionPartInput {
  partId: string;
  quantity?: number;
  unitPrice?: number;
  requiresApproval?: boolean;
}

/** Shape 1 dong `approval_revision_parts` + part lien quan (doc cho DTO mapper). */
interface ApprovalRevisionPartRow {
  part_id: string;
  quantity: { toString(): string };
  unit_price: { toString(): string };
  part_name_snapshot: string;
  requires_approval_snapshot: boolean;
  part?: { id: string; code: string; name: string } | null;
}

/** Shape 1 revision kem danh sach parts. */
interface ApprovalRevisionRow {
  id: string;
  revision_no: number;
  reason: string;
  action_plan: string;
  other_estimated_cost: { toString(): string } | null;
  submitted_at: Date | string | null;
  created_at: Date | string;
  parts?: ApprovalRevisionPartRow[];
}

/** Shape 1 approval event kem actor. */
interface ApprovalEventRow {
  id: string;
  event_type: string;
  note: string | null;
  actor_id: string;
  created_at: Date | string;
  actor?: { id: string; login_name: string; full_name: string } | null;
}

/**
 * ApprovalService - M6 (Doc04 section 5.7).
 *
 * Day du lifecycle:
 *   - createDraft: tao approval (DRAFT) + revision_no=1
 *   - updateDraft: chinh sua revision_no hien tai (khong them revision moi)
 *   - submit: DRAFT -> SUBMITTED, ghi SUBMITTED event
 *   - requestInfo: SUBMITTED -> INFO_REQUESTED
 *   - approve: SUBMITTED -> APPROVED (FR-APR-09 self-approval via DB trigger)
 *   - reject: SUBMITTED -> REJECTED
 *   - cancel: DRAFT|SUBMITTED|INFO_REQUESTED -> CANCELLED
 *   - newRevision: APPROVED|REJECTED|INFO_REQUESTED -> DRAFT (them revision_no+1)
 *
 * Work-order coupling (WAITING_APPROVAL lifecycle Q-06):
 *   - submit (revision SUBMITTED) va `submittedFor WO`: WO status -> WAITING_APPROVAL
 *   - approve / reject / cancel -> WO status -> IN_PROGRESS (rollback)
 *   - newRevision -> WO status WAITING_APPROVAL (gia tri moi dang xet)
 *
 * Optimistic lock row_version cho approvals (R-04).
 */
@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // CRUD
  // ===========================================================================

  async list(query: ListApprovalsQueryDto) {
    const where: Prisma.approvalsWhereInput = {};
    if (query.status) where.status = query.status;
    const [items, total] = await Promise.all([
      this.prisma.approvals.findMany({
        where,
        orderBy: [{ updated_at: 'desc' }],
        take: query.getTake(),
        skip: query.getSkip(),
        include: {
          proposer: { select: { id: true, login_name: true, full_name: true } },
          work_order: {
            select: { id: true, code: true, priority_code: true, status: true, description: true },
          },
          revisions: {
            orderBy: { revision_no: 'desc' },
            take: 1,
            select: {
              id: true,
              revision_no: true,
              reason: true,
              submitted_at: true,
              other_estimated_cost: true,
            },
          },
        },
      }),
      this.prisma.approvals.count({ where }),
    ]);
    return { items: items.map((a) => this.toListDto(a)), total };
  }

  async get(id: string) {
    const a = await this.prisma.approvals.findUnique({
      where: { id },
      include: {
        proposer: { select: { id: true, login_name: true, full_name: true } },
        work_order: {
          select: {
            id: true,
            code: true,
            status: true,
            description: true,
            asset: { select: { id: true, code: true, name: true } },
          },
        },
        revisions: {
          orderBy: { revision_no: 'desc' },
          include: {
            parts: {
              include: {
                part: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
        events: {
          orderBy: { created_at: 'asc' },
          include: {
            actor: { select: { id: true, login_name: true, full_name: true } },
          },
        },
      },
    });
    if (!a) throw AppError.notFound('Khong tim thay approval', { id });
    return this.toDetailDto(a);
  }

  // ===========================================================================
  // Lifecycle actions
  // ===========================================================================

  async createDraft(actorId: string, dto: CreateApprovalDto) {
    // 1) Verify WO ton tai + co quyen truy cap (permission check o controller)
    const wo = await this.prisma.work_orders.findUnique({
      where: { id: dto.workOrderId },
      include: { approvals: { where: { status: { not: ApprovalStatus.CANCELLED } } } },
    });
    if (!wo) {
      throw AppError.notFound('Khong tim thay Work Order', {
        workOrderId: dto.workOrderId,
      });
    }

    // 2) Moi WO chi co 1 approval active (khong CANCELLED)
    if (wo.approvals.length > 0) {
      throw AppError.conflict('Work Order da co approval dang mo', {
        workOrderId: dto.workOrderId,
        existingApproval: wo.approvals[0].id,
      });
    }

    if (wo.status === WorkOrderStatus.COMPLETED || wo.status === WorkOrderStatus.CANCELLED) {
      throw AppError.unprocessable(
        'WO_TERMINAL_CANNOT_APPROVE',
        'Work Order da dong (COMPLETED/CANCELLED), khong the mo approval',
        { status: wo.status },
      );
    }

    // 3) Code generation
    const ymd = this.todayYmd();
    const count = await this.prisma.approvals.count({
      where: { code: { startsWith: `APR-${ymd}-` } },
    });
    const code = `APR-${ymd}-${String(count + 1).padStart(5, '0')}`;

    // 4) Create approval + revision 1 (DRAFT)
    const result = await this.prisma.$transaction(async (tx) => {
      const approval = await tx.approvals.create({
        data: {
          code,
          work_order_id: dto.workOrderId,
          proposer_id: actorId,
          status: ApprovalStatus.DRAFT,
          row_version: 1,
        },
      });
      const revision = await tx.approval_revisions.create({
        data: {
          approval_id: approval.id,
          revision_no: 1,
          reason: dto.reason,
          action_plan: dto.actionPlan,
          other_estimated_cost: new Prisma.Decimal(dto.otherEstimatedCost ?? 0),
          policy_snapshot: {} as Prisma.InputJsonValue,
        },
      });
      // Q-06: luu ngan sach linh kien cho revision 1. Neu DTO khong gui `parts`,
      // nap tu `work_order_parts` cua WO (so luong keo hoach).
      await this.persistRevisionParts(tx, revision.id, dto.parts, dto.workOrderId);
      return { approval, revision };
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'approval.draft_created',
      objectType: 'Approval',
      objectKey: result.approval.id,
      correlationKey: result.approval.id,
      newValue: { code, workOrderId: dto.workOrderId },
    });

    return this.get(result.approval.id);
  }

  async updateDraft(actorId: string, id: string, dto: UpdateDraftApprovalDto) {
    const a = await this.prisma.approvals.findUnique({ where: { id } });
    if (!a) throw AppError.notFound('Khong tim thay approval', { id });
    if (a.proposer_id !== actorId) {
      throw AppError.forbidden('Chi proposer moi co the sua draft', {
        actorId,
        proposerId: a.proposer_id,
      });
    }
    if (
      a.status !== ApprovalStatus.DRAFT &&
      a.status !== ApprovalStatus.INFO_REQUESTED &&
      a.status !== ApprovalStatus.REJECTED
    ) {
      throw AppError.unprocessable(
        'APR_NOT_EDITABLE',
        'Chi sua draft khi approval o trang thai DRAFT/INFO_REQUESTED/REJECTED',
        { status: a.status },
      );
    }

    const latest = await this.getLatestRevision(id);
    if (!latest) {
      throw AppError.unprocessable('APR_NO_REVISION', 'Approval khong co revision', { id });
    }
    await this.prisma.approval_revisions.update({
      where: { id: latest.id },
      data: {
        reason: dto.reason,
        action_plan: dto.actionPlan,
        other_estimated_cost: new Prisma.Decimal(dto.otherEstimatedCost ?? 0),
      },
    });
    // Q-06: cap nhat ngan sach linh kien cua revision hien tai.
    if (dto.parts !== undefined) {
      await this.persistRevisionParts(this.prisma, latest.id, dto.parts, a.work_order_id);
    }

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'approval.draft_updated',
      objectType: 'Approval',
      objectKey: id,
      correlationKey: id,
    });

    return this.get(id);
  }

  async performAction(
    actorId: string,
    actorPermissions: PermissionCode[],
    id: string,
    dto: ApprovalActionDto,
  ) {
    const a = await this.prisma.approvals.findUnique({
      where: { id },
      include: {
        work_order: { select: { id: true, status: true } },
      },
    });
    if (!a) throw AppError.notFound('Khong tim thay approval', { id });

    // Plan M6 §12.2: per-action permission gate (route M6 unified action).
    const actionPerm: Record<string, PermissionCode> = {
      [ApprovalEventType.SUBMITTED]: Permission.APPROVAL_SUBMIT,
      [ApprovalEventType.APPROVED]: Permission.APPROVAL_DECIDE,
      [ApprovalEventType.REJECTED]: Permission.APPROVAL_DECIDE,
      [ApprovalEventType.INFO_REQUESTED]: Permission.APPROVAL_REQUEST_INFO,
      [ApprovalEventType.CANCELLED]: Permission.APPROVAL_CANCEL,
    };
    const requiredPerm = actionPerm[String(dto.action)];
    if (requiredPerm && !actorPermissions.includes(requiredPerm)) {
      throw AppError.forbidden(`Action ${dto.action} can ${requiredPerm}`, {
        action: dto.action,
        required: requiredPerm,
        code: 'APR_PERMISSION_DENIED',
      });
    }

    // Optimistic lock (R-04)
    if (dto.rowVersion !== undefined && Number(dto.rowVersion) !== a.row_version) {
      throw AppError.conflict('Approval da duoc cap nhat boi nguoi khac', {
        currentVersion: a.row_version,
        providedVersion: Number(dto.rowVersion),
      });
    }

    const current = a.status as ApprovalStatus;
    const target = resolveTargetState(current, this.toAction(dto.action));
    assertApprovalTransition(current, target);

    // Self-approval guard (FR-APR-09) o layer service (DB trigger cung check)
    if (target === ApprovalStatus.APPROVED && a.proposer_id === actorId) {
      throw AppError.unprocessable(
        'APR_SELF_APPROVAL_FORBIDDEN',
        'Khong the tu duyet approval cua chinh minh (FR-APR-09)',
        { actorId, proposerId: a.proposer_id },
      );
    }

    // Permission logic:
    //   - proposer: submit, cancel, createNewRevision
    //   - approver (khac proposer): approve, reject, request-info
    const isProposer = a.proposer_id === actorId;
    if (
      isProposer &&
      (dto.action === ApprovalEventType.APPROVED ||
        dto.action === ApprovalEventType.REJECTED ||
        dto.action === ApprovalEventType.INFO_REQUESTED)
    ) {
      throw AppError.forbidden('Proposer khong the tu quyet dinh approval cua minh', { actorId });
    }

    // Approval revoke (optional): chi admin moi REVOKED
    if (dto.action === 'CANCELLED' && isProposer && current !== ApprovalStatus.SUBMITTED) {
      // cho phep proposer cancel DRAFT/INFO_REQUESTED
    }

    // Latest revision de gan SUBMITTED at
    const revision = await this.getLatestRevision(id);
    if (!revision) {
      throw AppError.unprocessable('APR_NO_REVISION', 'Approval khong co revision', { id });
    }

    // Update transaction: approvals + approval_revisions + approval_events + WO status
    const updated = await this.prisma.$transaction(async (tx) => {
      const patch: Prisma.approvalsUpdateInput = {
        status: target,
        row_version: { increment: 1 },
      };
      const updatedApp = await tx.approvals.update({
        where: { id, row_version: a.row_version },
        data: patch,
      });

      // Revision side-effects theo action
      const revPatch: Prisma.approval_revisionsUpdateInput = {};
      if (target === ApprovalStatus.SUBMITTED && current === ApprovalStatus.DRAFT) {
        revPatch.submitted_at = new Date();
      }
      if (Object.keys(revPatch).length > 0) {
        await tx.approval_revisions.update({
          where: { id: revision.id },
          data: revPatch,
        });
      }

      // Event log
      await tx.approval_events.create({
        data: {
          approval_id: id,
          revision_id: revision.id,
          actor_id: actorId,
          event_type: dto.action as ApprovalEventType,
          note: dto.note ?? '',
        },
      });

      // WO status coupling
      if (target === ApprovalStatus.SUBMITTED && current === ApprovalStatus.DRAFT) {
        await this.enterWaitingApproval(actorId, tx, a.work_order_id);
      } else if (
        target === ApprovalStatus.APPROVED ||
        target === ApprovalStatus.REJECTED ||
        (target === ApprovalStatus.CANCELLED && current === ApprovalStatus.SUBMITTED) ||
        target === ApprovalStatus.INFO_REQUESTED
      ) {
        // Khi SUBMITTED -> APPROVED/REJECTED/INFO_REQUESTED/CANCELLED:
        // WO ve IN_PROGRESS (work tiep).
        // INFO_REQUESTED: WO van cho (co the van paused, khong can thay doi WAITING_APPROVAL).
        if (target === ApprovalStatus.INFO_REQUESTED) {
          // WO giu WAITING_APPROVAL, ghi note
          await tx.work_order_notes.create({
            data: {
              work_order_id: a.work_order_id,
              author_id: actorId,
              note_type: WorkOrderNoteType.PROGRESS,
              note: 'Approval yeu cau them thong tin (INFO_REQUESTED)',
            },
          });
        } else {
          await this.exitWaitingApproval(actorId, tx, a.work_order_id);
        }
      }

      return updatedApp;
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'approval.' + dto.action.toLowerCase(),
      objectType: 'Approval',
      objectKey: id,
      correlationKey: id,
      oldValue: { status: current },
      newValue: { status: target, note: dto.note ?? null },
    });

    return this.get(updated.id);
  }

  /**
   * Tao revision moi (proposer mo lai sau khi APPROVED/REJECTED/INFO_REQUESTED).
   */
  async createNewRevision(actorId: string, id: string) {
    const a = await this.prisma.approvals.findUnique({ where: { id } });
    if (!a) throw AppError.notFound('Khong tim thay approval', { id });
    if (a.proposer_id !== actorId) {
      throw AppError.forbidden('Chi proposer moi co the mo revision moi', {
        actorId,
        proposerId: a.proposer_id,
      });
    }
    if (
      a.status !== ApprovalStatus.APPROVED &&
      a.status !== ApprovalStatus.REJECTED &&
      a.status !== ApprovalStatus.INFO_REQUESTED
    ) {
      throw AppError.unprocessable(
        'APR_INVALID_FOR_NEW_REVISION',
        'Chi mo revision moi khi APPROVED/REJECTED/INFO_REQUESTED',
        { status: a.status },
      );
    }

    const latest = await this.getLatestRevision(id);
    const nextNo = (latest?.revision_no ?? 0) + 1;

    const result = await this.prisma.$transaction(async (tx) => {
      const newRev = await tx.approval_revisions.create({
        data: {
          approval_id: id,
          revision_no: nextNo,
          reason: latest?.reason ?? '',
          action_plan: latest?.action_plan ?? '',
          other_estimated_cost: latest?.other_estimated_cost ?? new Prisma.Decimal(0),
          policy_snapshot: (latest?.policy_snapshot ?? {}) as Prisma.InputJsonValue,
        },
      });
      const updated = await tx.approvals.update({
        where: { id, row_version: a.row_version },
        data: { status: ApprovalStatus.DRAFT, row_version: { increment: 1 } },
      });
      await tx.approval_events.create({
        data: {
          approval_id: id,
          revision_id: newRev.id,
          actor_id: actorId,
          event_type: ApprovalEventType.REVISION_CREATED,
          note: `Revision ${nextNo}`,
        },
      });
      // WO tiep tuc WAITING_APPROVAL (cho revision moi)
      await this.enterWaitingApproval(actorId, tx, a.work_order_id);
      // Q-06: carry ngan sach linh kien sang revision moi (tu revision truoc,
      // fallback nap lai tu work_order_parts neu revision truoc chua co parts).
      await this.copyRevisionParts(tx, newRev.id, latest?.id ?? null, a.work_order_id);
      return updated;
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'approval.new_revision',
      objectType: 'Approval',
      objectKey: id,
      correlationKey: id,
      newValue: { revisionNo: nextNo },
    });

    return this.get(result.id);
  }

  // ===========================================================================
  // Internal helpers
  // ===========================================================================

  private async getLatestRevision(approvalId: string) {
    return this.prisma.approval_revisions.findFirst({
      where: { approval_id: approvalId },
      orderBy: { revision_no: 'desc' },
    });
  }

  /**
   * Luu ngan sach linh kien cho 1 revision (Q-06).
   *
   * Day la noi DUY Nhat de `approval_revision_parts` duoc ghi tu API — truoc do
   * chi co the ghi truc tiep qua Prisma nen UI khong the mo duong xuat linh kien
   * ma van cho phep `assertWithinIssuedBudget` kiem soat so luong xuat.
   *
   * - `parts` (tu DTO) uu tien; neu undefined/rong -> nap tu `work_order_parts`
   *   cua WO (so luong keo hoach cua ky sua chua).
   * - Snapshot `part_name_snapshot` + `requires_approval_snapshot` de audit trail
   *   khong doi khi danh muc part bi sua doi sau do.
   */
  private async persistRevisionParts(
    tx: Prisma.TransactionClient | PrismaService,
    revisionId: string,
    parts: ApprovalRevisionPartInput[] | undefined,
    workOrderId: string | null,
  ) {
    let requested = parts ?? [];

    if (requested.length === 0 && workOrderId) {
      const planned = await tx.work_order_parts.findMany({
        where: { work_order_id: workOrderId },
        include: { part: { select: { name: true, requires_approval: true } } },
      });
      requested = planned.map(
        (p: {
          part_id: string;
          planned_quantity: { toString(): string } | number;
          part: { name: string; requires_approval: boolean };
        }) => ({
          partId: p.part_id,
          quantity: Number(p.planned_quantity),
          requiresApproval: p.part.requires_approval,
        }),
      );
    }

    if (requested.length === 0) return;

    // Resolve thong tin part (gia + ten + co can approval hay khong).
    const partIds = [...new Set(requested.map((p) => p.partId))];
    const partRows = await tx.parts.findMany({
      where: { id: { in: partIds } },
      select: {
        id: true,
        name: true,
        reference_price: true,
        requires_approval: true,
        is_active: true,
      },
    });
    type PartRow = (typeof partRows)[number];
    const partMap = new Map<string, PartRow>(partRows.map((p) => [p.id, p]));

    const missing = partIds.filter((id) => !partMap.has(id));
    if (missing.length > 0) {
      throw AppError.unprocessable('APR_PART_NOT_FOUND', 'Linh kien khong ton tai', {
        partIds: missing,
      });
    }
    const inactive = partIds.filter((id) => !partMap.get(id)!.is_active);
    if (inactive.length > 0) {
      throw AppError.unprocessable(
        'APR_PART_INACTIVE',
        'Linh kien da ngung hoat dong, khong the xin cap',
        { partIds: inactive },
      );
    }

    // Ghi lai toan bo ngan sach revision (thay the ban cu).
    await tx.approval_revision_parts.deleteMany({ where: { revision_id: revisionId } });

    const data = requested.map((p) => {
      const part = partMap.get(p.partId)!;
      const qty = new Prisma.Decimal(p.quantity ?? 0);
      if (qty.lte(0)) {
        throw AppError.unprocessable(
          'APR_PART_QTY_MUST_BE_POSITIVE',
          'So luong linh kien xin cap phai > 0',
          { partId: p.partId, quantity: p.quantity ?? 0 },
        );
      }
      return {
        revision_id: revisionId,
        part_id: part.id,
        quantity: qty,
        unit_price: new Prisma.Decimal(p.unitPrice ?? part.reference_price ?? 0),
        part_name_snapshot: part.name,
        requires_approval_snapshot: p.requiresApproval ?? part.requires_approval,
      };
    });

    await tx.approval_revision_parts.createMany({ data, skipDuplicates: true });
  }

  /**
   * Copy ngan sach linh kien tu revision cu sang revision moi (REVISION_CREATED).
   *
   * Revision moi ke thua so luong da duyet truoc do; proposer chinh sua them o
   * `PATCH /approvals/:id/draft`. Neu revision cu chua co parts -> nap tu
   * `work_order_parts` qua `persistRevisionParts`.
   */
  private async copyRevisionParts(
    tx: Prisma.TransactionClient,
    newRevisionId: string,
    previousRevisionId: string | null,
    workOrderId: string | null,
  ) {
    if (previousRevisionId) {
      const prev = await tx.approval_revision_parts.findMany({
        where: { revision_id: previousRevisionId },
      });
      if (prev.length > 0) {
        await this.persistRevisionParts(
          tx,
          newRevisionId,
          prev.map(
            (p: {
              part_id: string;
              quantity: { toString(): string };
              unit_price: { toString(): string };
              requires_approval_snapshot: boolean;
            }) => ({
              partId: p.part_id,
              quantity: Number(p.quantity),
              unitPrice: Number(p.unit_price),
              requiresApproval: p.requires_approval_snapshot,
            }),
          ),
          null,
        );
        return;
      }
    }
    await this.persistRevisionParts(tx, newRevisionId, undefined, workOrderId);
  }

  private async enterWaitingApproval(
    actorId: string,
    tx: Prisma.TransactionClient,
    workOrderId: string,
  ): Promise<void> {
    // Tim pause-approval interval dang mo (neu co) -> khong tao moi
    const openInt = await tx.work_order_notes.findFirst({
      where: {
        work_order_id: workOrderId,
        note_type: WorkOrderNoteType.WAITING_APPROVAL_START,
      },
      orderBy: { created_at: 'desc' },
    });
    if (openInt) return;

    const wo = await tx.work_orders.findUnique({
      where: { id: workOrderId },
      select: { status: true },
    });
    if (!wo) return;

    if (
      wo.status !== WorkOrderStatus.WAITING_APPROVAL &&
      wo.status !== WorkOrderStatus.COMPLETED &&
      wo.status !== WorkOrderStatus.CANCELLED
    ) {
      await tx.work_orders.update({
        where: { id: workOrderId },
        data: {
          status: WorkOrderStatus.WAITING_APPROVAL,
          row_version: { increment: 1 },
        },
      });
    }
    await tx.work_order_notes.create({
      data: {
        work_order_id: workOrderId,
        author_id: actorId,
        note_type: WorkOrderNoteType.WAITING_APPROVAL_START,
        note: 'Approval da SUBMITTED - WO chuyen WAITING_APPROVAL',
      },
    });
  }

  private async exitWaitingApproval(
    actorId: string,
    tx: Prisma.TransactionClient,
    workOrderId: string,
  ): Promise<void> {
    const openInt = await tx.work_order_notes.findFirst({
      where: {
        work_order_id: workOrderId,
        note_type: WorkOrderNoteType.WAITING_APPROVAL_START,
      },
      orderBy: { created_at: 'desc' },
    });
    if (openInt) {
      await tx.work_order_notes.create({
        data: {
          work_order_id: workOrderId,
          author_id: actorId,
          note_type: WorkOrderNoteType.WAITING_APPROVAL_END,
          note: 'Approval decision - WO tro ve IN_PROGRESS',
        },
      });
    }
    const wo = await tx.work_orders.findUnique({
      where: { id: workOrderId },
      select: { status: true },
    });
    if (wo && wo.status === WorkOrderStatus.WAITING_APPROVAL) {
      await tx.work_orders.update({
        where: { id: workOrderId },
        data: {
          status: WorkOrderStatus.IN_PROGRESS,
          row_version: { increment: 1 },
        },
      });
    }
  }

  private toAction(
    event: ApprovalActionDto['action'],
  ): 'submit' | 'approve' | 'reject' | 'request-info' | 'cancel' {
    switch (event) {
      case 'SUBMITTED':
        return 'submit';
      case 'APPROVED':
        return 'approve';
      case 'REJECTED':
        return 'reject';
      case 'INFO_REQUESTED':
        return 'request-info';
      case 'CANCELLED':
        return 'cancel';
    }
  }

  private todayYmd(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toListDto(a: any) {
    const latest = a.revisions?.[0];
    const wo = a.work_order
      ? {
          id: a.work_order.id,
          code: a.work_order.code,
          description: a.work_order.description ?? null,
          status: a.work_order.status,
          priorityCode: a.work_order.priority_code ?? null,
          priority_code: a.work_order.priority_code ?? null,
          asset: a.work_order.asset ?? null,
        }
      : null;
    return {
      id: a.id,
      code: a.code,
      status: a.status,
      // Frontend doc `reason` (ly do cua revision moi nhat).
      reason: latest?.reason ?? '',
      proposer: this.toUserBrief(a.proposer),
      workOrder: wo,
      currentRevision: latest
        ? {
            id: latest.id,
            revisionNo: latest.revision_no,
            netCost: latest.other_estimated_cost?.toString() ?? '0',
            submittedAt:
              latest.submitted_at instanceof Date
                ? latest.submitted_at.toISOString()
                : (latest.submitted_at ?? null),
          }
        : null,
      latestRevisionNo: latest?.revision_no ?? 1,
      latestSubmittedAt: latest?.submitted_at ?? null,
      latestBudget: latest?.other_estimated_cost?.toString() ?? '0',
      createdAt: a.created_at instanceof Date ? a.created_at.toISOString() : a.created_at,
      rowVersion: a.row_version,
      updatedAt: a.updated_at instanceof Date ? a.updated_at.toISOString() : a.updated_at,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDetailDto(a: any) {
    return {
      ...this.toListDto(a),
      // Revision hien tai: lay `parts` da map de FE hien thi bang linh kien.
      currentRevision: this.toRevisionDto(a.revisions?.[0]),
      revisions: (a.revisions ?? []).map((r: ApprovalRevisionRow) => this.toRevisionDto(r)),
      events: (a.events ?? []).map((e: ApprovalEventRow) => ({
        id: e.id,
        eventType: e.event_type,
        note: e.note,
        actorName: e.actor?.full_name ?? 'Hệ thống',
        actorId: e.actor_id,
        createdAt: e.created_at instanceof Date ? e.created_at.toISOString() : e.created_at,
        event_type: e.event_type,
      })),
    };
  }

  /** Revision -> camelCase, kem `parts` cho UI. */
  private toRevisionDto(r: ApprovalRevisionRow | null | undefined) {
    if (!r) return null;
    return {
      id: r.id,
      revisionNo: r.revision_no,
      reason: r.reason,
      actionPlan: r.action_plan,
      otherEstimatedCost: r.other_estimated_cost?.toString() ?? '0',
      netCost: r.other_estimated_cost?.toString() ?? '0',
      submittedAt:
        r.submitted_at instanceof Date ? r.submitted_at.toISOString() : (r.submitted_at ?? null),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      parts: (r.parts ?? []).map((p: ApprovalRevisionPartRow) => ({
        partId: p.part_id,
        partCode: p.part?.code ?? null,
        partName: p.part?.name ?? p.part_name_snapshot,
        partNameSnapshot: p.part_name_snapshot,
        quantity: p.quantity?.toString() ?? '0',
        unitPrice: p.unit_price?.toString() ?? '0',
        requiresApprovalSnapshot: p.requires_approval_snapshot,
        part: p.part ?? null,
      })),
    };
  }

  /** User relation -> { id, loginName, fullName }. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toUserBrief(u: any) {
    if (!u) return null;
    return {
      id: u.id,
      loginName: u.login_name,
      fullName: u.full_name,
      login_name: u.login_name,
      full_name: u.full_name,
    };
  }
}
