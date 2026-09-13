import { PrismaClient, type Prisma } from '@prisma/client';
import {
  advanceDueOn,
  isDueOverdue,
  MaintenanceOccurrenceStatus,
  toDateOnly,
  writeAudit,
  type MaintenanceIntervalUnit as IntervalUnit,
} from '../index.js';
import { WorkOrderStatus, WorkOrderType, WorkOrderCreationMode } from '@equipcare/shared';

/**
 * Maintenance scheduler tick (Doc04 §5.10 + Q-02 + plan M8).
 *
 * Co the goi tu API (PrismaService) hoac tu worker (singleton PrismaClient backend-core).
 *
 * Logic:
 *   1) Voi moi plan ACTIVE + FIXED:
 *        - neu next_due_on <= today va chua co occurrence (UNIQUE plan_id+due_on):
 *            + due_on qua hom nay -> OVERDUE
 *            + due_on hom nay -> PLANNED
 *        - advance next_due_on theo interval.
 *   2) Voi plan is_active=false va next_due_on <= now → SKIPPED (PAUSED).
 *   3) Voi moi occurrence PLANNED/OVERDUE chua co WO open:
 *        - tao WO (kind='MAINTENANCE', creation_mode='FROM_MAINTENANCE').
 *        - occurrence.status = 'IN_PROGRESS'.
 *   4) Voi occurrence da co WO COMPLETED gan nhat:
 *        - status = 'COMPLETED'.
 *
 * Tra ve: { advanced, createdOcc, skipped, createdWO }.
 */
export interface SchedulerTickResult {
  advancedPlans: number;
  createdOccurrences: number;
  skippedOccurrences: number;
  createdWorkOrders: number;
}

