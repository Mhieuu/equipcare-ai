import type { AiProvider } from './ai-provider.js';
import { MockAiProvider } from './mock-ai-provider.js';

/**
 * Provider factory (Doc05 §10.1, plan §12.2 M4).
 *
 * Chọn provider dựa trên `AI_PROVIDER` env:
 *  - 'mock' (default) → MockAiProvider, không cần API key
 *  - 'openai'         → yêu cầu AI_API_KEY; throw nếu thiếu
 *
 * Provider khác (vd anthropic, gemini) triển khai sau.
 */
export function createAiProvider(): AiProvider {
  const providerName = (process.env.AI_PROVIDER ?? 'mock').toLowerCase();
  switch (providerName) {
    case 'mock':
      return new MockAiProvider();
    // case 'openai':
    //   return new OpenAiProvider();  // tương lai (M10 hardening)
    default:
      throw new Error(
        `AI provider '${providerName}' chưa được hỗ trợ. Có: mock`,
      );
  }
}
