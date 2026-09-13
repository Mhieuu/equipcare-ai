import type { AiTaskType } from '@equipcare/shared';

/**
 * AI Provider interface (Doc05 §10.1, plan §12.2 M4).
 *
 * Mỗi provider implement duy nhất 1 phương thức `analyze(input)` → trả
 * `AiProviderResult` (output JSON) hoặc throw `AiProviderError`.
 *
 * Quy ước:
 *   - Provider PHẢI respect `signal` (AbortSignal) để có thể bị timeout cancel.
 *   - Provider KHÔNG giữ transaction ngầm (Doc05 §10.1).
 *   - Provider KHÔNG log/audit API key (Doc05 §8.3).
 *   - Output shape tùy theo `taskType` (xem comment trong từng impl).
 *
 * Triển khai:
 *   - `MockAiProvider` (mặc định cho demo) — không cần API key.
 *   - `OpenAiProvider` (optional, gated by `AI_PROVIDER=openai` + `AI_API_KEY`).
 */
export interface AiProviderInput {
  taskType: AiTaskType;
  /** Snapshot ngữ cảnh đã lọc (Doc04 §5.8: không PII). */
  context: Record<string, unknown>;
  /** Hủy khi worker timeout / shutdown. */
  signal: AbortSignal;
}

export interface AiProviderResult {
  output: Record<string, unknown>;
  /** Model id (vd 'gpt-4o-mini-2024-07-18', 'mock-v1'). */
  modelName: string;
  /** Tổng tokens consumed (null nếu không track). */
  tokensUsed: number | null;
}

export class AiProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/** Nội bộ: signal đã abort trước khi provider kịp làm việc. */
export class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}

/**
 * Contract mọi AI provider phải implement.
 */
export interface AiProvider {
  /** Tên provider (cho audit `ai_requests.provider`). */
  readonly name: string;

  /**
   * Prompt version — nếu thay prompt logic phải bump version (Doc05 §10.1).
   * Format: `YYYY-MM-DD` hoặc semver `v1`, `v2`…
   */
  readonly promptVersion: string;

  /** Gọi AI. Throw AiProviderError(retryable=true) nếu lỗi transient (retry được). */
  analyze(input: AiProviderInput): Promise<AiProviderResult>;
}