export async function runSchedulerTick(
  prisma: PrismaClient,
): Promise<SchedulerTickResult> {
  const now = new Date();
  let advanced = 0;
  let createdOcc = 0;
  let skipped = 0;
  let createdWO = 0;

  const plans = await prisma.maintenance_plans.findMany({
    where: { is_active: true, schedule_basis: 'FIXED' },
  });

  for (const plan of plans) {
    if (!plan.next_due_on) continue;
    const due = new Date(plan.next_due_on);

    const existing = await prisma.maintenance_occurrences.findUnique({
      where: { plan_id_due_on: { plan_id: plan.id, due_on: due } },
    });
    if (!existing && due.getTime() <= now.getTime()) {
      const isOverdue = isDueOverdue(due, now);
      await prisma.maintenance_occurrences.create({
        data: {
          plan_id: plan.id,
          asset_id: plan.asset_id,
          due_on: due,
          status: isOverdue
            ? MaintenanceOccurrenceStatus.OVERDUE
            : MaintenanceOccurrenceStatus.PLANNED,
          plan_version: plan.row_version,
          plan_snapshot: {
            name: plan.name,
            interval_unit: plan.interval_unit,
            interval_value: plan.interval_value,
            checklist: plan.checklist,
          } as Prisma.InputJsonValue,
        },
      });
      createdOcc++;
    }

    if (due.getTime() <= now.getTime()) {
      const next = advanceDueOn(
        due,
        plan.interval_unit as IntervalUnit,
        plan.interval_value,
      );
      await prisma.maintenance_plans.update({
        where: { id: plan.id, row_version: plan.row_version },
        data: { next_due_on: next, row_version: { increment: 1 } },
      });
      advanced++;
    }
  }

  const pausedPlans = await prisma.maintenance_plans.findMany({
    where: { is_active: false, next_due_on: { lte: now } },
  });
  for (const plan of pausedPlans) {
    if (!plan.next_due_on) continue;
    const due = new Date(plan.next_due_on);
    const existing = await prisma.maintenance_occurrences.findUnique({
      where: { plan_id_due_on: { plan_id: plan.id, due_on: due } },
    });
    if (!existing) {
      await prisma.maintenance_occurrences.create({
        data: {
          plan_id: plan.id,
          asset_id: plan.asset_id,
          due_on: due,
          status: MaintenanceOccurrenceStatus.SKIPPED,
          plan_version: plan.row_version,
          plan_snapshot: {
            name: plan.name,
            interval_unit: plan.interval_unit,
            interval_value: plan.interval_value,
            checklist: plan.checklist,
          } as Prisma.InputJsonValue,
        },
      });
      skipped++;
      const next = advanceDueOn(
        due,
        plan.interval_unit as IntervalUnit,
        plan.interval_value,
      );
      await prisma.maintenance_plans.update({
        where: { id: plan.id, row_version: plan.row_version },
        data: { next_due_on: next, row_version: { increment: 1 } },
      });
    }
  }

  const pending = await prisma.maintenance_occurrences.findMany({
    where: {
      status: {
        in: [MaintenanceOccurrenceStatus.PLANNED, MaintenanceOccurrenceStatus.OVERDUE],
      },
    },
  });
  for (const occ of pending) {
    const openWo = await prisma.work_orders.findFirst({
      where: {
        occurrence_id: occ.id,
        status: { notIn: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED] },
      },
    });
    if (openWo) continue;

    const plan = await prisma.maintenance_plans.findUnique({ where: { id: occ.plan_id } });
    if (!plan) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snap = occ.plan_snapshot as any;
    const checklist = Array.isArray(snap?.checklist) ? snap.checklist : [];

    const ymd = toDateOnly(now).replace(/-/g, '');
    const count = await prisma.work_orders.count({
      where: { code: { startsWith: `WO-${ymd}-` } },
    });
    const code = `WO-${ymd}-${String(count + 1).padStart(5, '0')}`;

    const adminUser = await prisma.users.findFirstOrThrow({
      where: { login_name: 'admin.bootstrap' },
    });
    const asset = await prisma.assets.findUnique({ where: { id: plan.asset_id } });

    await prisma.$transaction(async (tx) => {
      await tx.work_orders.create({
        data: {
          code,
          asset_id: occ.asset_id,
          kind: WorkOrderType.MAINTENANCE,
          creation_mode: WorkOrderCreationMode.FROM_MAINTENANCE,
          priority_code: 'MEDIUM',
          description: `Auto sinh tu ke hoach bao tri #${plan.name} (due_on=${toDateOnly(occ.due_on)})`,
          created_by: adminUser.id,
          occurrence_id: occ.id,
          department_id_snapshot: asset?.department_id ?? plan.asset_id,
          status: WorkOrderStatus.NEW,
          due_at: new Date(occ.due_on.getTime() + 24 * 60 * 60 * 1000),
          checklist_snapshot: checklist as Prisma.InputJsonValue,
        },
      });
      await tx.maintenance_occurrences.update({
        where: { id: occ.id },
        data: { status: MaintenanceOccurrenceStatus.IN_PROGRESS },
      });
    });

    await writeAudit({
      actorId: adminUser.id,
      actorType: 'SYSTEM',
      action: 'maintenance_occurrence.work_order_created',
      objectType: 'MaintenanceOccurrence',
      objectKey: occ.id,
      newValue: { planId: plan.id, dueOn: toDateOnly(occ.due_on) },
    });
    createdWO++;
  }

  const inProg = await prisma.maintenance_occurrences.findMany({
    where: { status: MaintenanceOccurrenceStatus.IN_PROGRESS },
  });
  for (const occ of inProg) {
    const latest = await prisma.work_orders.findFirst({
      where: { occurrence_id: occ.id },
      orderBy: { created_at: 'desc' },
    });
    if (latest && latest.status === WorkOrderStatus.COMPLETED) {
      await prisma.maintenance_occurrences.update({
        where: { id: occ.id },
        data: { status: MaintenanceOccurrenceStatus.COMPLETED },
      });
    }
  }

  return {
    advancedPlans: advanced,
    createdOccurrences: createdOcc,
    skippedOccurrences: skipped,
    createdWorkOrders: createdWO,
  };
}
