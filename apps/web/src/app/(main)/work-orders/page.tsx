'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, LayoutGrid, List as ListIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { apiGet } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { WorkOrderStatusBadge, WorkOrderTypeBadge } from '@/components/badges';
import { format } from 'date-fns';
import { WorkOrderStatus, WorkOrderType } from '@equipcare/shared';

interface WO {
  id: string;
  code: string;
  kind: WorkOrderType;
  status: WorkOrderStatus;
  priorityCode: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  asset: { id: string; code: string; name: string };
  assignee: { id: string; fullName: string } | null;
  dueAt: string | null;
  createdAt: string;
  isOverdue?: boolean;
}

export default function WorkOrdersPage() {
  const { hasPermission } = useAuth();
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['work-orders', status, page],
    queryFn: () =>
      apiGet<{ items: WO[]; total: number }>('/work-orders', {
        status: status || undefined,
        limit: 50,
        offset: (page - 1) * 50,
      }),
  });

  const grouped = (data?.items ?? []).reduce(
    (acc, w) => {
      if (!acc[w.status]) acc[w.status] = [];
      acc[w.status].push(w);
      return acc;
    },
    {} as Record<WorkOrderStatus, WO[]>,
  );

  const STATUS_COLUMNS = [
    WorkOrderStatus.NEW,
    WorkOrderStatus.ASSIGNED,
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.WAITING_APPROVAL,
    WorkOrderStatus.COMPLETED,
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Phiếu công việc</h1>
        <div className="flex gap-2">
          <div className="flex bg-white rounded-md border border-slate-300">
            <button onClick={() => setView('kanban')} className={`px-3 py-1.5 text-sm flex items-center gap-1 ${view === 'kanban' ? 'bg-brand-600 text-white' : 'text-slate-600'}`}>
              <LayoutGrid className="h-4 w-4" /> Kanban
            </button>
            <button onClick={() => setView('list')} className={`px-3 py-1.5 text-sm flex items-center gap-1 ${view === 'list' ? 'bg-brand-600 text-white' : 'text-slate-600'}`}>
              <ListIcon className="h-4 w-4" /> Danh sách
            </button>
          </div>
          {hasPermission('work-order:create') && (
            <Link href="/work-orders/new" className="btn-primary">
              <Plus className="h-4 w-4" /> Tạo phiếu
            </Link>
          )}
        </div>
      </div>

      {view === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {STATUS_COLUMNS.map((s) => (
            <div key={s} className="card p-3 bg-slate-50">
              <div className="flex items-center justify-between mb-2">
                <WorkOrderStatusBadge status={s} />
                <span className="text-xs text-slate-500">{grouped[s]?.length ?? 0}</span>
              </div>
              <ul className="space-y-2">
                {grouped[s]?.map((w) => (
                  <li key={w.id} className="card p-2 bg-white">
                    <Link href={`/work-orders/${w.id}`} className="block">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono text-slate-500">{w.code}</span>
                        <WorkOrderTypeBadge type={w.kind} />
                      </div>
                      <p className="text-xs font-medium line-clamp-2 mb-1">{w.description}</p>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">{w.asset.code}</span>
                        {w.isOverdue && <span className="badge-red">Quá hạn</span>}
                      </div>
                      {w.assignee && <div className="text-xs text-slate-600 mt-1">→ {w.assignee.fullName}</div>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="card p-3">
            <select className="input max-w-xs" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">Tất cả trạng thái</option>
              {Object.values(WorkOrderStatus).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <DataTable
            rowKey={(r) => r.id}
            loading={isLoading}
            onRefresh={() => refetch()}
            pagination={{ page, pageSize: 50, total: data?.total ?? 0, onPageChange: setPage }}
            columns={[
              { key: 'code', header: 'Mã', render: (r) => <Link href={`/work-orders/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.code}</Link>, width: '180px' },
              { key: 'kind', header: 'Loại', render: (r) => <WorkOrderTypeBadge type={r.kind} /> },
              { key: 'status', header: 'Trạng thái', render: (r) => <WorkOrderStatusBadge status={r.status} /> },
              { key: 'asset', header: 'Thiết bị', render: (r) => `${r.asset.code} - ${r.asset.name}` },
              { key: 'assignee', header: 'KTV', render: (r) => r.assignee?.fullName ?? '—' },
              { key: 'due', header: 'Hạn', render: (r) => r.dueAt ? format(new Date(r.dueAt), 'dd/MM HH:mm') : '—', width: '120px' },
            ]}
            rows={data?.items ?? []}
          />
        </>
      )}
    </div>
  );
}
