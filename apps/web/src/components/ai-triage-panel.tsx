'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Sparkles, Loader2, CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { useToast } from '@/components/toast';
import { AiRequestStatus, AiRequestStatusLabel } from '@equipcare/shared';

interface AiTriageOutput {
  category?: string;
  priority?: string;
  confidence?: number;
  summary?: string;
  reasoning?: string;
  recommendedActions?: string[];
}

interface AiRequestView {
  id: string;
  status: AiRequestStatus;
  provider: string;
  modelName: string;
  promptVersion: string;
  output: AiTriageOutput | null;
  errorCode: string | null;
  finishedAt: string | null;
  createdAt: string;
}

interface Props {
  incidentId: string;
  currentPriority: string;
  onApplyPriority?: (p: string) => void;
}

export function AiTriagePanel({ incidentId, currentPriority, onApplyPriority }: Props) {
  const toast = useToast();
  const [pollRequestId, setPollRequestId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start analyze (POST → 202 { requestId })
  const startMutation = useMutation({
    mutationFn: () => apiPost<{ requestId: string; status: string }>(`/ai/incidents/${incidentId}/analyze`),
    onSuccess: (data) => {
      toast.success('Đã gửi yêu cầu AI', `Mã yêu cầu: ${data.requestId.slice(0, 8)}…`);
      setPollRequestId(data.requestId);
    },
    onError: (e: Error) => toast.error('AI lỗi', e.message),
  });

  // Poll status while pollRequestId set
  const { data: req, isFetching } = useQuery({
    queryKey: ['ai-request', pollRequestId],
    queryFn: () => apiGet<AiRequestView>(`/ai/requests/${pollRequestId}`),
    enabled: !!pollRequestId,
    refetchInterval: (q) => {
      const data = q.state.data as AiRequestView | undefined;
      if (!data) return 1500;
      if (
        data.status === AiRequestStatus.SUCCEEDED ||
        data.status === AiRequestStatus.FAILED ||
        data.status === AiRequestStatus.TIMED_OUT
      ) {
        return false;
      }
      return 1500;
    },
  });

  // Stop polling on terminal status
  useEffect(() => {
    if (
      req &&
      (req.status === AiRequestStatus.SUCCEEDED ||
        req.status === AiRequestStatus.FAILED ||
        req.status === AiRequestStatus.TIMED_OUT)
    ) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [req]);

  const isTerminal =
    req?.status === AiRequestStatus.SUCCEEDED ||
    req?.status === AiRequestStatus.FAILED ||
    req?.status === AiRequestStatus.TIMED_OUT;

  const output = req?.output;

  return (
    <div className="card p-4 border-l-4 border-l-purple-500">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-600" /> AI Phân loại sự cố
        </h2>
        <span className="text-xs text-slate-500">
          Provider: <span className="font-mono">{req?.provider ?? '—'}</span>
        </span>
      </div>

      {!pollRequestId && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Gợi ý phân loại (category), mức ưu tiên và hành động kế tiếp dựa trên mô tả & thiết bị.
          </p>
          <button
            className="btn-primary"
            disabled={startMutation.isPending}
            onClick={() => startMutation.mutate()}
          >
            {startMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Đang gửi...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Phân tích bằng AI
              </>
            )}
          </button>
        </div>
      )}

      {pollRequestId && (
        <div className="space-y-3">
          {/* Status row */}
          <div className="flex items-center gap-2 text-sm">
            <StatusIcon status={req?.status} />
            <span className="font-medium">{AiRequestStatusLabel[req?.status as never] ?? 'Đang tải...'}</span>
            {isFetching && !isTerminal && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
            <span className="text-xs text-slate-500 ml-auto">
              {req?.promptVersion && <>v{req.promptVersion}</>}
              {req?.modelName && req.modelName !== 'pending' && <> · {req.modelName}</>}
            </span>
          </div>

          {/* Result */}
          {req?.status === AiRequestStatus.SUCCEEDED && output && (
            <div className="space-y-3 bg-purple-50 rounded-md p-3">
              <Row label="Phân loại">
                <span className="badge-purple">{output.category ?? '—'}</span>
              </Row>
              <Row label="Mức ưu tiên gợi ý">
                <div className="flex items-center gap-2">
                  <span className="badge-purple">{output.priority ?? '—'}</span>
                  {output.priority &&
                    output.priority !== currentPriority &&
                    onApplyPriority && (
                      <button
                        type="button"
                        className="text-xs text-brand-700 hover:underline"
                        onClick={() => onApplyPriority(output.priority!)}
                      >
                        Áp dụng
                      </button>
                    )}
                </div>
                {typeof output.confidence === 'number' && (
                  <span className="text-xs text-slate-500 ml-2">
                    (độ tin cậy {Math.round(output.confidence * 100)}%)
                  </span>
                )}
              </Row>
              {output.reasoning && (
                <Row label="Lý do">
                  <p className="text-sm whitespace-pre-line">{output.reasoning}</p>
                </Row>
              )}
              {output.summary && (
                <Row label="Tóm tắt">
                  <p className="text-sm whitespace-pre-line">{output.summary}</p>
                </Row>
              )}
              {output.recommendedActions && output.recommendedActions.length > 0 && (
                <Row label="Hành động gợi ý">
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {output.recommendedActions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </Row>
              )}
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => {
                  setPollRequestId(null);
                  startMutation.mutate();
                }}
              >
                Chạy lại
              </button>
            </div>
          )}

          {req?.status === AiRequestStatus.FAILED && (
            <div className="bg-rose-50 text-rose-700 rounded-md p-3 text-sm">
              <div className="font-medium">AI trả lời thất bại</div>
              <div className="text-xs mt-1">Mã lỗi: {req.errorCode ?? 'AI_UNKNOWN'}</div>
              <button
                type="button"
                className="btn-secondary text-xs mt-2"
                onClick={() => {
                  setPollRequestId(null);
                  startMutation.mutate();
                }}
              >
                Thử lại
              </button>
            </div>
          )}

          {req?.status === AiRequestStatus.TIMED_OUT && (
            <div className="bg-amber-50 text-amber-700 rounded-md p-3 text-sm">
              <div className="font-medium">AI quá hạn</div>
              <div className="text-xs mt-1">Đã vượt quá thời gian cho phép. Có thể thử lại.</div>
              <button
                type="button"
                className="btn-secondary text-xs mt-2"
                onClick={() => {
                  setPollRequestId(null);
                  startMutation.mutate();
                }}
              >
                Thử lại
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500 mb-0.5">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function StatusIcon({ status }: { status?: AiRequestStatus }) {
  if (status === AiRequestStatus.SUCCEEDED) return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === AiRequestStatus.FAILED) return <XCircle className="h-4 w-4 text-rose-600" />;
  if (status === AiRequestStatus.TIMED_OUT) return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  if (status === AiRequestStatus.RUNNING || status === AiRequestStatus.QUEUED) {
    return <Loader2 className="h-4 w-4 animate-spin text-purple-600" />;
  }
  return <Clock className="h-4 w-4 text-slate-400" />;
}
