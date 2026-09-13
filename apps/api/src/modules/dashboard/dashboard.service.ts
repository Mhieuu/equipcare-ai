import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * DashboardService - M9 (Doc04 + plan section 12.2 M9).
 *
 * KPIs (Doc04 §5.8 + Doc05 §8.4):
 *   - /dashboard/kpis          : tong quan so dem (open WO, overdue, pending approval, low stock).
 *   - /dashboard/overdue       : WO overdue (active_elapsed > sla_seconds, Q-04).
 *   - /dashboard/technician-load: assignee hien tai dang bao nhieu WO (SCR-DASH-01b).
 *   - /dashboard/asset-critical: asset co nhieu incident / chi phi cao (SCR-REP-05).
 *
 * View v_kpi_* runtime qua Prisma raw (Doc04: khong tao bang rieng).
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // /dashboard/kpis - tong quan counters
  // ---------------------------------------------------------------------------
  async getKpis() {
    const [openWo, overdue, pendingApproval, lowStock, unreadNotif] = await Promise.all([
      this.prisma.work_orders.count({
        where: { status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_APPROVAL'] } },
      }),
      this.countOverdueWorkOrders(),
      this.prisma.approvals.count({ where: { status: 'SUBMITTED' } }),
      this.prisma.parts.count({
        where: { is_active: true, minimum_stock: { gt: 0 } },
      }).then(async () => {
        // Dem so part thuc su low_stock
        const items = await this.prisma.parts.findMany({
          where: { is_active: true, minimum_stock: { gt: 0 } },
          select: { on_hand: true, minimum_stock: true },
        });
        return items.filter((p) => Number(p.on_hand) < Number(p.minimum_stock)).length;
      }),
      this.prisma.notifications.count({ where: { read_at: null } }),
    ]);

    return {
      openWorkOrders: openWo,
      overdueWorkOrders: overdue,
      pendingApprovals: pendingApproval,
      lowStockParts: lowStock,
      unreadNotifications: unreadNotif,
    };
  }

  // ---------------------------------------------------------------------------
  // /dashboard/overdue - WO overdue (Q-04: active_elapsed > sla_seconds)
  // ---------------------------------------------------------------------------
  async getOverdueWorkOrders() {
    // Lay system_settings.sla (default HIGH=4h, MEDIUM=24h, LOW=72h theo plan Q-04)
    const settings = await this.prisma.system_settings.findMany({
      where: { key: { startsWith: 'sla.' } },
    });
    const slaMap = new Map<string, number>();
    for (const s of settings) {
      const priority = s.key.replace(/^sla\./, '').toUpperCase();
      // value la JSON; co the la number hoac { seconds: ... }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = s.value as any;
      let sec = 0;
      if (typeof raw === 'number') sec = raw;
      else if (typeof raw === 'string') sec = Number(raw) || 0;
      else if (raw && typeof raw === 'object') {
        sec = Number(raw.seconds ?? raw.value ?? raw.hours ? Number(raw.hours) * 3600 : 0) || 0;
      }
      if (sec > 0) slaMap.set(priority, sec);
    }
    // Defaults
    if (!slaMap.has('HIGH')) slaMap.set('HIGH', 4 * 3600);
    if (!slaMap.has('MEDIUM')) slaMap.set('MEDIUM', 24 * 3600);
    if (!slaMap.has('LOW')) slaMap.set('LOW', 72 * 3600);

    // Lay WO dang active (NEW, ASSIGNED, IN_PROGRESS, WAITING_APPROVAL)
    const wos = await this.prisma.work_orders.findMany({
      where: {
        status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_APPROVAL'] },
        started_at: { not: null },
      },
      include: {
        asset: { select: { code: true, name: true } },
        assignee: { select: { id: true, full_name: true } },
      },
      orderBy: { due_at: 'asc' },
      take: 100,
    });

    const now = Date.now();
    const overdue: Array<{
      id: string;
      code: string;
      assetCode: string;
      assetName: string;
      assignee: string | null;
      priority: string;
      dueAt: string | null;
      activeElapsedSeconds: number;
      slaSeconds: number;
      status: string;
    }> = [];

    for (const wo of wos) {
      const startedAt = wo.started_at instanceof Date ? wo.started_at.getTime() : null;
      if (!startedAt) continue;
      const dueAt = wo.due_at instanceof Date ? wo.due_at.getTime() : null;

      // Lay pause / waiting_approval tu notes (Q-04)
      const excludedSeconds = await this.computeExcludedSeconds(wo.id);
      const totalElapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
      const active = Math.max(0, totalElapsed - excludedSeconds);

      const sla = slaMap.get((wo.priority_code ?? 'MEDIUM').toUpperCase()) ?? 24 * 3600;
      if (active > sla) {
        overdue.push({
          id: wo.id,
          code: wo.code,
          assetCode: wo.asset?.code ?? '',
          assetName: wo.asset?.name ?? '',
          assignee: wo.assignee?.full_name ?? null,
          priority: wo.priority_code,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          activeElapsedSeconds: active,
          slaSeconds: sla,
          status: wo.status,
        });
      }
    }

    return { items: overdue, total: overdue.length };
  }

  // ---------------------------------------------------------------------------
  // /dashboard/technician-load - assignee WO count (SCR-DASH-01b)
  // ---------------------------------------------------------------------------
  async getTechnicianLoad() {
    const users = await this.prisma.users.findMany({
      where: {
        user_roles: {
          some: {
            revoked_at: null,
            role: { code: 'TECHNICIAN' },
          },
        },
      },
      select: { id: true, full_name: true, login_name: true },
    });

    const items = await Promise.all(
      users.map(async (u) => {
        const counts = await this.prisma.work_orders.groupBy({
          by: ['status'],
          where: { assignee_id: u.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
          _count: { _all: true },
        });
        const total = counts.reduce((s, c) => s + c._count._all, 0);
        const byStatus: Record<string, number> = {};
        for (const c of counts) byStatus[c.status] = c._count._all;
        return {
          technicianId: u.id,
          fullName: u.full_name,
          loginName: u.login_name,
          activeWorkOrders: total,
          byStatus,
        };
      }),
    );

    items.sort((a, b) => b.activeWorkOrders - a.activeWorkOrders);
    return { items };
  }

  // ---------------------------------------------------------------------------
  // /dashboard/cost-trend - xu huong chi phi 12 thang (Doc05 §8.4)
  // ---------------------------------------------------------------------------
  async getCostTrend(opts: { months?: number } = {}) {
    const months = Math.min(Math.max(opts.months ?? 12, 1), 24);
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const entries = await this.prisma.cost_entries.findMany({
      where: { created_at: { gte: since } },
      select: { category: true, direction: true, quantity: true, unit_price: true, created_at: true },
    });

    const buckets = new Map<string, { partCost: number; laborCost: number; otherCost: number; totalCost: number }>();
    for (let i = 0; i < months; i++) {
      const d = new Date(since);
      d.setMonth(d.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, { partCost: 0, laborCost: 0, otherCost: 0, totalCost: 0 });
    }

    for (const e of entries) {
      const d = e.created_at instanceof Date ? e.created_at : new Date(e.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(key);
      if (!bucket) continue;
      const amount =
        (e.direction === 'DEBIT' ? 1 : -1) * Number(e.quantity) * Number(e.unit_price);
      if (e.category === 'PART') bucket.partCost += amount;
      else if (e.category === 'LABOR') bucket.laborCost += amount;
      else bucket.otherCost += amount;
      bucket.totalCost += amount;
    }

    const items = Array.from(buckets.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([month, b]) => ({ month, ...b }));
    return { items, months };
  }

  // ---------------------------------------------------------------------------
  // /dashboard/action-items - TODO widgets (Doc05 §8.4)
  // ---------------------------------------------------------------------------
  async getActionItems(opts: { limit?: number } = {}) {
    const limit = Math.min(opts.limit ?? 20, 100);
    const overdueAge = 24 * 3600 * 1000;
    const since = new Date(Date.now() - overdueAge);

    const stuckWos = await this.prisma.work_orders.findMany({
      where: {
        status: { in: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_APPROVAL'] },
        created_at: { lte: since },
      },
      include: {
        asset: { select: { code: true, name: true } },
        assignee: { select: { full_name: true } },
      },
      orderBy: { created_at: 'asc' },
      take: limit,
    });

    const stuckApprovalsRaw = await this.prisma.approvals.findMany({
      where: { status: 'SUBMITTED' },
      select: { id: true, code: true, work_order_id: true, proposer_id: true, updated_at: true, created_at: true },
      orderBy: { updated_at: 'asc' },
      take: limit,
    });
    // Lay them thong tin user + WO
    const proposerIds = Array.from(new Set(stuckApprovalsRaw.map((a) => a.proposer_id)));
    const woIds = Array.from(new Set(stuckApprovalsRaw.map((a) => a.work_order_id)));
    const [proposers, wos] = await Promise.all([
      this.prisma.users.findMany({
        where: { id: { in: proposerIds } },
        select: { id: true, full_name: true },
      }),
      this.prisma.work_orders.findMany({
        where: { id: { in: woIds } },
        select: { id: true, code: true },
      }),
    ]);
    const proposerMap = new Map(proposers.map((p) => [p.id, p.full_name]));
    const woMap = new Map(wos.map((w) => [w.id, w.code]));
    // Filter sau theo updated_at (thay cho submitted_at)
    const stuckApprovals = stuckApprovalsRaw.filter((a) => a.updated_at.getTime() <= since.getTime());

    const lowStockParts = await this.prisma.parts.findMany({
      where: { is_active: true, minimum_stock: { gt: 0 } },
      select: { id: true, code: true, name: true, on_hand: true, minimum_stock: true },
      take: 200,
    });
    const lowStock = lowStockParts
      .filter((p) => Number(p.on_hand) < Number(p.minimum_stock))
      .slice(0, limit);

    return {
      stuckWorkOrders: stuckWos.map((w) => ({
        id: w.id,
        code: w.code,
        asset: w.asset ? { code: w.asset.code, name: w.asset.name } : null,
        assignee: w.assignee?.full_name ?? null,
        status: w.status,
        priority: w.priority_code,
        ageHours: Math.floor((Date.now() - w.created_at.getTime()) / (3600 * 1000)),
        createdAt: w.created_at.toISOString(),
      })),
      pendingApprovals: stuckApprovals.map((a) => ({
        id: a.id,
        code: a.code,
        workOrderCode: woMap.get(a.work_order_id) ?? null,
        proposer: proposerMap.get(a.proposer_id) ?? null,
        ageHours: Math.floor((Date.now() - a.updated_at.getTime()) / (3600 * 1000)),
        updatedAt: a.updated_at.toISOString(),
      })),
      lowStockParts: lowStock.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        onHand: Number(p.on_hand),
        minimumStock: Number(p.minimum_stock),
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // /dashboard/asset-critical - asset nhieu incident / chi phi cao (SCR-REP-05)
  // ---------------------------------------------------------------------------
  async getAssetCritical(opts: { months?: number; limit?: number } = {}) {
    const months = opts.months ?? 6;
    const limit = Math.min(opts.limit ?? 20, 100);
    const since = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);

    // Top assets by incident count
    const byIncidents = await this.prisma.incidents.groupBy({
      by: ['asset_id'],
      where: { created_at: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { asset_id: 'desc' } },
      take: limit,
    });

    const assetIds = byIncidents.map((b) => b.asset_id);
    const costByAsset = await this.prisma.cost_entries.findMany({
      where: { created_at: { gte: since } },
      select: { work_order_id: true, quantity: true, unit_price: true },
    });
    const woIds = costByAsset
      .map((c) => c.work_order_id)
      .filter((x): x is string => Boolean(x));
    const woAsset = await this.prisma.work_orders.findMany({
      where: { id: { in: woIds } },
      select: { id: true, asset_id: true },
    });
    const woToAsset = new Map(woAsset.map((w) => [w.id, w.asset_id]));

    const costMap = new Map<string, number>();
    for (const c of costByAsset) {
      if (!c.work_order_id) continue;
      const a = woToAsset.get(c.work_order_id);
      if (!a) continue;
      const total = Number(c.quantity) * Number(c.unit_price);
      costMap.set(a, (costMap.get(a) ?? 0) + total);
    }

    const assets = await this.prisma.assets.findMany({
      where: { id: { in: assetIds } },
      select: { id: true, code: true, name: true, manual_state: true },
    });
    const assetMap = new Map(assets.map((a) => [a.id, a]));

    const items = byIncidents.map((b) => {
      const a = assetMap.get(b.asset_id);
      return {
        assetId: b.asset_id,
        code: a?.code ?? '',
        name: a?.name ?? '',
        manualState: a?.manual_state ?? null,
        incidentCount: b._count._all,
        totalCost: costMap.get(b.asset_id) ?? 0,
      };
    });
    items.sort(
      (x, y) =>
        y.incidentCount - x.incidentCount || Number(y.totalCost) - Number(x.totalCost),
    );

    return { items, months, limit };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async countOverdueWorkOrders(): Promise<number> {
    const data = await this.getOverdueWorkOrders();
    return data.total;
  }

  /**
   * Q-04: excluded seconds = waiting_approval + authorized_pause
   * Doc lay tu work_order_notes (note_type) + audit_logs (approval.submitted / approved / rejected).
   * Don gian: note_type IN ('PAUSE_START','PAUSE_END','WAITING_APPROVAL_START','WAITING_APPROVAL_END').
   */
  private async computeExcludedSeconds(workOrderId: string): Promise<number> {
    const notes = await this.prisma.work_order_notes.findMany({
      where: {
        work_order_id: workOrderId,
        note_type: { in: ['PAUSE_START', 'PAUSE_END', 'WAITING_APPROVAL_START', 'WAITING_APPROVAL_END'] },
      },
      orderBy: { created_at: 'asc' },
    });
    let total = 0;
    let pauseStart: number | null = null;
    let waStart: number | null = null;
    for (const n of notes) {
      const t = n.created_at instanceof Date ? n.created_at.getTime() : new Date(n.created_at).getTime();
      const noteType = (n as Prisma.work_order_notesGetPayload<{}>).note_type;
      if (noteType === 'PAUSE_START') pauseStart = t;
      else if (noteType === 'PAUSE_END' && pauseStart) {
        total += Math.max(0, Math.floor((t - pauseStart) / 1000));
        pauseStart = null;
      } else if (noteType === 'WAITING_APPROVAL_START') waStart = t;
      else if (noteType === 'WAITING_APPROVAL_END' && waStart) {
        total += Math.max(0, Math.floor((t - waStart) / 1000));
        waStart = null;
      }
    }
    return total;
  }
}
