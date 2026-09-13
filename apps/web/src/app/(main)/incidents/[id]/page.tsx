'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Send } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { IncidentStatusBadge, PriorityBadge } from '@/components/badges';
import { IncidentStatus, IncidentMessageTypeLabel, IncidentPriority } from '@equipcare/shared';

interface IncidentDetail {
  id: string;
  code: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  description: string;
  impactDescription: string;
  occurredAt: string | null;
  asset: { id: string; code: string; name: string };
  reporter: { id: string; fullName: string };
  messages: Array<{
    id: string;
    body: string;
    messageType: string;
    authorName: string;
    createdAt: string;
  }>;
  workOrders: Array<{ id: string; code: string; status: string; kind: string }>;
}

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [newMessage, setNewMessage] = useState('');
  const [transitionTo, setTransitionTo] = useState<IncidentStatus | ''>('');
  const [reason, setReason] = useState('');

  const { data: incident, isLoading } = useQuery({
    queryKey: ['incident', params.id],
    queryFn: () => apiGet<IncidentDetail>(`/incidents/${params.id}`),
    enabled: !!params.id,
  });

  const transitionMutation = useMutation({
    mutationFn: (vars: { to: IncidentStatus; reason?: string }) =>
      apiPost(`/incidents/${params.id}/transition`, vars),
    onSuccess: () => {
      toast.success('Đã chuyển trạng thái');
      void qc.invalidateQueries({ queryKey: ['incident', params.id] });
      setTransitionTo('');
      setReason('');
    },
    onError: (e: Error) => toast.error('Lỗi', e.message),
  });

  const messageMutation = useMutation({
    mutationFn: (body: string) => apiPost(`/incidents/${params.id}/messages`, { body }),
    onSuccess: () => {
      setNewMessage('');
      void qc.invalidateQueries({ queryKey: ['incident', params.id] });
    },
  });

  if (isLoading) return <div className="text-slate-500">Đang tải...</div>;
  if (!incident) return <div className="text-rose-600">Không tìm thấy</div>;

  return (
    <div className="space-y-4 max-w-4xl">
      <button onClick={() => router.back()} className="btn-ghost text-sm">
        <ArrowLeft className="h-4 w-4" /> Quay lại
      </button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{incident.code}</h1>
          <Link href={`/assets/${incident.asset.id}`} className="text-sm text-brand-700 hover:underline">
            {incident.asset.code} - {incident.asset.name}
          </Link>
        </div>
        <div className="flex gap-2">
          <PriorityBadge priority={incident.priority} />
          <IncidentStatusBadge status={incident.status} />
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <div>
          <dt className="text-xs text-slate-500">Người báo</dt>
          <dd className="font-medium">{incident.reporter.fullName}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Mô tả</dt>
          <dd className="text-sm whitespace-pre-line">{incident.description}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Ảnh hưởng</dt>
          <dd className="text-sm whitespace-pre-line">{incident.impactDescription}</dd>
        </div>
      </div>

      {hasPermission('incident:transition') && (
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Chuyển trạng thái</h2>
          <div className="flex gap-2 flex-wrap">
            <select className="input max-w-xs" value={transitionTo} onChange={(e) => setTransitionTo(e.target.value as IncidentStatus)}>
              <option value="">-- Chọn --</option>
              {Object.values(IncidentStatus)
                .filter((s) => s !== incident.status)
                .map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
            {transitionTo === IncidentStatus.CANCELLED && (
              <input className="input max-w-md" placeholder="Lý do hủy (bắt buộc)" value={reason} onChange={(e) => setReason(e.target.value)} />
            )}
            <button
              className="btn-primary"
              disabled={!transitionTo || transitionMutation.isPending || (transitionTo === IncidentStatus.CANCELLED && !reason)}
              onClick={() => transitionTo && transitionMutation.mutate({ to: transitionTo, reason })}
            >
              {transitionMutation.isPending ? 'Đang xử lý...' : 'Chuyển'}
            </button>
          </div>
        </div>
      )}

      {incident.workOrders && incident.workOrders.length > 0 && (
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Phiếu công việc</h2>
          <ul className="space-y-1">
            {incident.workOrders.map((w) => (
              <li key={w.id}>
                <Link href={`/work-orders/${w.id}`} className="text-brand-700 hover:underline">
                  {w.code}
                </Link>{' '}
                <span className="text-xs text-slate-500">
                  — {w.kind} · {w.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-4">
        <h2 className="font-semibold mb-3">Tin nhắn ({incident.messages.length})</h2>
        <ul className="space-y-3 mb-4">
          {incident.messages.map((m) => (
            <li key={m.id} className="border-l-2 border-slate-200 pl-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">{m.authorName}</span>
                <span className="badge-gray text-xs">{IncidentMessageTypeLabel[m.messageType as never] ?? m.messageType}</span>
                <span className="text-xs text-slate-500">{format(new Date(m.createdAt), 'dd/MM/yyyy HH:mm')}</span>
              </div>
              <p className="text-sm whitespace-pre-line">{m.body}</p>
            </li>
          ))}
        </ul>
        {hasPermission('incident:message:create') && (
          <div className="flex gap-2">
            <textarea
              className="input"
              rows={2}
              placeholder="Viết tin nhắn..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
            <button
              className="btn-primary self-end"
              disabled={!newMessage.trim() || messageMutation.isPending}
              onClick={() => messageMutation.mutate(newMessage)}
            >
              <Send className="h-4 w-4" /> Gửi
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
