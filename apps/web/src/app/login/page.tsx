'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Wrench, Loader2 } from 'lucide-react';
import { apiPost, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';

interface LoginForm {
  loginName: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { setTokens } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    defaultValues: { loginName: '', password: '' },
  });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      const res = await apiPost<{ accessToken: string; refreshToken: string }>('/auth/login', data, {
        noAuth: true,
      });
      setTokens(res.accessToken, res.refreshToken ?? '');
      router.replace('/dashboard');
    } catch (e) {
      const err = e as ApiError;
      toast.error('Đăng nhập thất bại', err.message || 'Sai tên đăng nhập hoặc mật khẩu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-brand-600 text-white mb-4">
            <Wrench className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">EquipCare AI</h1>
          <p className="text-sm text-slate-500 mt-1">Hệ thống quản lý bảo trì thiết bị</p>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Đăng nhập</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Tên đăng nhập</label>
              <input
                {...register('loginName', { required: 'Bắt buộc nhập' })}
                className="input"
                placeholder="admin.bootstrap"
                autoComplete="username"
              />
              {errors.loginName && <p className="text-xs text-rose-600 mt-1">{errors.loginName.message}</p>}
            </div>
            <div>
              <label className="label">Mật khẩu</label>
              <input
                {...register('password', { required: 'Bắt buộc nhập' })}
                type="password"
                className="input"
                autoComplete="current-password"
              />
              {errors.password && <p className="text-xs text-rose-600 mt-1">{errors.password.message}</p>}
            </div>
            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>
          <div className="mt-4 pt-4 border-t border-slate-200 text-xs text-slate-500">
            <p className="font-medium mb-1">Tài khoản demo:</p>
            <ul className="space-y-0.5">
              <li>
                <code>admin.bootstrap</code> / <code>ChangeMe@2026</code>
              </li>
              <li>
                <code>demo.reporter</code> / <code>ChangeMe@2026</code>
              </li>
              <li>
                <code>demo.manager</code> / <code>ChangeMe@2026</code>
              </li>
              <li>
                <code>demo.technician</code> / <code>ChangeMe@2026</code>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
