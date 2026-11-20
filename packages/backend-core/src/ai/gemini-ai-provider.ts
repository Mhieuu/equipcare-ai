import type { AiProvider, AiProviderInput, AiProviderResult } from './ai-provider.js';
import { AbortError, AiProviderError } from './ai-provider.js';

/**
 * GeminiAiProvider — gọi Google Gemini REST API thật (Doc05 §10.1).
 *
 * Bật bằng env:
 *   AI_PROVIDER=gemini
 *   GEMINI_API_KEY=<key>           (bắt buộc, KHÔNG log/audit — Doc05 §8.3)
 *   GEMINI_MODEL=gemini-2.0-flash  (optional)
 *
 * Output shape giữ nguyên contract như MockAiProvider để FE không đổi:
 *   - INCIDENT_TRIAGE → { priority, category, summary, confidence, reasoning, recommendedActions }
 *   - ASSET_SUMMARY   → { summary, recentIncidents, openWorkOrders }
 *
 * Respect AbortSignal: AiService cancel khi quá AI_REQUEST_TIMEOUT_MS.
 * Không thêm dependency mới — dùng fetch có sẵn của Node 22.
 */
export class GeminiAiProvider implements AiProvider {
  readonly name = 'gemini';
  readonly promptVersion = 'v1';

  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    const key = (process.env.GEMINI_API_KEY ?? '').trim();
    if (!key) {
      throw new Error('AI_PROVIDER=gemini yêu cầu GEMINI_API_KEY trong environment.');
    }
    this.apiKey = key;
    this.model = (process.env.GEMINI_MODEL ?? '').trim() || 'gemini-3.5-flash-lite';
  }

  async analyze(input: AiProviderInput): Promise<AiProviderResult> {
    if (input.signal.aborted) {
      throw new AbortError('Aborted');
    }
    const prompt = this.buildPrompt(input.taskType, input.context);
    const { text, tokensUsed } = await this.callGemini(prompt, input.signal);

    switch (input.taskType) {
      case 'INCIDENT_TRIAGE':
        return {
          output: this.parseTriage(text, input.context),
          modelName: this.model,
          tokensUsed,
        };
      case 'ASSET_SUMMARY':
        return {
          output: this.parseAssetSummary(text, input.context),
          modelName: this.model,
          tokensUsed,
        };
      default:
        return {
          output: { ok: true, hint: 'gemini-other', text: text.slice(0, 2000) },
          modelName: this.model,
          tokensUsed,
        };
    }
  }

  // ------------------------------------------------------------------
  private buildPrompt(taskType: string, context: Record<string, unknown>): string {
    const ctx = JSON.stringify(context, null, 2);
    if (taskType === 'INCIDENT_TRIAGE') {
      return [
        'Bạn là trợ lý phân loại sự cố bảo trì thiết bị công nghiệp.',
        'Dựa trên JSON ngữ cảnh dưới đây, trả lời DUY NHẤT một JSON object (không markdown, không giải thích ngoài JSON) với đúng schema:',
        '{ "priority": "LOW|MEDIUM|HIGH|CRITICAL", "category": "ELECTRICAL|MECHANICAL|HYDRAULIC|OTHER", "summary": "tóm tắt tiếng Việt 1-2 câu", "confidence": 0.0-1.0, "reasoning": "lý do tiếng Việt 1-3 câu", "recommendedActions": ["việc 1", "việc 2"] }',
        'Ngữ cảnh:',
        ctx,
      ].join('\n');
    }
    if (taskType === 'ASSET_SUMMARY') {
      return [
        'Bạn là trợ lý tóm tắt tình trạng thiết bị công nghiệp.',
        'Dựa trên JSON ngữ cảnh dưới đây (gồm số sự cố 90 ngày, sự cố nghiêm trọng, phiếu đang mở, chi phí), trả lời DUY NHẤT một JSON object với schema:',
        '{ "summary": "tóm tắt tiếng Việt 2-3 câu", "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL", "confidence": 0.0-1.0, "reasoning": "lý do đánh giá rủi ro 1-2 câu", "recommendedActions": ["việc 1", "việc 2"] }',
        'Ngữ cảnh:',
        ctx,
      ].join('\n');
    }
    return `Trả lời ngắn gọn cho ngữ cảnh sau (JSON):\n${ctx}`;
  }

  private async callGemini(
    prompt: string,
    signal: AbortSignal,
  ): Promise<{ text: string; tokensUsed: number | null }> {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}` +
      `:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
        signal,
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new AbortError('Aborted');
      }
      throw new AiProviderError(
        'AI_NETWORK',
        `Không gọi được Gemini API: ${(err as Error).message}`,
        true,
        err,
      );
    }

    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      const body = await res.text().catch(() => '');
      throw new AiProviderError(
        'AI_GEMINI_HTTP',
        `Gemini API trả HTTP ${res.status}: ${body.slice(0, 300)}`,
        retryable,
      );
    }

    let data: {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { totalTokenCount?: number };
    };
    try {
      data = (await res.json()) as typeof data;
    } catch (err) {
      throw new AiProviderError('AI_BAD_RESPONSE', 'Gemini trả body không phải JSON', true, err);
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => String(p?.text ?? '')).join('') ?? '';
    if (!text.trim()) {
      throw new AiProviderError('AI_EMPTY_RESPONSE', 'Gemini trả về rỗng', true);
    }
    const tokensUsed =
      typeof data?.usageMetadata?.totalTokenCount === 'number'
        ? data.usageMetadata.totalTokenCount
        : null;
    return { text, tokensUsed };
  }

  private parseTriage(text: string, context: Record<string, unknown>): Record<string, unknown> {
    const parsed = this.parseJsonObject(text);
    const actions = Array.isArray(parsed.recommendedActions)
      ? parsed.recommendedActions
          .map((a) => String(a))
          .filter(Boolean)
          .slice(0, 5)
      : [];
    return {
      priority: normalizePriority(parsed.priority),
      category: normalizeCategory(parsed.category),
      summary: String(parsed.summary ?? '').slice(0, 500) || 'AI đã phân tích sự cố.',
      confidence: clampConfidence(parsed.confidence),
      reasoning: String(parsed.reasoning ?? '').slice(0, 1000),
      recommendedActions: actions,
      assetCode: context.assetCode ?? null,
    };
  }

  private parseAssetSummary(
    text: string,
    context: Record<string, unknown>,
  ): Record<string, unknown> {
    const parsed = this.parseJsonObject(text);
    const actions = Array.isArray(parsed.recommendedActions)
      ? parsed.recommendedActions.map((a) => String(a)).filter(Boolean).slice(0, 5)
      : [];
    const risk = String(parsed.riskLevel ?? '').toUpperCase();
    return {
      summary: String(parsed.summary ?? text).slice(0, 1000),
      riskLevel: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(risk) ? risk : 'MEDIUM',
      confidence: clampConfidence(parsed.confidence),
      reasoning: String(parsed.reasoning ?? '').slice(0, 1000),
      recommendedActions: actions,
      recentIncidents: Number(context.recentIncidents ?? 0),
      openWorkOrders: Number(context.openWorkOrders ?? 0),
    };
  }

  private parseJsonObject(text: string): Record<string, unknown> {
    const cleaned = text
      .replace(/^```(?:json)?/i, '')
      .replace(/```\s*$/, '')
      .trim();
    try {
      const v: unknown = JSON.parse(cleaned);
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return v as Record<string, unknown>;
      }
    } catch {
      // fall through → throw AiProviderError bên dưới
    }
    throw new AiProviderError('AI_BAD_RESPONSE', 'Gemini không trả JSON đúng schema', true);
  }
}

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const CATEGORIES = ['ELECTRICAL', 'MECHANICAL', 'HYDRAULIC', 'OTHER'] as const;

function normalizePriority(v: unknown): (typeof PRIORITIES)[number] {
  const s = String(v ?? '').toUpperCase();
  return (PRIORITIES as readonly string[]).includes(s)
    ? (s as (typeof PRIORITIES)[number])
    : 'MEDIUM';
}

function normalizeCategory(v: unknown): (typeof CATEGORIES)[number] {
  const s = String(v ?? '').toUpperCase();
  return (CATEGORIES as readonly string[]).includes(s)
    ? (s as (typeof CATEGORIES)[number])
    : 'OTHER';
}

function clampConfidence(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}
