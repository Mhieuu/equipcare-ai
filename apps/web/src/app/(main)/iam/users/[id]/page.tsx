'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { useToast } from '@/components/toast';

interface UserDetail {
  id: string;
  loginName: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  userRoles: Array<{ id: string; role: { code: string; name: string }; grantedAt: string }>;
}

interface RoleOption { id: string; code: string; name: string }

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ['iam-user', params.id],
    queryFn: () => apiGet<UserDetail>(`/iam/users/${params.id}`),
    enabled: !!params.id,
  });
  const { data: rolesRes } = useQuery({
    queryKey: ['iam-roles'],
    queryFn: () => apiGet<{ items: RoleOption[] }>('/iam/roles'),
  });

  const grant = useMutation({
    mutationFn: (roleCode: string) => apiPost(`/iam/users/${params.id}/roles`, { roleCode }),
    onSuccess: () => {
      toast.success('Đã cấp vai trò');
      qc.invalidateQueries({ queryKey: ['iam-user', params.id] });
    },
    onError: (e: Error) => toast.error('Lỗi', e.message),
  });
  const revoke = useMutation({
    mutationFn: (roleId: string) => apiDelete(`/iam/users/${params.id}/roles/${roleId}`),
    onSuccess: () => {
      toast.success('Đã thu hồi vai trò');
      qc.invalidateQueries({ queryKey: ['iam-user', params.id] });
    },
  });

  if (isLoading) return <div className="text-slate-500">Đang tải...</div>;
  if (!user) return <div className="text-rose-600">Không tìm thấy</div>;

  const availableRoles = (rolesRes?.items ?? []).filter(
    (r) => !user.userRoles.some((ur) => ur.role.code === r.code),
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <button onClick={() => router.back()} className="btn-ghost text-sm">
        <ArrowLeft className="h-4 w-4" /> Quay lại
      </button>

      <div>
        <h1 className="text-2xl font-bold">{user.fullName}</h1>
        <p className="text-sm text-slate-500">Login: <span className="font-mono">{user.loginName}</span> · {user.email}</p>
      </div>

      <div className="card p-4">
        <h2 className="font-semibold mb-3">Vai trò hiện tại</h2>
        <ul className="space-y-2">
          {user.userRoles.map((ur) => (
            <li key={ur.id} className="flex items-center justify-between">
              <span>
                <span className="font-medium">{ur.role.name}</span>{' '}
                <span className="text-xs text-slate-500 font-mono">({ur.role.code})</span>
              </span>
              <button className="btn-danger text-xs" onClick={() => revoke.mutate(ur.id)}>
                <X className="h-3 w-3" /> Thu hồi
              </button>
            </li>
          ))}
        </ul>
      </div>

      {availableRoles.length > 0 && (
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Cấp vai trò</h2>
          <ul className="space-y-2">
            {availableRoles.map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <span>
                  <span className="font-medium">{r.name}</span>{' '}
                  <span className="text-xs text-slate-500 font-mono">({r.code})</span>
                </span>
                <button className="btn-primary text-xs" onClick={() => grant.mutate(r.code)} disabled={grant.isPending}>
                  <Plus className="h-3 w-3" /> Cấp
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
