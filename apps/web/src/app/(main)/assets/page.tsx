'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { apiGet } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { AssetStatusBadge } from '@/components/badges';

interface Asset {
  id: string;
  code: string;
  name: string;
  assetType: { code: string; name: string };
  department: { id: string; name: string };
  location: { id: string; name: string };
  activityStatus: string;
  manualState: string;
  serialNumber: string | null;
}

export default function AssetsPage() {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['assets', search, page],
    queryFn: () =>
      apiGet<{ items: Asset[]; total: number }>('/assets', {
        search: search || undefined,
        limit: 20,
        offset: (page - 1) * 20,
      }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Thiết bị</h1>
        {hasPermission('asset:create') && (
          <Link href="/assets/new" className="btn-primary">
            <Plus className="h-4 w-4" /> Tạo thiết bị
          </Link>
        )}
      </div>

      <div className="card p-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm theo mã hoặc tên..."
            className="input pl-9"
          />
        </div>
      </div>

      <DataTable
        rowKey={(r) => r.id}
        loading={isLoading}
        onRefresh={() => refetch()}
        pagination={{
          page,
          pageSize: 20,
          total: data?.total ?? 0,
          onPageChange: setPage,
        }}
        columns={[
          {
            key: 'code',
            header: 'Mã',
            render: (r) => <Link href={`/assets/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.code}</Link>,
            width: '140px',
          },
          {
            key: 'name',
            header: 'Tên',
            render: (r) => (
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-slate-500">{r.assetType?.name}</div>
              </div>
            ),
          },
          { key: 'department', header: 'Phòng ban', render: (r) => r.department?.name },
          { key: 'location', header: 'Vị trí', render: (r) => r.location?.name },
          { key: 'status', header: 'Trạng thái', render: (r) => <AssetStatusBadge status={r.activityStatus as never} /> },
          { key: 'serial', header: 'Serial', render: (r) => r.serialNumber ?? '—' },
        ]}
        rows={data?.items ?? []}
      />
    </div>
  );
}
