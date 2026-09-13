import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AppError,
  createAiProvider,
  AiProvider,
  AbortError,
  AiProviderError,
  writeAudit,
} from '@equipcare/backend-core';
import {
  AiRequestStatus,
  AiTaskType,
} from '@equipcare/shared';
import type { Prisma } from '@prisma/client';

/**
 * AI Service (Doc02 §FR-AI-01..06 + Doc05 §10.1, plan §12.2 M4).
 *
 * Hỗ trợ 2 task types ở M4:
 *   - INCIDENT_TRIAGE — POST /ai/incidents/:id/analyze
 *   - ASSET_SUMMARY   — chưa expose HTTP ở M4 (M5+)
 *
 * Async contract (Doc05 §10.1):
 *   - POST analyze() → insert ai_requests (status=QUEUED) → start in-process
 *     worker ngay → return { requestId } với HTTP 202.
 *   - FE poll GET /ai/requests/:id để biết status + output.
 *   - Mock provider bật theo env AI_PROVIDER=mock (default).
 *
 * Resilience (Doc02 §FR-AI-04/05 + Doc05 §10.1):
 *   - Timeout (default 45s) → TIMED_OUT, retryable backoff (default 2 retries).
 *   - Provider lỗi non-retryable → FAILED ngay.
 *   - Mọi lỗi KHÔNG throw lên caller (đã trả 202, request nằm DB).
 */
