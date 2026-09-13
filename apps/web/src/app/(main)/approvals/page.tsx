'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { ApprovalStatusBadge } from '@/components/badges';
import { DataTable } from '@/components/data-table';
import { format } from 'date-fns';
import { ApprovalStatus } from '@equipcare/shared';

interface Approval {
  id: string;
  status: ApprovalStatus;
  reason: string;
  workOrder: { id: string; code: string; description: string };
  proposer: { id: string; fullName: string };
  createdAt: string;
  currentRevision: { id: string; revisionNo: number; netCost: string | null };
}

export default function ApprovalsPage() {
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | ''>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['approvals', statusFilter, page],
    queryFn: () =>
      apiGet<{ items: Approval[]; total: number }>('/approvals', {
        status: statusFilter || undefined,
        limit: 20,
        offset: (page - 1) * 20,
      }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Phê duyệt</h1>

      <div className="flex gap-2 flex-wrap">
        <button className={`btn ${statusFilter === '' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setStatusFilter(''); setPage(1); }}>Tất cả</button>
        {Object.values(ApprovalStatus).map((s) => (
          <button key={s} className={`btn ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setStatusFilter(s); setPage(1); }}>
            {s}
          </button>
        ))}
      </div>

      <DataTable
        rowKey={(r) => r.id}
        loading={isLoading}
        onRefresh={() => refetch()}
        pagination={{ page, pageSize: 20, total: data?.total ?? 0, onPageChange: setPage }}
        columns={[
          { key: 'code', header: 'Phiếu WO', render: (r) => <Link href={`/work-orders/${r.workOrder.id}`} className="font-mono text-brand-700 hover:underline">{r.workOrder.code}</Link>, width: '180px' },
          { key: 'proposer', header: 'Người đề xuất', render: (r) => r.proposer.fullName },
          { key: 'reason', header: 'Lý do', render: (r) => <div className="truncate max-w-md">{r.reason}</div> },
          { key: 'status', header: 'Trạng thái', render: (r) => <ApprovalStatusBadge status={r.status} /> },
          { key: 'rev', header: 'Rev', render: (r) => r.currentRevision.revisionNo, width: '60px' },
          { key: 'created', header: 'Ngày tạo', render: (r) => format(new Date(r.createdAt), 'dd/MM HH:mm'), width: '110px' },
          {
            key: 'actions',
            header: '',
            render: (r) => (
              <Link href={`/approvals/${r.id}`} className="text-brand-700 hover:underline text-xs">
                Mở →
              </Link>
            ),
            width: '60px',
          },
        ]}
        rows={data?.items ?? []}
      />
    </div>
  );
}
