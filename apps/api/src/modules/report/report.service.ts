import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type ReportType =
  | 'incidents'
  | 'work-orders'
  | 'cost-summary'
  | 'asset-critical';

const SUPPORTED: ReportType[] = ['incidents', 'work-orders', 'cost-summary', 'asset-critical'];

/**
 * ReportService - M9 (Doc05 §8 + plan section 12.2 M9).
 *
 * CSV export cho admin/manager (Doc05: CSV co permission check).
 * Output: text/csv (utf-8 + BOM de Excel mo dung tieng Viet).
 */
@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  static isSupported(type: string): type is ReportType {
    return SUPPORTED.includes(type as ReportType);
  }

  /** Helper: escape + quote CSV cell (RFC 4180). */
  private csvCell(v: unknown): string {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  private toCsv(rows: Array<Record<string, unknown>>): string {
    if (rows.length === 0) return '\uFEFF';
    const headers = Object.keys(rows[0]);
    const lines: string[] = [headers.map((h) => this.csvCell(h)).join(',')];
    for (const row of rows) {
      lines.push(headers.map((h) => this.csvCell(row[h])).join(','));
    }
    return '\uFEFF' + lines.join('\r\n');
  }

  async generate(type: ReportType): Promise<{ filename: string; content: string }> {
    switch (type) {
      case 'incidents':
        return this.incidentsReport();
      case 'work-orders':
        return this.workOrdersReport();
      case 'cost-summary':
        return this.costSummaryReport();
      case 'asset-critical':
        return this.assetCriticalReport();
    }
  }

  private async incidentsReport() {
    const items = await this.prisma.incidents.findMany({
      include: {
        asset: { select: { code: true, name: true } },
        reporter: { select: { full_name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 5000,
    });
    const rows = items.map((i) => ({
      code: i.code,
      description: i.description,
      impactDescription: i.impact_description ?? '',
      status: i.status,
      priority: i.priority_code ?? '',
      confirmedCategory: i.confirmed_category ?? '',
      assetCode: i.asset?.code ?? '',
      assetName: i.asset?.name ?? '',
      reporter: i.reporter?.full_name ?? '',
      occurredAt: i.occurred_at ? i.occurred_at.toISOString() : '',
      resolvedAt: i.resolved_at ? i.resolved_at.toISOString() : '',
      createdAt: i.created_at.toISOString(),
      updatedAt: i.updated_at.toISOString(),
    }));
    return { filename: 'incidents.csv', content: this.toCsv(rows) };
  }

  private async workOrdersReport() {
    const items = await this.prisma.work_orders.findMany({
      include: {
        asset: { select: { code: true, name: true } },
        assignee: { select: { full_name: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 5000,
    });
    const rows = items.map((w) => ({
      code: w.code,
      assetCode: w.asset?.code ?? '',
      assetName: w.asset?.name ?? '',
      kind: w.kind,
      priority: w.priority_code,
      status: w.status,
      assignee: w.assignee?.full_name ?? '',
      createdAt: w.created_at.toISOString(),
      startedAt: w.started_at ? w.started_at.toISOString() : '',
      dueAt: w.due_at ? w.due_at.toISOString() : '',
      completedAt: w.completed_at ? w.completed_at.toISOString() : '',
    }));
    return { filename: 'work-orders.csv', content: this.toCsv(rows) };
  }

  private async costSummaryReport() {
    // Theo WO, sum PART/LABOR/OTHER/CREDIT + net (Q-06)
    const wos = await this.prisma.work_orders.findMany({
      where: { cost_entries: { some: {} } },
      select: {
        id: true,
        code: true,
        asset_id: true,
        cost_entries: { select: { category: true, direction: true, quantity: true, unit_price: true } },
      },
      take: 5000,
    });

    const rows = wos.map((w) => {
      let partDebit = 0;
      let laborDebit = 0;
      let otherDebit = 0;
      let credit = 0;
      for (const c of w.cost_entries) {
        const amt = Number(c.quantity) * Number(c.unit_price);
        if (c.direction === 'CREDIT') credit += amt;
        else if (c.category === 'PART') partDebit += amt;
        else if (c.category === 'LABOR') laborDebit += amt;
        else otherDebit += amt;
      }
      const netCost = partDebit + laborDebit + otherDebit - credit;
      return {
        workOrderId: w.id,
        workOrderCode: w.code,
        partDebit,
        laborDebit,
        otherDebit,
        credit,
        netCost,
      };
    });
    return { filename: 'cost-summary.csv', content: this.toCsv(rows) };
  }

  private async assetCriticalReport() {
    const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const items = await this.prisma.incidents.groupBy({
      by: ['asset_id'],
      where: { created_at: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { asset_id: 'desc' } },
      take: 100,
    });

    const assetIds = items.map((i) => i.asset_id);
    const assets = await this.prisma.assets.findMany({
      where: { id: { in: assetIds } },
      select: { id: true, code: true, name: true, manual_state: true },
    });
    const assetMap = new Map(assets.map((a) => [a.id, a]));

    const costByWo = await this.prisma.cost_entries.findMany({
      where: { created_at: { gte: since } },
      select: { work_order_id: true, quantity: true, unit_price: true },
    });
    const woIds = costByWo
      .map((c) => c.work_order_id)
      .filter((x): x is string => Boolean(x));
    const wos = await this.prisma.work_orders.findMany({
      where: { id: { in: woIds } },
      select: { id: true, asset_id: true },
    });
    const woToAsset = new Map(wos.map((w) => [w.id, w.asset_id]));
    const costMap = new Map<string, number>();
    for (const c of costByWo) {
      if (!c.work_order_id) continue;
      const a = woToAsset.get(c.work_order_id);
      if (!a) continue;
      const total = Number(c.quantity) * Number(c.unit_price);
      costMap.set(a, (costMap.get(a) ?? 0) + total);
    }

    const rows = items.map((b) => {
      const a = assetMap.get(b.asset_id);
      return {
        assetId: b.asset_id,
        code: a?.code ?? '',
        name: a?.name ?? '',
        manualState: a?.manual_state ?? '',
        incidentCount180d: b._count._all,
        totalCost180d: costMap.get(b.asset_id) ?? 0,
      };
    });
    return { filename: 'asset-critical.csv', content: this.toCsv(rows) };
  }
}
