import type { AiProvider } from './ai-provider.js';
import { MockAiProvider } from './mock-ai-provider.js';
import { GeminiAiProvider } from './gemini-ai-provider.js';

/**
 * Provider factory (Doc05 §10.1, plan §12.2 M4).
 *
 * Chọn provider dựa trên `AI_PROVIDER` env:
 *  - 'mock' (default) → MockAiProvider, không cần API key
 *  - 'gemini'         → GeminiAiProvider, yêu cầu GEMINI_API_KEY
 *
 * Provider khác (vd anthropic, openai) triển khai sau.
 */
export function createAiProvider(): AiProvider {
  const providerName = (process.env.AI_PROVIDER ?? 'mock').toLowerCase();
  switch (providerName) {
    case 'mock':
      return new MockAiProvider();
    case 'gemini':
      return new GeminiAiProvider();
    default:
      throw new Error(`AI provider '${providerName}' chưa được hỗ trợ. Có: mock, gemini`);
  }
}
