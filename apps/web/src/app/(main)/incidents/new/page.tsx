'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Save } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/components/toast';

interface AssetOption { id: string; code: string; name: string }
interface FormData {
  assetId: string;
  description: string;
  impactDescription: string;
}

export default function NewIncidentPage() {
  const router = useRouter();
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const { data: assetsRes } = useQuery({
    queryKey: ['assets-list-min'],
    queryFn: () => apiGet<{ items: AssetOption[] }>('/assets', { limit: 200 }),
  });

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const res = await apiPost<{ id: string; code: string }>('/incidents', data);
      toast.success('Đã tạo sự cố', res.code);
      router.push(`/incidents/${res.id}`);
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
      <h1 className="text-2xl font-bold">Báo sự cố</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="card p-5 space-y-4">
        <div>
          <label className="label">Thiết bị *</label>
          <select {...register('assetId', { required: 'Bắt buộc' })} className="input">
            <option value="">-- Chọn thiết bị --</option>
            {assetsRes?.items.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} - {a.name}
              </option>
            ))}
          </select>
          {errors.assetId && <p className="text-xs text-rose-600 mt-1">{errors.assetId.message}</p>}
        </div>
        <div>
          <label className="label">Mô tả sự cố *</label>
          <textarea {...register('description', { required: 'Bắt buộc' })} rows={4} className="input" placeholder="Mô tả chi tiết..." />
          {errors.description && <p className="text-xs text-rose-600 mt-1">{errors.description.message}</p>}
        </div>
        <div>
          <label className="label">Mô tả ảnh hưởng *</label>
          <textarea {...register('impactDescription', { required: 'Bắt buộc' })} rows={3} className="input" placeholder="Ảnh hưởng đến sản xuất/hoạt động..." />
          {errors.impactDescription && <p className="text-xs text-rose-600 mt-1">{errors.impactDescription.message}</p>}
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button type="button" onClick={() => router.back()} className="btn-secondary">
            Hủy
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            <Save className="h-4 w-4" /> {submitting ? 'Đang lưu...' : 'Gửi báo cáo'}
          </button>
        </div>
      </form>
    </div>
  );
}
