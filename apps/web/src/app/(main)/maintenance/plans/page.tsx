'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Pause, Play } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { format } from 'date-fns';

interface Plan {
  id: string;
  code: string;
  name: string;
  asset: { id: string; code: string; name: string };
  intervalValue: number;
  intervalUnit: string;
  isActive: boolean;
  nextDueOn: string | null;
}

export default function MaintenancePlansPage() {
  const [activeOnly, setActiveOnly] = useState(true);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['maintenance-plans', activeOnly],
    queryFn: () =>
      apiGet<{ items: Plan[]; total: number }>('/maintenance-plans', {
        isActive: activeOnly ? 'true' : 'false',
        limit: 100,
      }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kế hoạch bảo trì</h1>
        <div className="flex gap-2">
          <button className={`btn ${activeOnly ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveOnly(true)}>
            <Play className="h-4 w-4" /> Đang chạy
          </button>
          <button className={`btn ${!activeOnly ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveOnly(false)}>
            <Pause className="h-4 w-4" /> Đã tạm dừng
          </button>
        </div>
      </div>

      <DataTable
        rowKey={(r) => r.id}
        loading={isLoading}
        onRefresh={() => refetch()}
        pagination={{ page: 1, pageSize: 100, total: data?.total ?? 0, onPageChange: () => {} }}
        columns={[
          { key: 'code', header: 'Mã', render: (r) => <Link href={`/maintenance/plans/${r.id}`} className="font-mono text-brand-700 hover:underline">{r.code}</Link>, width: '150px' },
          { key: 'name', header: 'Tên', render: (r) => r.name },
          { key: 'asset', header: 'Thiết bị', render: (r) => `${r.asset.code} - ${r.asset.name}` },
          { key: 'interval', header: 'Chu kỳ', render: (r) => `Mỗi ${r.intervalValue} ${r.intervalUnit}`, width: '160px' },
          { key: 'next', header: 'Kỳ tới', render: (r) => r.nextDueOn ? format(new Date(r.nextDueOn), 'dd/MM/yyyy') : '—', width: '120px' },
          { key: 'status', header: 'TT', render: (r) => r.isActive ? <span className="badge-green">Đang chạy</span> : <span className="badge-gray">Tạm dừng</span>, width: '110px' },
        ]}
        rows={data?.items ?? []}
      />
    </div>
  );
}
