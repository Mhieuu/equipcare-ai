'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Play, CheckCircle2, XCircle, UserPlus, Pause } from 'lucide-react';
import { apiGet, apiPost, apiPatch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';
import { WorkOrderStatusBadge, WorkOrderTypeBadge } from '@/components/badges';
import { format } from 'date-fns';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Modal } from '@/components/modal';
import { WorkOrderStatus, WorkOrderNoteType } from '@equipcare/shared';

interface WODetail {
  id: string;
  code: string;
  status: WorkOrderStatus;
  kind: string;
  priorityCode: string;
  description: string;
  asset: { id: string; code: string; name: string };
  assignee: { id: string; fullName: string } | null;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  resultSummary: string | null;
  slaStatus: {
    isOverdue: boolean;
    activeElapsedSeconds: number;
    remainingSeconds: number;
    pauseSeconds: number;
  } | null;
  notes: Array<{ id: string; noteType: string; body: string; authorName: string; createdAt: string }>;
  incident: { id: string; code: string } | null;
}

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [completeModal, setCompleteModal] = useState(false);
  const [completeSummary, setCompleteSummary] = useState('');
  const [assignModal, setAssignModal] = useState(false);
  const [techs, setTechs] = useState<Array<{ id: string; fullName: string }>>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [pauseModal, setPauseModal] = useState(false);
  const [pauseReason, setPauseReason] = useState('');

  const { data: wo, isLoading } = useQuery({
    queryKey: ['wo', params.id],
    queryFn: () => apiGet<WODetail>(`/work-orders/${params.id}`),
    enabled: !!params.id,
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ['wo', params.id] });

  const transitionMutation = useMutation({
    mutationFn: (vars: { to: WorkOrderStatus; payload?: Record<string, unknown> }) =>
      apiPatch(`/work-orders/${params.id}/transition`, { to: vars.to, ...vars.payload }),
    onSuccess: () => {
      toast.success('Đã chuyển trạng thái');
      refetch();
    },
    onError: (e: Error) => toast.error('Lỗi', e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiPost(`/work-orders/${params.id}/cancel`, { reason: cancelReason }),
    onSuccess: () => {
      toast.success('Đã hủy phiếu');
      setConfirmCancel(false);
      refetch();
    },
    onError: (e: Error) => toast.error('Lỗi', e.message),
  });

  const completeMutation = useMutation({
    mutationFn: () => apiPost(`/work-orders/${params.id}/complete`, { resultSummary: completeSummary }),
    onSuccess: () => {
      toast.success('Đã hoàn thành phiếu');
      setCompleteModal(false);
      setCompleteSummary('');
      refetch();
    },
    onError: (e: Error) => toast.error('Lỗi', e.message),
  });

  const assignMutation = useMutation({
    mutationFn: () => apiPatch(`/work-orders/${params.id}/assign`, { assigneeId }),
    onSuccess: () => {
      toast.success('Đã phân công');
      setAssignModal(false);
      refetch();
    },
    onError: (e: Error) => toast.error('Lỗi', e.message),
  });

  const noteMutation = useMutation({
    mutationFn: (vars: { noteType: WorkOrderNoteType; body: string }) =>
      apiPost(`/work-orders/${params.id}/notes`, vars),
    onSuccess: () => {
      toast.success('Đã thêm ghi chú');
      setPauseModal(false);
      setPauseReason('');
      refetch();
    },
  });

  const openAssign = async () => {
    const res = await apiGet<{ items: Array<{ id: string; fullName: string }> }>('/iam/users', {
      roleCode: 'TECHNICIAN',
      limit: 50,
    });
    setTechs(res.items);
    setAssignModal(true);
  };

  if (isLoading) return <div className="text-slate-500">Đang tải...</div>;
  if (!wo) return <div className="text-rose-600">Không tìm thấy</div>;

  return (
    <div className="space-y-4 max-w-4xl">
      <button onClick={() => router.back()} className="btn-ghost text-sm">
        <ArrowLeft className="h-4 w-4" /> Quay lại
      </button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{wo.code}</h1>
          <p className="text-sm text-slate-500">
            Thiết bị:{' '}
            <Link href={`/assets/${wo.asset.id}`} className="text-brand-700 hover:underline">
              {wo.asset.code} - {wo.asset.name}
            </Link>
          </p>
          {wo.incident && (
            <p className="text-sm">
              Sự cố:{' '}
              <Link href={`/incidents/${wo.incident.id}`} className="text-brand-700 hover:underline">
                {wo.incident.code}
              </Link>
            </p>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <WorkOrderTypeBadge type={wo.kind as never} />
          <WorkOrderStatusBadge status={wo.status} />
          {wo.slaStatus?.isOverdue && <span className="badge-red">Quá hạn</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4 space-y-2">
          <h2 className="font-semibold mb-2">Thông tin</h2>
          <Row label="Mô tả" value={<span className="whitespace-pre-line">{wo.description}</span>} />
          <Row label="Ưu tiên" value={wo.priorityCode} />
          <Row label="KTV" value={wo.assignee?.fullName ?? '—'} />
          <Row label="Hạn" value={wo.dueAt ? format(new Date(wo.dueAt), 'dd/MM HH:mm') : '—'} />
        </div>

        <div className="card p-4 space-y-2">
          <h2 className="font-semibold mb-2">SLA</h2>
          {wo.slaStatus ? (
            <>
              <Row label="Active elapsed" value={fmtDur(wo.slaStatus.activeElapsedSeconds)} />
              <Row label="Remaining" value={fmtDur(wo.slaStatus.remainingSeconds)} />
              <Row label="Pause total" value={fmtDur(wo.slaStatus.pauseSeconds)} />
              <Row label="Started" value={wo.startedAt ? format(new Date(wo.startedAt), 'dd/MM HH:mm') : '—'} />
              <Row label="Completed" value={wo.completedAt ? format(new Date(wo.completedAt), 'dd/MM HH:mm') : '—'} />
            </>
          ) : (
            <p className="text-sm text-slate-500">Chưa bắt đầu</p>
          )}
        </div>

        <div className="card p-4">
          <h2 className="font-semibold mb-3">Hành động</h2>
          <div className="flex flex-col gap-2">
            {wo.status === WorkOrderStatus.NEW && hasPermission('work-order:assign') && (
              <button className="btn-primary" onClick={openAssign}>
                <UserPlus className="h-4 w-4" /> Phân công
              </button>
            )}
            {wo.status === WorkOrderStatus.ASSIGNED && hasPermission('work-order:transition') && (
              <button className="btn-primary" onClick={() => transitionMutation.mutate({ to: WorkOrderStatus.IN_PROGRESS })}>
                <Play className="h-4 w-4" /> Bắt đầu
              </button>
            )}
            {wo.status === WorkOrderStatus.IN_PROGRESS && (
              <>
                <button className="btn-primary" onClick={() => setCompleteModal(true)} disabled={!hasPermission('work-order:complete')}>
                  <CheckCircle2 className="h-4 w-4" /> Hoàn thành
                </button>
                <button className="btn-secondary" onClick={() => setPauseModal(true)} disabled={!hasPermission('work-order:transition')}>
                  <Pause className="h-4 w-4" /> Tạm dừng
                </button>
              </>
            )}
            {(wo.status === WorkOrderStatus.NEW || wo.status === WorkOrderStatus.ASSIGNED) && hasPermission('work-order:cancel') && (
              <button className="btn-danger" onClick={() => setConfirmCancel(true)}>
                <XCircle className="h-4 w-4" /> Hủy phiếu
              </button>
            )}
          </div>
        </div>
      </div>

      {wo.resultSummary && (
        <div className="card p-4">
          <h2 className="font-semibold mb-2">Kết quả</h2>
          <p className="text-sm whitespace-pre-line">{wo.resultSummary}</p>
        </div>
      )}

      <div className="card p-4">
        <h2 className="font-semibold mb-3">Ghi chú ({wo.notes.length})</h2>
        <ul className="space-y-2">
          {wo.notes.map((n) => (
            <li key={n.id} className="border-l-2 border-slate-200 pl-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">{n.authorName}</span>
                <span className="badge-gray text-xs">{n.noteType}</span>
                <span className="text-xs text-slate-500">{format(new Date(n.createdAt), 'dd/MM HH:mm')}</span>
              </div>
              <p className="text-sm whitespace-pre-line">{n.body}</p>
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Hủy phiếu công việc"
        message="Vui lòng nhập lý do hủy."
        variant="danger"
        onCancel={() => {
          setConfirmCancel(false);
          setCancelReason('');
        }}
        onConfirm={async () => {
          if (!cancelReason) {
            toast.warning('Bắt buộc nhập lý do');
            return;
          }
          await cancelMutation.mutateAsync();
        }}
      />
      {confirmCancel && (
        <div className="card p-3">
          <label className="label">Lý do hủy *</label>
          <input className="input" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </div>
      )}

      <Modal open={completeModal} onClose={() => setCompleteModal(false)} title="Hoàn thành phiếu" size="md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCompleteModal(false)}>Hủy</button>
            <button className="btn-primary" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
              <CheckCircle2 className="h-4 w-4" /> Xác nhận
            </button>
          </>
        }
      >
        <label className="label">Tóm tắt kết quả *</label>
        <textarea className="input" rows={4} value={completeSummary} onChange={(e) => setCompleteSummary(e.target.value)} placeholder="Đã sửa xong..." />
      </Modal>

      <Modal open={assignModal} onClose={() => setAssignModal(false)} title="Phân công kỹ thuật viên"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAssignModal(false)}>Hủy</button>
            <button className="btn-primary" onClick={() => assignMutation.mutate()} disabled={!assigneeId}>
              <UserPlus className="h-4 w-4" /> Phân công
            </button>
          </>
        }
      >
        <label className="label">Chọn KTV *</label>
        <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">-- Chọn --</option>
          {techs.map((t) => (
            <option key={t.id} value={t.id}>{t.fullName}</option>
          ))}
        </select>
      </Modal>

      <Modal open={pauseModal} onClose={() => setPauseModal(false)} title="Tạm dừng"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPauseModal(false)}>Hủy</button>
            <button className="btn-primary" onClick={() => noteMutation.mutate({ noteType: WorkOrderNoteType.PAUSE_START, body: pauseReason })}>
              <Pause className="h-4 w-4" /> Tạm dừng
            </button>
          </>
        }
      >
        <label className="label">Lý do tạm dừng *</label>
        <select className="input" value={pauseReason} onChange={(e) => setPauseReason(e.target.value)}>
          <option value="">-- Chọn --</option>
          <option value="WAITING_PART">Chờ linh kiện</option>
          <option value="WAITING_RESOURCE">Chờ nguồn lực</option>
          <option value="OTHER">Khác</option>
        </select>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 font-medium">{value}</dd>
    </div>
  );
}

function fmtDur(seconds: number): string {
  if (seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
