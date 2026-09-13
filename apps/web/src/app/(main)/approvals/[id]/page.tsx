'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, X, MessageSquare, Send } from 'lucide-react';
import { apiGet, apiPatch } from '@/lib/api';
import { useToast } from '@/components/toast';
import { ApprovalStatusBadge } from '@/components/badges';
import { Modal } from '@/components/modal';
import { format } from 'date-fns';
import { ApprovalStatus } from '@equipcare/shared';

interface ApprovalDetail {
  id: string;
  status: ApprovalStatus;
  reason: string;
  actionPlan: string;
  otherEstimatedCost: string | null;
  workOrder: { id: string; code: string; description: string; asset: { code: string; name: string } };
  proposer: { id: string; fullName: string };
  events: Array<{ id: string; eventType: string; actorName: string; note: string | null; createdAt: string }>;
  currentRevision: {
    id: string;
    revisionNo: number;
    netCost: string | null;
    parts: Array<{ partId: string; partCode: string; partName: string; quantity: number; unitPrice: string }>;
  };
}

export default function ApprovalDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [decisionModal, setDecisionModal] = useState<'APPROVED' | 'REJECTED' | 'INFO_REQUESTED' | null>(null);
  const [note, setNote] = useState('');

  const { data: a, isLoading } = useQuery({
    queryKey: ['approval', params.id],
    queryFn: () => apiGet<ApprovalDetail>(`/approvals/${params.id}`),
    enabled: !!params.id,
  });

  const decide = useMutation({
    mutationFn: (vars: { action: 'APPROVED' | 'REJECTED' | 'INFO_REQUESTED'; note: string }) =>
      apiPatch(`/approvals/${params.id}`, vars),
    onSuccess: () => {
      toast.success('Đã xử lý');
      setDecisionModal(null);
      setNote('');
      void qc.invalidateQueries({ queryKey: ['approval', params.id] });
    },
    onError: (e: Error) => toast.error('Lỗi', e.message),
  });

  if (isLoading) return <div className="text-slate-500">Đang tải...</div>;
  if (!a) return <div className="text-rose-600">Không tìm thấy</div>;

  return (
    <div className="space-y-4 max-w-4xl">
      <button onClick={() => router.back()} className="btn-ghost text-sm">
        <ArrowLeft className="h-4 w-4" /> Quay lại
      </button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Phê duyệt #{a.id.slice(0, 8)}</h1>
          <p className="text-sm text-slate-500">
            WO: <span className="font-mono">{a.workOrder.code}</span> · Người đề xuất: {a.proposer.fullName}
          </p>
        </div>
        <ApprovalStatusBadge status={a.status} />
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="font-semibold">Nội dung đề xuất</h2>
        <div>
          <dt className="text-xs text-slate-500">Lý do</dt>
          <dd className="text-sm whitespace-pre-line">{a.reason}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Kế hoạch</dt>
          <dd className="text-sm whitespace-pre-line">{a.actionPlan}</dd>
        </div>
        {a.otherEstimatedCost && (
          <div>
            <dt className="text-xs text-slate-500">Chi phí khác ước tính</dt>
            <dd className="text-sm font-medium">{Number(a.otherEstimatedCost).toLocaleString('vi-VN')} đ</dd>
          </div>
        )}
      </div>

      {a.currentRevision && (
        <div className="card p-4">
          <h2 className="font-semibold mb-3">Linh kiện đề xuất (Rev #{a.currentRevision.revisionNo})</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên</th>
                <th>SL</th>
                <th>Đơn giá</th>
                <th>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {a.currentRevision.parts.map((p) => (
                <tr key={p.partId}>
                  <td className="font-mono">{p.partCode}</td>
                  <td>{p.partName}</td>
                  <td>{p.quantity}</td>
                  <td>{Number(p.unitPrice).toLocaleString('vi-VN')} đ</td>
                  <td>{(Number(p.unitPrice) * p.quantity).toLocaleString('vi-VN')} đ</td>
                </tr>
              ))}
            </tbody>
          </table>
          {a.currentRevision.netCost && (
            <p className="mt-3 text-sm font-medium">
              Tổng: {Number(a.currentRevision.netCost).toLocaleString('vi-VN')} đ
            </p>
          )}
        </div>
      )}

      <div className="card p-4">
        <h2 className="font-semibold mb-3">Hành động</h2>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => setDecisionModal('APPROVED')} disabled={a.status !== ApprovalStatus.SUBMITTED && a.status !== ApprovalStatus.INFO_REQUESTED}>
            <Check className="h-4 w-4" /> Duyệt
          </button>
          <button className="btn-danger" onClick={() => setDecisionModal('REJECTED')} disabled={a.status !== ApprovalStatus.SUBMITTED && a.status !== ApprovalStatus.INFO_REQUESTED}>
            <X className="h-4 w-4" /> Từ chối
          </button>
          <button className="btn-secondary" onClick={() => setDecisionModal('INFO_REQUESTED')} disabled={a.status !== ApprovalStatus.SUBMITTED}>
            <MessageSquare className="h-4 w-4" /> Yêu cầu bổ sung
          </button>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="font-semibold mb-3">Lịch sử</h2>
        <ul className="space-y-2">
          {a.events.map((e) => (
            <li key={e.id} className="border-l-2 border-slate-200 pl-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="badge-gray text-xs">{e.eventType}</span>
                <span className="text-sm font-medium">{e.actorName}</span>
                <span className="text-xs text-slate-500">{format(new Date(e.createdAt), 'dd/MM HH:mm')}</span>
              </div>
              {e.note && <p className="text-sm">{e.note}</p>}
            </li>
          ))}
        </ul>
      </div>

      <Modal
        open={decisionModal !== null}
        onClose={() => setDecisionModal(null)}
        title={decisionModal === 'APPROVED' ? 'Duyệt' : decisionModal === 'REJECTED' ? 'Từ chối' : 'Yêu cầu bổ sung'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setDecisionModal(null)}>Hủy</button>
            <button
              className={decisionModal === 'REJECTED' ? 'btn-danger' : 'btn-primary'}
              onClick={() => decide.mutate({ action: decisionModal!, note })}
              disabled={!note}
            >
              <Send className="h-4 w-4" /> Xác nhận
            </button>
          </>
        }
      >
        <label className="label">Ghi chú *</label>
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Modal>
    </div>
  );
}
