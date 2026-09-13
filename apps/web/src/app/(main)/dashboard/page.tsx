'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertOctagon, Clock, Wrench, Activity, Users } from 'lucide-react';
import { apiGet } from '@/lib/api';

interface Kpis {
  totalAssets: number;
  operationalAssets: number;
  repairAssets: number;
  maintenanceAssets: number;
  openIncidents: number;
  criticalIncidents: number;
  openWorkOrders: number;
  overdueWorkOrders: number;
  pendingApprovals: number;
  totalCostMTD: string;
}

interface OverdueItem {
  workOrderId: string;
  workOrderCode: string;
  assetCode: string;
  priority: string;
  overdueSeconds: number;
  assigneeName: string | null;
}

interface TechLoadItem {
  userId: string;
  fullName: string;
  activeWO: number;
  overdueWO: number;
}

interface ActionItem {
  type: string;
  title: string;
  href: string;
  severity: 'low' | 'medium' | 'high';
}

export default function DashboardPage() {
  const { data: kpis } = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: () => apiGet<Kpis>('/dashboard/kpis'),
  });
  const { data: overdue } = useQuery({
    queryKey: ['dashboard-overdue'],
    queryFn: () => apiGet<{ items: OverdueItem[] }>('/dashboard/overdue'),
  });
  const { data: techLoad } = useQuery({
    queryKey: ['dashboard-tech-load'],
    queryFn: () => apiGet<{ items: TechLoadItem[] }>('/dashboard/technician-load'),
  });
  const { data: actions } = useQuery({
    queryKey: ['dashboard-actions'],
    queryFn: () => apiGet<{ items: ActionItem[] }>('/dashboard/action-items'),
  });

  const card = (label: string, value: React.ReactNode, icon: React.ReactNode, tone: string) => (
    <div className="card p-4 flex items-start gap-3">
      <div className={`h-10 w-10 rounded-md flex items-center justify-center ${tone}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {card('Thiết bị', kpis?.totalAssets ?? '—', <Wrench className="h-5 w-5 text-blue-600" />, 'bg-blue-50')}
        {card('Hoạt động', kpis?.operationalAssets ?? '—', <Activity className="h-5 w-5 text-emerald-600" />, 'bg-emerald-50')}
        {card('Sự cố mở', kpis?.openIncidents ?? '—', <AlertOctagon className="h-5 w-5 text-amber-600" />, 'bg-amber-50')}
        {card('Khẩn cấp', kpis?.criticalIncidents ?? '—', <AlertOctagon className="h-5 w-5 text-rose-600" />, 'bg-rose-50')}
        {card('Phiếu mở', kpis?.openWorkOrders ?? '—', <Wrench className="h-5 w-5 text-purple-600" />, 'bg-purple-50')}
        {card('Quá hạn', kpis?.overdueWorkOrders ?? '—', <Clock className="h-5 w-5 text-rose-600" />, 'bg-rose-50')}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="font-semibold mb-3">WO quá hạn</h2>
          <ul className="space-y-1">
            {overdue?.items.length ? overdue.items.map((o) => (
              <li key={o.workOrderId} className="flex items-center justify-between text-sm py-1">
                <Link href={`/work-orders/${o.workOrderId}`} className="text-brand-700 hover:underline">{o.workOrderCode}</Link>
                <span className="text-xs text-slate-500">{o.assetCode} · {Math.floor(o.overdueSeconds / 3600)}h</span>
              </li>
            )) : <p className="text-sm text-slate-500">Không có WO quá hạn</p>}
          </ul>
        </div>

        <div className="card p-4">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4" /> Tải công việc KTV</h2>
          <ul className="space-y-1">
            {techLoad?.items.length ? techLoad.items.slice(0, 10).map((t) => (
              <li key={t.userId} className="flex items-center justify-between text-sm py-1">
                <span>{t.fullName}</span>
                <span className="text-xs">
                  <span className="badge-blue mr-1">{t.activeWO} active</span>
                  {t.overdueWO > 0 && <span className="badge-red">{t.overdueWO} overdue</span>}
                </span>
              </li>
            )) : <p className="text-sm text-slate-500">Chưa có dữ liệu</p>}
          </ul>
        </div>

        <div className="card p-4 lg:col-span-2">
          <h2 className="font-semibold mb-3">Hành động cần làm</h2>
          <ul className="space-y-1">
            {actions?.items.length ? actions.items.slice(0, 10).map((a, i) => (
              <li key={i} className="flex items-center justify-between text-sm py-1">
                <Link href={a.href} className="text-brand-700 hover:underline">{a.title}</Link>
                <span className={a.severity === 'high' ? 'badge-red' : a.severity === 'medium' ? 'badge-yellow' : 'badge-gray'}>{a.severity}</span>
              </li>
            )) : <p className="text-sm text-slate-500">Không có</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}
