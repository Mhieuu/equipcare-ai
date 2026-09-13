'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Save } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/components/toast';
import { WorkOrderType, IncidentPriority, WorkOrderCreationMode } from '@equipcare/shared';

interface AssetOption { id: string; code: string; name: string }
interface IncidentOption { id: string; code: string; description: string }
interface UserOption { id: string; fullName: string; loginName: string }

interface FormData {
  assetId: string;
  incidentId: string;
  kind: WorkOrderType;
  creationMode: WorkOrderCreationMode;
  priorityCode: IncidentPriority;
  description: string;
  assigneeId: string;
}

export default function NewWorkOrderPage() {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  const { data: assetsRes } = useQuery({
    queryKey: ['assets-min'],
    queryFn: () => apiGet<{ items: AssetOption[] }>('/assets', { limit: 200 }),
  });
  const { data: incidentsRes } = useQuery({
    queryKey: ['incidents-min'],
    queryFn: () =>
      apiGet<{ items: IncidentOption[] }>('/incidents', {
        limit: 50,
      }),
  });
  const { data: techsRes } = useQuery({
    queryKey: ['tech-users'],
    queryFn: () => apiGet<{ items: UserOption[] }>('/iam/users', { roleCode: 'TECHNICIAN', limit: 50 }),
  });

  const { register, handleSubmit, watch } = useForm<FormData>({
    defaultValues: {
      creationMode: (search.get('incidentId') ? WorkOrderCreationMode.FROM_INCIDENT : WorkOrderCreationMode.MANUAL) as WorkOrderCreationMode,
      priorityCode: IncidentPriority.MEDIUM,
      kind: WorkOrderType.REPAIR,
    },
  });
  const creationMode = watch('creationMode');

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        assetId: data.assetId,
        kind: data.kind,
        creationMode: data.creationMode,
        priorityCode: data.priorityCode,
        description: data.description,
      };
      if (data.creationMode === WorkOrderCreationMode.FROM_INCIDENT && data.incidentId) {
        payload.incidentId = data.incidentId;
      }
      if (data.assigneeId) {
        payload.assigneeId = data.assigneeId;
      }
      const res = await apiPost<{ id: string; code: string }>('/work-orders', payload);
      toast.success('Đã tạo phiếu', res.code);
      router.push(`/work-orders/${res.id}`);
    } catch (e) {
      toast.error('Lỗi', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <button onClick={() => router.back()} className="btn-ghost text-sm">
        <ArrowLeft className="h-4 w-4" /> Quay lại
      </button>
      <h1 className="text-2xl font-bold">Tạo phiếu công việc</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="card p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Loại phiếu *</label>
            <select {...register('kind', { required: true })} className="input">
              {Object.values(WorkOrderType).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Ưu tiên *</label>
            <select {...register('priorityCode', { required: true })} className="input">
              {Object.values(IncidentPriority).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Nguồn tạo</label>
          <div className="flex gap-2">
            <label className="flex items-center gap-1">
              <input type="radio" value={WorkOrderCreationMode.MANUAL} {...register('creationMode')} />
              <span className="text-sm">Thủ công</span>
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" value={WorkOrderCreationMode.FROM_INCIDENT} {...register('creationMode')} />
              <span className="text-sm">Từ sự cố</span>
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" value={WorkOrderCreationMode.FROM_MAINTENANCE} {...register('creationMode')} />
              <span className="text-sm">Từ bảo trì</span>
            </label>
          </div>
        </div>

        {creationMode === WorkOrderCreationMode.FROM_INCIDENT && (
          <div>
            <label className="label">Sự cố liên quan *</label>
            <select {...register('incidentId', { required: creationMode === 'FROM_INCIDENT' })} className="input">
              <option value="">-- Chọn --</option>
              {incidentsRes?.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.code} - {i.description.slice(0, 50)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">Thiết bị *</label>
          <select {...register('assetId', { required: true })} className="input">
            <option value="">-- Chọn --</option>
            {assetsRes?.items.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} - {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Mô tả công việc *</label>
          <textarea {...register('description', { required: true })} rows={3} className="input" />
        </div>

        <div>
          <label className="label">Phân công cho KTV (tùy chọn)</label>
          <select {...register('assigneeId')} className="input">
            <option value="">-- Để trống --</option>
            {techsRes?.items.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} ({u.loginName})
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button type="button" onClick={() => router.back()} className="btn-secondary">
            Hủy
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            <Save className="h-4 w-4" /> {submitting ? 'Đang lưu...' : 'Tạo phiếu'}
          </button>
        </div>
      </form>
    </div>
  );
}
