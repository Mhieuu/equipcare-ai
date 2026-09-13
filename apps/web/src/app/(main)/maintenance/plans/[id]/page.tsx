'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pause, Play } from 'lucide-react';
import { format } from 'date-fns';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/components/toast';

interface PlanDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  asset: { id: string; code: string; name: string };
  intervalValue: number;
  intervalUnit: string;
  scheduleBasis: string;
  isActive: boolean;
  occurrences: Array<{
    id: string;
    dueOn: string;
    status: string;
    skippedReason: string | null;
    workOrder: { id: string; code: string; status: string } | null;
  }>;
}

export default function PlanDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: plan, isLoading } = useQuery({
    queryKey: ['plan', params.id],
    queryFn: () => apiGet<PlanDetail>(`/maintenance-plans/${params.id}`),
    enabled: !!params.id,
  });

  const pause = useMutation({
    mutationFn: () => apiPost(`/maintenance-plans/${params.id}/pause`, {}),
    onSuccess: () => { toast.success('Đã tạm dừng'); void qc.invalidateQueries({ queryKey: ['plan', params.id] }); },
  });
  const resume = useMutation({
    mutationFn: () => apiPost(`/maintenance-plans/${params.id}/resume`, {}),
    onSuccess: () => { toast.success('Đã tiếp tục'); void qc.invalidateQueries({ queryKey: ['plan', params.id] }); },
  });

  if (isLoading) return <div className="text-slate-500">Đang tải...</div>;
  if (!plan) return <div className="text-rose-600">Không tìm thấy</div>;

  return (
    <div className="space-y-4 max-w-4xl">
      <button onClick={() => router.back()} className="btn-ghost text-sm">
        <ArrowLeft className="h-4 w-4" /> Quay lại
      </button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{plan.name}</h1>
          <p className="text-sm text-slate-500">Mã: <span className="font-mono">{plan.code}</span></p>
          <p className="text-sm">Thiết bị: <span className="font-medium">{plan.asset.code} - {plan.asset.name}</span></p>
        </div>
        <div className="flex gap-2">
          {plan.isActive ? (
            <button className="btn-secondary" onClick={() => pause.mutate()}><Pause className="h-4 w-4" /> Tạm dừng</button>
          ) : (
            <button className="btn-primary" onClick={() => resume.mutate()}><Play className="h-4 w-4" /> Tiếp tục</button>
          )}
        </div>
      </div>

      <div className="card p-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-slate-500">Chu kỳ</dt>
          <dd className="font-medium">{plan.intervalValue} {plan.intervalUnit}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Cơ sở lịch</dt>
          <dd className="font-medium">{plan.scheduleBasis}</dd>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="font-semibold mb-3">Lịch sử kỳ ({plan.occurrences.length})</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Ngày đến hạn</th>
              <th>Trạng thái</th>
              <th>Phiếu WO</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {plan.occurrences.map((o) => (
              <tr key={o.id}>
                <td>{format(new Date(o.dueOn), 'dd/MM/yyyy')}</td>
                <td>
                  <span className={
                    o.status === 'COMPLETED' ? 'badge-green' :
                    o.status === 'OVERDUE' ? 'badge-red' :
                    o.status === 'SKIPPED' ? 'badge-gray' : 'badge-blue'
                  }>{o.status}</span>
                </td>
                <td>{o.workOrder ? <a className="text-brand-700 hover:underline" href={`/work-orders/${o.workOrder.id}`}>{o.workOrder.code}</a> : '—'}</td>
                <td className="text-xs text-slate-500">{o.skippedReason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
