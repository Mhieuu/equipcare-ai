'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { format } from 'date-fns';

interface AuditLog {
  id: string;
  actorId: string;
  actorType: string;
  action: string;
  objectType: string;
  objectKey: string;
  createdAt: string;
  note: string | null;
}

export default function AuditLogsPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', action, page],
    queryFn: () =>
      apiGet<{ items: AuditLog[]; total: number }>('/iam/audit-logs', {
        action: action || undefined,
        limit: 50,
        offset: (page - 1) * 50,
      }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit log</h1>

      <div className="card p-3">
        <input
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }}
          placeholder="Filter theo action (vd: incident.create)"
          className="input"
        />
      </div>

      <DataTable
        rowKey={(r) => r.id}
        loading={isLoading}
        onRefresh={() => refetch()}
        pagination={{ page, pageSize: 50, total: data?.total ?? 0, onPageChange: setPage }}
        columns={[
          { key: 'time', header: 'Thời gian', render: (r) => format(new Date(r.createdAt), 'dd/MM HH:mm:ss'), width: '140px' },
          { key: 'action', header: 'Action', render: (r) => <code className="text-xs">{r.action}</code>, width: '200px' },
          { key: 'objectType', header: 'Object', render: (r) => r.objectType, width: '120px' },
          { key: 'objectKey', header: 'Key', render: (r) => <code className="text-xs text-slate-500">{r.objectKey.slice(0, 8)}</code>, width: '100px' },
          { key: 'actor', header: 'Actor', render: (r) => <code className="text-xs">{r.actorId.slice(0, 8)} ({r.actorType})</code> },
          { key: 'note', header: 'Note', render: (r) => r.note ?? '—' },
        ]}
        rows={data?.items ?? []}
      />
    </div>
  );
}
