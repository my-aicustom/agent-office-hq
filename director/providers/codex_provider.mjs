// Iron Director — Codex Provider Adapter (Codebase Inspector, Patcher & AST Reviewer)
// Responsible for verifying generated code, AST integrity, and automated patch creation.

import { BaseProvider } from './base_provider.mjs';

export class CodexProvider extends BaseProvider {
  constructor({ apiKey = null, baseUrl = 'https://openrouter.ai/api/v1', model = 'openai/gpt-4o-mini', fetchFn = globalThis.fetch } = {}) {
    super('codex');
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '';
    this.baseUrl = baseUrl;
    this.model = model;
    this.fetchFn = fetchFn;
  }

  getApiKey() {
    return this.apiKey || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '';
  }

  isAvailable() {
    return Boolean(this.getApiKey());
  }

  async execute({ system = '', user = '', timeoutMs = 30000, maxOutputTokens = 300 } = {}) {
    const key = this.getApiKey();
    if (!key) {
      throw new Error('Codex / OpenRouter API key is not configured.');
    }

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: user });

      const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.2,
          max_tokens: maxOutputTokens || 300
        }),
        signal: controller.signal
      });

      clearTimeout(timer);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(`Codex API error: ${data.error?.message || res.status}`);
      }

      const text = data.choices?.[0]?.message?.content || '';
      const latency = Date.now() - start;
      this.recordMetrics(latency, true);

      return {
        provider: 'codex',
        model: this.model,
        text,
        latencyMs: latency,
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0
        },
        raw: data
      };
    } catch (err) {
      clearTimeout(timer);
      const latency = Date.now() - start;
      this.recordMetrics(latency, false);
      if (err.name === 'AbortError') {
        throw new Error(`Codex timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }
}
