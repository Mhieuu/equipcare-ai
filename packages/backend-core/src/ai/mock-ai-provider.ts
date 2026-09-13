import type {
  AiProvider,
  AiProviderInput,
  AiProviderResult,
} from './ai-provider.js';
import { AbortError } from './ai-provider.js';

/**
 * MockAiProvider — provider mặc định cho demo + local dev (Doc05 §10.1).
 *
 * Không gọi mạng. Tạo output dựa trên context (heuristic đơn giản).
 * Logic:
 *   - `INCIDENT_TRIAGE`: trả priority gợi ý + category + summary
 *     dựa trên từ khóa trong description / impact.
 *   - `ASSET_SUMMARY`: trả tóm tắt ngắn từ asset_type + recent incidents.
 *   - `OTHER`: trả { ok: true, hint: 'mock' }.
 *
 * Random thời gian xử lý 100-300ms để giả lập latency.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  readonly promptVersion = 'v1';

  async analyze(input: AiProviderInput): Promise<AiProviderResult> {
    const { taskType, context, signal } = input;

    // Bỏ qua AbortSignal throw nếu đã cancel trước khi start.
    if (signal.aborted) {
      throw new AbortError('Aborted');
    }

    // Latency mô phỏng (100-300ms) trừ khi cancelled.
    const latency = 100 + Math.floor(Math.random() * 200);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => resolve(), latency);
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new AbortError('Aborted'));
      });
    });

    switch (taskType) {
      case 'INCIDENT_TRIAGE':
        return this.handleIncidentTriage(context);
      case 'ASSET_SUMMARY':
        return this.handleAssetSummary(context);
      default:
        return {
          output: { ok: true, hint: 'mock-other', contextKeys: Object.keys(context) },
          modelName: 'mock-v1',
          tokensUsed: null,
        };
    }
  }

  private handleIncidentTriage(context: Record<string, unknown>): AiProviderResult {
    const description = String(context.description ?? '').toLowerCase();
    const impact = String(context.impactDescription ?? '').toLowerCase();

    // Heuristic ưu tiên: càng có từ "nguy hiểm"/"cháy"/"rò rỉ" → ưu tiên càng cao.
    const criticalWords = ['cháy', 'rò rỉ', 'nguy hiểm', 'mất điện', 'khói'];
    const highWords = ['hỏng', 'lỗi', 'kẹt', 'không hoạt động'];
    const lowWords = ['rung', 'ồn', 'hơi nóng'];

    let priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM';
    if (criticalWords.some((w) => description.includes(w) || impact.includes(w))) {
      priority = 'CRITICAL';
    } else if (highWords.some((w) => description.includes(w))) {
      priority = 'HIGH';
    } else if (lowWords.some((w) => description.includes(w))) {
      priority = 'LOW';
    }

    // Category guess đơn giản.
    let category = 'OTHER';
    if (/điện|nguồn|cáp|motor/.test(description)) category = 'ELECTRICAL';
    else if (/cơ khí|bơm|van|bạc đạn/.test(description)) category = 'MECHANICAL';
    else if (/nước|dầu|rò/.test(description)) category = 'HYDRAULIC';

    return {
      output: {
        priority,
        category,
        summary: `Mock AI: ${description.slice(0, 80)}`,
        confidence: 0.42, // mock thấp để UX thấy rõ nó mock
        reasoning: 'Phân loại dựa trên heuristic từ khóa; không phải LLM thật.',
      },
      modelName: 'mock-v1',
      tokensUsed: 0,
    };
  }

  private handleAssetSummary(context: Record<string, unknown>): AiProviderResult {
    const assetCode = String(context.assetCode ?? 'unknown');
    return {
      output: {
        summary: `Mock summary for ${assetCode}: asset hoạt động bình thường.`,
        recentIncidents: Number(context.recentIncidents ?? 0),
        openWorkOrders: Number(context.openWorkOrders ?? 0),
      },
      modelName: 'mock-v1',
      tokensUsed: 0,
    };
  }
}
