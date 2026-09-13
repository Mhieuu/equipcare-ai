'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { Search } from 'lucide-react';

interface User {
  id: string;
  loginName: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  userRoles: Array<{ role: { code: string; name: string } }>;
}

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['iam-users', search, page],
    queryFn: () =>
      apiGet<{ items: User[]; total: number }>('/iam/users', {
        search: search || undefined,
        limit: 20,
        offset: (page - 1) * 20,
      }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Người dùng</h1>

      <div className="card p-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Tìm theo loginName, tên, email..."
            className="input pl-9"
          />
        </div>
      </div>

      <DataTable
        rowKey={(r) => r.id}
        loading={isLoading}
        onRefresh={() => refetch()}
        pagination={{ page, pageSize: 20, total: data?.total ?? 0, onPageChange: setPage }}
        columns={[
          { key: 'login', header: 'Login', render: (r) => <Link href={`/iam/users/${r.id}`} className="font-mono text-brand-700 hover:underline">{r.loginName}</Link>, width: '160px' },
          { key: 'name', header: 'Họ tên', render: (r) => r.fullName },
          { key: 'email', header: 'Email', render: (r) => r.email ?? '—' },
          { key: 'roles', header: 'Vai trò', render: (r) => r.userRoles.map((ur) => ur.role.code).join(', ') || '—' },
          { key: 'status', header: 'TT', render: (r) => r.isActive ? <span className="badge-green">Active</span> : <span className="badge-gray">Disabled</span>, width: '90px' },
        ]}
        rows={data?.items ?? []}
      />
    </div>
  );
}
