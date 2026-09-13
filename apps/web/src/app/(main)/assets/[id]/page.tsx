'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, QrCode, Power, PowerOff, Archive } from 'lucide-react';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { AssetStatusBadge } from '@/components/badges';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { AssetManualState, AssetManualStateLabel } from '@equipcare/shared';

interface AssetDetail {
  id: string;
  code: string;
  name: string;
  assetType: { code: string; name: string };
  department: { id: string; name: string };
  location: { id: string; name: string };
  activityStatus: string;
  manualState: string;
  serialNumber: string | null;
  supplierName: string | null;
  purchasedOn: string | null;
  commissionedOn: string | null;
  warrantyUntil: string | null;
  specifications: Record<string, unknown> | null;
  activeWorkOrders: Array<{ id: string; code: string; status: string; kind: string }>;
}

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [confirmState, setConfirmState] = useState<AssetManualState | null>(null);
  const [retireReason, setRetireReason] = useState('');

  const { data: asset, isLoading } = useQuery({
    queryKey: ['asset', params.id],
    queryFn: () => apiGet<AssetDetail>(`/assets/${params.id}`),
    enabled: !!params.id,
  });

  if (isLoading) return <div className="text-slate-500">Đang tải...</div>;
  if (!asset) return <div className="text-rose-600">Không tìm thấy thiết bị</div>;

  const canTransition = hasPermission('asset:update');

  const doTransition = async () => {
    if (!confirmState) return;
    try {
      await apiPost(`/assets/${asset.id}/lifecycle`, {
        to: confirmState,
        reason: confirmState === AssetManualState.RETIRED ? retireReason : undefined,
      });
      toast.success('Đã chuyển trạng thái', `${asset.code} → ${AssetManualStateLabel[confirmState]}`);
      setConfirmState(null);
      setRetireReason('');
      void qc.invalidateQueries({ queryKey: ['asset', asset.id] });
    } catch (e) {
      toast.error('Lỗi', (e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="btn-ghost text-sm">
        <ArrowLeft className="h-4 w-4" /> Quay lại
      </button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{asset.name}</h1>
          <p className="text-sm text-slate-500">
            Mã: <span className="font-mono">{asset.code}</span>
          </p>
        </div>
        <AssetStatusBadge status={asset.activityStatus as never} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Thông tin */}
        <div className="card p-4 space-y-2 lg:col-span-2">
          <h2 className="font-semibold mb-3">Thông tin chung</h2>
          <Row label="Loại thiết bị" value={asset.assetType?.name} />
          <Row label="Phòng ban" value={asset.department?.name} />
          <Row label="Vị trí" value={asset.location?.name} />
          <Row label="Serial" value={asset.serialNumber ?? '—'} />
          <Row label="Nhà cung cấp" value={asset.supplierName ?? '—'} />
          <Row label="Ngày mua" value={asset.purchasedOn ?? '—'} />
          <Row label="Ngày vận hành" value={asset.commissionedOn ?? '—'} />
          <Row label="Bảo hành đến" value={asset.warrantyUntil ?? '—'} />
          <Row label="Manual state" value={AssetManualStateLabel[asset.manualState as AssetManualState] ?? asset.manualState} />
        </div>

        {/* QR */}
        <div className="card p-4 flex flex-col items-center">
          <h2 className="font-semibold mb-3 self-start">QR Code</h2>
          <Link href={`/assets/${asset.id}/qr`} className="btn-secondary">
            <QrCode className="h-4 w-4" /> Mở QR
          </Link>
        </div>
      </div>

      {/* Lifecycle actions */}
      {canTransition && (
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Vòng đời (FR-ASSET-05)</h2>
          <div className="flex gap-2">
            {asset.manualState !== AssetManualState.NORMAL && (
              <button onClick={() => setConfirmState(AssetManualState.NORMAL)} className="btn-secondary">
                <Power className="h-4 w-4" /> Vận hành
              </button>
            )}
            {asset.manualState !== AssetManualState.SUSPENDED && (
              <button onClick={() => setConfirmState(AssetManualState.SUSPENDED)} className="btn-secondary">
                <PowerOff className="h-4 w-4" /> Tạm ngừng
              </button>
            )}
            {asset.manualState !== AssetManualState.RETIRED && (
              <button onClick={() => setConfirmState(AssetManualState.RETIRED)} className="btn-danger">
                <Archive className="h-4 w-4" /> Ngừng sử dụng
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active WOs */}
      {asset.activeWorkOrders && asset.activeWorkOrders.length > 0 && (
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Phiếu công việc đang mở</h2>
          <ul className="space-y-1">
            {asset.activeWorkOrders.map((w) => (
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

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState ? `Chuyển sang ${AssetManualStateLabel[confirmState]}` : ''}
        message={
          confirmState === AssetManualState.RETIRED
            ? 'Bạn cần nhập lý do ngừng sử dụng thiết bị.'
            : `Chuyển thiết bị ${asset.code} sang trạng thái ${confirmState ? AssetManualStateLabel[confirmState] : ''}?`
        }
        variant={confirmState === AssetManualState.RETIRED ? 'danger' : 'primary'}
        onCancel={() => {
          setConfirmState(null);
          setRetireReason('');
        }}
        onConfirm={doTransition}
      />
      {confirmState === AssetManualState.RETIRED && (
        <div className="card p-3">
          <label className="label">Lý do ngừng sử dụng</label>
          <input
            className="input"
            value={retireReason}
            onChange={(e) => setRetireReason(e.target.value)}
            placeholder="Bắt buộc"
          />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm font-medium col-span-2">{value}</dd>
    </div>
  );
}
