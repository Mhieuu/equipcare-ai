'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Save } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/components/toast';

interface Option {
  id: string;
  code: string;
  name: string;
}

interface FormData {
  code: string;
  name: string;
  assetTypeId: string;
  departmentId: string;
  locationId: string;
  serialNumber: string;
  supplierName: string;
}

export default function NewAssetPage() {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const { data: assetTypes } = useQuery({
    queryKey: ['asset-types'],
    queryFn: () => apiGet<{ items: Option[] }>('/organization/asset-types'),
  });
  const { data: depts } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiGet<{ items: Option[] }>('/organization/departments'),
  });
  const { data: locs } = useQuery({
    queryKey: ['locations'],
    queryFn: () => apiGet<{ items: Option[] }>('/organization/locations'),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const res = await apiPost<{ id: string; code: string }>('/assets', {
        code: data.code.toUpperCase(),
        name: data.name,
        assetTypeId: data.assetTypeId,
        departmentId: data.departmentId,
        locationId: data.locationId,
        serialNumber: data.serialNumber || undefined,
        supplierName: data.supplierName || undefined,
      });
      toast.success('Đã tạo thiết bị', res.code);
      void qc.invalidateQueries({ queryKey: ['assets'] });
      router.push(`/assets/${res.id}`);
    } catch (e) {
      toast.error('Lỗi tạo thiết bị', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <button onClick={() => router.back()} className="btn-ghost text-sm">
        <ArrowLeft className="h-4 w-4" /> Quay lại
      </button>
      <h1 className="text-2xl font-bold">Tạo thiết bị mới</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="card p-5 space-y-4">
        <div>
          <label className="label">Mã thiết bị *</label>
          <input {...register('code', { required: 'Bắt buộc', pattern: /^[A-Z0-9][A-Z0-9._-]{1,49}$/ })} className="input" placeholder="PUMP-A-001" />
          {errors.code && <p className="text-xs text-rose-600 mt-1">{errors.code.message ?? 'Mã không hợp lệ'}</p>}
        </div>
        <div>
          <label className="label">Tên *</label>
          <input {...register('name', { required: 'Bắt buộc' })} className="input" />
          {errors.name && <p className="text-xs text-rose-600 mt-1">{errors.name.message}</p>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Loại thiết bị *</label>
            <select {...register('assetTypeId', { required: 'Bắt buộc' })} className="input">
              <option value="">-- Chọn --</option>
              {assetTypes?.items.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Phòng ban *</label>
            <select {...register('departmentId', { required: 'Bắt buộc' })} className="input">
              <option value="">-- Chọn --</option>
              {depts?.items.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Vị trí *</label>
            <select {...register('locationId', { required: 'Bắt buộc' })} className="input">
              <option value="">-- Chọn --</option>
              {locs?.items.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Serial number</label>
            <input {...register('serialNumber')} className="input" />
          </div>
          <div>
            <label className="label">Nhà cung cấp</label>
            <input {...register('supplierName')} className="input" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <button type="button" onClick={() => router.back()} className="btn-secondary">
            Hủy
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            <Save className="h-4 w-4" /> {submitting ? 'Đang lưu...' : 'Tạo thiết bị'}
          </button>
        </div>
      </form>
    </div>
  );
}
