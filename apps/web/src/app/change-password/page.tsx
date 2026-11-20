'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { KeyRound, Loader2 } from 'lucide-react';
import { apiPost, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';

interface FormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

function ChangePasswordInner() {
  const router = useRouter();
  const search = useSearchParams();
  const forced = search?.get('forced') === '1';
  const { logout } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const newPassword = watch('newPassword');

  const onSubmit = async (data: FormData) => {
    if (data.newPassword !== data.confirmPassword) return;
    setLoading(true);
    try {
      await apiPost('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success(
        'Đổi mật khẩu thành công',
        forced ? 'Vui lòng đăng nhập lại bằng mật khẩu mới.' : 'Phiên cũ đã bị thu hồi, vui lòng đăng nhập lại.',
      );
      logout();
      router.replace('/login');
    } catch (e) {
      const err = e as ApiError;
      toast.error('Đổi mật khẩu thất bại', err.message || 'Vui lòng kiểm tra lại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-brand-600 text-white mb-4">
            <KeyRound className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Đổi mật khẩu</h1>
          <p className="text-sm text-slate-500 mt-1">
            {forced
              ? 'Tài khoản đang dùng mật khẩu mặc định — hãy đặt mật khẩu mới (≥ 12 ký tự, có hoa, thường, số, ký tự đặc biệt).'
              : 'Mật khẩu mới ≥ 12 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt.'}
          </p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Mật khẩu hiện tại *</label>
              <input
                {...register('currentPassword', { required: 'Bắt buộc nhập' })}
                type="password"
                className="input"
                autoComplete="current-password"
              />
              {errors.currentPassword && (
                <p className="text-xs text-rose-600 mt-1">{errors.currentPassword.message}</p>
              )}
            </div>
            <div>
              <label className="label">Mật khẩu mới *</label>
              <input
                {...register('newPassword', {
                  required: 'Bắt buộc nhập',
                  minLength: { value: 12, message: 'Tối thiểu 12 ký tự' },
                })}
                type="password"
                className="input"
                autoComplete="new-password"
              />
              {errors.newPassword && (
                <p className="text-xs text-rose-600 mt-1">{errors.newPassword.message}</p>
              )}
            </div>
            <div>
              <label className="label">Nhập lại mật khẩu mới *</label>
              <input
                {...register('confirmPassword', {
                  required: 'Bắt buộc nhập',
                  validate: (v) => v === newPassword || 'Mật khẩu nhập lại không khớp',
                })}
                type="password"
                className="input"
                autoComplete="new-password"
              />
              {errors.confirmPassword && (
                <p className="text-xs text-rose-600 mt-1">{errors.confirmPassword.message}</p>
              )}
            </div>
            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Đang đổi...' : 'Đổi mật khẩu'}
            </button>
            {!forced && (
              <button type="button" onClick={() => router.back()} className="btn-ghost w-full justify-center text-sm">
                Quay lại
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-500">Đang tải...</div>}>
      <ChangePasswordInner />
    </Suspense>
  );
}
