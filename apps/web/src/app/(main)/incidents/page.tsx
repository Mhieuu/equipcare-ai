'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { apiGet } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { IncidentStatusBadge, PriorityBadge } from '@/components/badges';
import { format } from 'date-fns';
import { IncidentStatus, IncidentPriority } from '@equipcare/shared';

interface Incident {
  id: string;
  code: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  description: string;
  asset: { id: string; code: string; name: string };
  reporter: { id: string; fullName: string };
  createdAt: string;
}

export default function IncidentsPage() {
  const { hasPermission } = useAuth();
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['incidents', status, page],
    queryFn: () =>
      apiGet<{ items: Incident[]; total: number }>('/incidents', {
        status: status || undefined,
        limit: 20,
        offset: (page - 1) * 20,
      }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sự cố</h1>
        {hasPermission('incident:create') && (
          <Link href="/incidents/new" className="btn-primary">
            <Plus className="h-4 w-4" /> Báo sự cố
          </Link>
        )}
      </div>

      <div className="card p-3 flex gap-2">
        <select className="input max-w-xs" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Tất cả trạng thái</option>
          {Object.values(IncidentStatus).map((s) => (
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
        pagination={{ page, pageSize: 20, total: data?.total ?? 0, onPageChange: setPage }}
        columns={[
          {
            key: 'code',
            header: 'Mã',
            render: (r) => (
              <Link href={`/incidents/${r.id}`} className="font-medium text-brand-700 hover:underline">
                {r.code}
              </Link>
            ),
            width: '180px',
          },
          { key: 'asset', header: 'Thiết bị', render: (r) => `${r.asset.code} - ${r.asset.name}` },
          { key: 'reporter', header: 'Người báo', render: (r) => r.reporter.fullName },
          {
            key: 'desc',
            header: 'Mô tả',
            render: (r) => <div className="truncate max-w-md" title={r.description}>{r.description}</div>,
          },
          { key: 'priority', header: 'Ưu tiên', render: (r) => <PriorityBadge priority={r.priority} /> },
          { key: 'status', header: 'Trạng thái', render: (r) => <IncidentStatusBadge status={r.status} /> },
          {
            key: 'created',
            header: 'Ngày tạo',
            render: (r) => format(new Date(r.createdAt), 'dd/MM/yyyy HH:mm'),
            width: '140px',
          },
        ]}
        rows={data?.items ?? []}
      />
    </div>
  );
}
