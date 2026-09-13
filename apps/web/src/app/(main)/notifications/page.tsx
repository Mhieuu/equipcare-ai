'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Filter } from 'lucide-react';
import { apiGet, apiPatch } from '@/lib/api';
import { useToast } from '@/components/toast';
import { format } from 'date-fns';
import { clsx } from 'clsx';

interface Notification {
  id: string;
  eventType: string;
  objectType: string;
  objectKey: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', unreadOnly, page],
    queryFn: () =>
      apiGet<{ items: Notification[]; total: number }>('/notifications', {
        unreadOnly: unreadOnly ? 'true' : undefined,
        limit: 30,
        offset: (page - 1) * 30,
      }),
    refetchInterval: 15_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiPatch(`/notifications/${id}/read`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => apiPatch('/notifications/read-all', {}),
    onSuccess: () => {
      toast.success('Đã đánh dấu tất cả đã đọc');
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6" /> Thông báo
        </h1>
        <div className="flex gap-2">
          <button
            className={`btn ${unreadOnly ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setUnreadOnly(!unreadOnly); setPage(1); }}
          >
            <Filter className="h-4 w-4" /> Chưa đọc
          </button>
          <button className="btn-secondary" onClick={() => markAllRead.mutate()}>
            <CheckCheck className="h-4 w-4" /> Đánh dấu tất cả đã đọc
          </button>
        </div>
      </div>

      <div className="card divide-y divide-slate-100">
        {isLoading ? (
          <div className="p-6 text-center text-slate-500">Đang tải...</div>
        ) : !data?.items.length ? (
          <div className="p-6 text-center text-slate-500">Không có thông báo</div>
        ) : (
          data.items.map((n) => (
            <div
              key={n.id}
              className={clsx('p-4 hover:bg-slate-50 cursor-pointer', !n.readAt && 'bg-brand-50/40')}
              onClick={() => !n.readAt && markRead.mutate(n.id)}
            >
              <div className="flex items-start gap-3">
                {!n.readAt && <span className="h-2 w-2 rounded-full bg-brand-600 mt-2 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{n.title}</span>
                    <span className="badge-gray text-xs">{n.eventType}</span>
                  </div>
                  {n.body && <p className="text-sm text-slate-600 mb-1">{n.body}</p>}
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{format(new Date(n.createdAt), 'dd/MM HH:mm')}</span>
                    {n.objectKey && (
                      <span className="text-brand-700">→ {n.objectType}/{n.objectKey.slice(0, 8)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {data && data.total > 30 && (
        <div className="flex justify-center gap-2">
          <button className="btn-secondary text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button>
          <span className="text-xs text-slate-500 self-center">Trang {page} / {Math.ceil(data.total / 30)}</span>
          <button className="btn-secondary text-xs" disabled={page * 30 >= data.total} onClick={() => setPage(page + 1)}>Sau</button>
        </div>
      )}
    </div>
  );
}
