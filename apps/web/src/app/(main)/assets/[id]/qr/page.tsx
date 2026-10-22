'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { apiGet } from '@/lib/api';

interface QrData {
  /** API tra ve `{ qrKey, dataUrl }` — dataUrl la PNG data URL san dung cho <img src>. */
  qrKey: string;
  dataUrl: string;
}

export default function AssetQrPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, error } = useQuery({
    queryKey: ['asset-qr', params?.id as string],
    queryFn: () => apiGet<QrData>(`/assets/${params!.id as string}/qr`),
    enabled: !!params?.id,
  });

  return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="btn-ghost text-sm">
        <ArrowLeft className="h-4 w-4" /> Quay lại
      </button>
      <h1 className="text-2xl font-bold">QR Code thiết bị</h1>
      <div className="card p-8 flex flex-col items-center gap-4">
        {isLoading ? (
          <div className="text-slate-500">Đang tải...</div>
        ) : error ? (
          <div className="text-rose-600">Không tải được QR</div>
        ) : data?.dataUrl ? (
          <>
            <img src={data.dataUrl} alt="Asset QR" className="h-64 w-64" />
            <p className="text-xs text-slate-500 font-mono">{data.qrKey}</p>
            <button onClick={() => window.print()} className="btn-secondary">
              <Printer className="h-4 w-4" /> In QR
            </button>
          </>
        ) : (
          <div className="text-rose-600">Không tải được QR</div>
        )}
      </div>
    </div>
  );
}
