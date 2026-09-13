'use client';

import { Download } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Report {
  name: string;
  url: string;
  description: string;
}

const REPORTS: Report[] = [
  { name: 'Work Orders', url: '/reports/work-orders.csv', description: 'Danh sách phiếu công việc' },
  { name: 'Cost Summary', url: '/reports/cost-summary.csv', description: 'Tổng hợp chi phí theo WO' },
  { name: 'Asset Critical', url: '/reports/asset-critical.csv', description: 'Thiết bị ưu tiên cao' },
];

export default function ReportsPage() {
  const accessToken = useAuth((s) => s.accessToken);

  const download = async (r: Report) => {
    const res = await fetch(`${getApiBaseUrl()}${r.url}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = r.url.split('/').pop() ?? 'report.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">Báo cáo</h1>
      <p className="text-sm text-slate-500">Tải file CSV để phân tích chi tiết bằng Excel/Google Sheets.</p>
      <div className="space-y-2">
        {REPORTS.map((r) => (
          <div key={r.url} className="card p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">{r.name}</p>
              <p className="text-xs text-slate-500">{r.description}</p>
            </div>
            <button className="btn-primary" onClick={() => download(r)}>
              <Download className="h-4 w-4" /> Tải CSV
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