@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private readonly provider: AiProvider;

  // Tunables từ system_settings (Doc04 §3.7). Default fallback nếu row chưa có.
  private timeoutMs = 45_000;
  private maxRetries = 2;

  constructor(private readonly prisma: PrismaService) {
    this.provider = createAiProvider();
    this.logger.log(`AI provider initialized: ${this.provider.name}@${this.provider.promptVersion}`);
  }

  async onModuleInit() {
    // Load tunables một lần lúc boot. Sau đó các request dùng cached value;
    // (M5+ có thể hot-reload khi update system_settings).
    await this.loadSettings();
  }

  private async loadSettings() {
    const rows = await this.prisma.system_settings.findMany({
      where: { key: { in: ['ai.timeout_ms', 'ai.max_retries'] } },
    });
    for (const row of rows) {
      if (row.key === 'ai.timeout_ms') {
        const n = Number(row.value);
        if (Number.isFinite(n) && n > 0) this.timeoutMs = n;
      } else if (row.key === 'ai.max_retries') {
        const n = Number(row.value);
        if (Number.isFinite(n) && n >= 0) this.maxRetries = n;
      }
    }
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Submit AI request. Trả về requestId (FE poll).
   * IMPORTANT: phương thức này KHÔNG await worker → caller nhận 202 ngay.
   */
  async submitIncidentTriage(actorId: string, incidentId: string) {
    const incident = await this.prisma.incidents.findUnique({
      where: { id: incidentId },
      include: {
        asset: {
          select: {
            id: true,
            code: true,
            name: true,
            asset_type: { select: { code: true, name: true } },
          },
        },
      },
    });
    if (!incident) {
      throw AppError.notFound('Không tìm thấy sự cố', { incidentId });
    }

    // Snapshot ngữ cảnh đã lọc (Doc05 §10.1: không PII, không mô tả dài).
    // Cắt description xuống 500 ký tự để giảm PII risk.
    const inputSnapshot: Prisma.InputJsonValue = {
      incidentCode: incident.code,
      assetCode: incident.asset.code,
      assetName: incident.asset.name,
      assetTypeCode: incident.asset.asset_type?.code ?? null,
      description: incident.description.slice(0, 500),
      impactDescription: incident.impact_description.slice(0, 500),
      priorityCode: incident.priority_code,
    };

    const created = await this.prisma.ai_requests.create({
      data: {
        requested_by: actorId,
        asset_id: incident.asset_id,
        incident_id: incidentId,
        task_type: AiTaskType.INCIDENT_TRIAGE,
        provider: this.provider.name,
        model_name: 'pending',
        prompt_version: this.provider.promptVersion,
        input_snapshot: inputSnapshot,
        status: AiRequestStatus.QUEUED,
      },
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'ai.request.create',
      objectType: 'ai_requests',
      objectKey: created.id,
      correlationKey: created.id,
      newValue: {
        taskType: AiTaskType.INCIDENT_TRIAGE,
        incidentId,
        provider: this.provider.name,
      },
    });

    // Kick worker in-process (không await).
    void this.processInBackground(created.id);

    return { requestId: created.id, status: AiRequestStatus.QUEUED };
  }

  /** FE poll trạng thái + output. */
  async getRequest(id: string, actorId: string) {
    const req = await this.prisma.ai_requests.findUnique({ where: { id } });
    if (!req) {
      throw AppError.notFound('Không tìm thấy yêu cầu AI', { id });
    }
    // Owner check: chỉ người yêu cầu (hoặc admin) mới poll được.
    // (M5+ thêm ADMIN bypass; giờ đơn giản so req.requested_by === actor.)
    if (req.requested_by !== actorId) {
      throw AppError.forbidden('Bạn không có quyền xem yêu cầu này', { id });
    }
    return {
      id: req.id,
      status: req.status,
      provider: req.provider,
      modelName: req.model_name,
      promptVersion: req.prompt_version,
      output: req.output_payload,
      errorCode: req.error_code,
      finishedAt: req.finished_at?.toISOString() ?? null,
      createdAt: req.created_at.toISOString(),
    };
  }

  // ===========================================================================
  // Worker (in-process)
  // ===========================================================================

  /**
   * Process 1 request. Pipeline:
   *   QUEUED → RUNNING → (SUCCEEDED | FAILED | TIMED_OUT).
   * Retry: tối đa maxRetries lần với exponential backoff (1s, 2s, 4s...).
   */
  private async processInBackground(requestId: string): Promise<void> {
    // Update → RUNNING
    await this.prisma.ai_requests.update({
      where: { id: requestId },
      data: { status: AiRequestStatus.RUNNING, model_name: this.provider.name },
    });

    let attempt = 0;
    let lastError: AiProviderError | null = null;
    while (attempt <= this.maxRetries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const req = await this.prisma.ai_requests.findUnique({ where: { id: requestId } });
        if (!req) {
          clearTimeout(timer);
          return;
        }

        const result = await this.provider.analyze({
          taskType: req.task_type as AiTaskType,
          context: req.input_snapshot as Record<string, unknown>,
          signal: controller.signal,
        });

        clearTimeout(timer);

        await this.prisma.ai_requests.update({
          where: { id: requestId },
          data: {
            status: AiRequestStatus.SUCCEEDED,
            model_name: result.modelName,
            output_payload: result.output as Prisma.InputJsonValue,
            finished_at: new Date(),
            row_version: { increment: 1 },
          },
        });

        this.logger.log(`ai_requests ${requestId} SUCCEEDED (attempts=${attempt})`);
        return;
      } catch (err) {
        clearTimeout(timer);
        const isAbort = err instanceof AbortError;
        if (isAbort) {
          lastError = new AiProviderError('AI_TIMEOUT', `Timeout after ${this.timeoutMs}ms`, true);
        } else if (err instanceof AiProviderError) {
          lastError = err;
        } else {
          lastError = new AiProviderError(
            'AI_PROVIDER_UNEXPECTED',
            (err as Error).message,
            true,
            err,
          );
        }

        this.logger.warn(
          `ai_requests ${requestId} attempt ${attempt + 1}/${this.maxRetries + 1} failed: ${lastError.code}`,
        );

        if (!lastError.retryable || attempt === this.maxRetries) break;
        attempt += 1;
        // Backoff exponential: 1s, 2s, 4s (cap 8s).
        const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }

    // Final failure path
    const finalStatus = lastError?.code === 'AI_TIMEOUT'
      ? AiRequestStatus.TIMED_OUT
      : AiRequestStatus.FAILED;

    await this.prisma.ai_requests.update({
      where: { id: requestId },
      data: {
        status: finalStatus,
        error_code: lastError?.code ?? 'AI_UNKNOWN',
        finished_at: new Date(),
        row_version: { increment: 1 },
      },
    });
    this.logger.warn(`ai_requests ${requestId} final=${finalStatus} code=${lastError?.code}`);
  }
}
