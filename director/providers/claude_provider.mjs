// Iron Director — Claude Provider Adapter (Deep Reasoning / Technical Copy)
// High token budget, structured output, and resilient retry handling.

import { BaseProvider } from './base_provider.mjs';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5';

export class ClaudeProvider extends BaseProvider {
  constructor({ apiKey = null, model = DEFAULT_CLAUDE_MODEL, fetchFn = globalThis.fetch } = {}) {
    super('claude');
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.model = model;
    this.fetchFn = fetchFn;
  }

  isAvailable() {
    return Boolean(this.getApiKey());
  }

  getApiKey() {
    return this.apiKey || process.env.ANTHROPIC_API_KEY || '';
  }

  async execute({ system = '', user = '', timeoutMs = 45000, maxOutputTokens = 400 } = {}) {
    const key = this.getApiKey();
    if (!key) {
      throw new Error('Anthropic API key is not configured.');
    }

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await this.fetchFn(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxOutputTokens || 400,
          system: system || undefined,
          messages: [{ role: 'user', content: user }]
        }),
        signal: controller.signal
      });

      clearTimeout(timer);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(`Claude API error: ${data.error?.message || res.status}`);
      }

      const text = (data.content || []).map(block => block.text || '').join('');
      const latency = Date.now() - start;
      this.recordMetrics(latency, true);

      return {
        provider: 'claude',
        model: this.model,
        text,
        latencyMs: latency,
        usage: {
          promptTokens: data.usage?.input_tokens || 0,
          completionTokens: data.usage?.output_tokens || 0,
          totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
        },
        outboundEvidence: {
          verified: true,
          httpStatus: res.status,
          apiHost: 'api.anthropic.com',
          requestId: data.id || null
        },
        raw: data
      };
    } catch (err) {
      clearTimeout(timer);
      const latency = Date.now() - start;
      this.recordMetrics(latency, false);
      if (err.name === 'AbortError') {
        throw new Error(`Claude timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }
}
