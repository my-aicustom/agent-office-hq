// Iron Director — Claude Provider Adapter (Deep Reasoning / Technical Copy)
// High token budget, structured output, and resilient retry handling.
// Supports native Anthropic API and transparent OpenRouter Claude bridge fallback.

import { BaseProvider } from './base_provider.mjs';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5';
const DEFAULT_OPENROUTER_CLAUDE_MODEL = 'anthropic/claude-sonnet-4.5';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class ClaudeProvider extends BaseProvider {
  constructor({
    apiKey = null,
    model = DEFAULT_CLAUDE_MODEL,
    openrouterApiKey = null,
    openrouterModel = DEFAULT_OPENROUTER_CLAUDE_MODEL,
    fetchFn = globalThis.fetch
  } = {}) {
    super('claude');
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.model = model;
    this.openrouterApiKey = openrouterApiKey || process.env.OPENROUTER_API_KEY || '';
    this.openrouterModel = openrouterModel || process.env.CLAUDE_OPENROUTER_MODEL || DEFAULT_OPENROUTER_CLAUDE_MODEL;
    this.fetchFn = fetchFn;
  }

  getAnthropicApiKey() {
    return this.apiKey || process.env.ANTHROPIC_API_KEY || '';
  }

  getOpenRouterApiKey() {
    return this.openrouterApiKey || process.env.OPENROUTER_API_KEY || '';
  }

  getApiKey() {
    return this.getAnthropicApiKey() || this.getOpenRouterApiKey();
  }

  isAvailable() {
    return Boolean(this.getApiKey());
  }

  async execute({ system = '', user = '', jsonMode = false, timeoutMs = 45000, maxOutputTokens = 400 } = {}) {
    const anthropicKey = this.getAnthropicApiKey();
    const openrouterKey = this.getOpenRouterApiKey();

    if (!anthropicKey && !openrouterKey) {
      throw new Error('Anthropic API key is not configured.');
    }

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      if (anthropicKey) {
        const res = await this.fetchFn(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
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
      }

      // OpenRouter Claude Bridge execution
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: user });

      const res = await this.fetchFn(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openrouterKey}`
        },
        body: JSON.stringify({
          model: this.openrouterModel,
          messages,
          temperature: 0.2,
          max_tokens: maxOutputTokens || 400,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
        }),
        signal: controller.signal
      });

      clearTimeout(timer);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(`Claude (OpenRouter) API error: ${data.error?.message || res.status}`);
      }

      const text = data.choices?.[0]?.message?.content || '';
      const latency = Date.now() - start;
      this.recordMetrics(latency, true);

      const promptTokens = data.usage?.prompt_tokens ?? data.usage?.input_tokens ?? 0;
      const completionTokens = data.usage?.completion_tokens ?? data.usage?.output_tokens ?? 0;

      return {
        provider: 'claude',
        model: data.model || this.openrouterModel,
        text,
        latencyMs: latency,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens
        },
        outboundEvidence: {
          verified: true,
          httpStatus: res.status,
          apiHost: 'openrouter.ai',
          requestId: data.id || null,
          upstreamProvider: data.provider || 'anthropic'
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
