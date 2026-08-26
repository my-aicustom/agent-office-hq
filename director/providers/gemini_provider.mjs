// Iron Director — Gemini Provider Adapter (Fast Triage / Scout)
// Supports multi-model Gemini 3+ cascade with exponential backoff.

import { BaseProvider } from './base_provider.mjs';

const CANDIDATE_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest'
];

export class GeminiProvider extends BaseProvider {
  constructor({ apiKey = null, model = null, fetchFn = globalThis.fetch } = {}) {
    super('gemini');
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    this.preferredModel = model;
    this.fetchFn = fetchFn;
  }

  isAvailable() {
    return Boolean(this.apiKey);
  }

  async execute({ system = '', user = '', jsonMode = false, timeoutMs = 25000 } = {}) {
    if (!this.isAvailable()) {
      throw new Error('Gemini API key is not configured.');
    }

    const models = [
      this.preferredModel,
      ...CANDIDATE_MODELS
    ].filter((m, i, arr) => m && arr.indexOf(m) === i);

    const start = Date.now();
    let lastError = null;

    for (const model of models) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
          const bodyPayload = {
            system_instruction: system ? { parts: [{ text: system }] } : undefined,
            contents: [{ parts: [{ text: user }] }],
            generationConfig: {
              temperature: 0.4
            }
          };

          if (jsonMode) {
            bodyPayload.generationConfig.responseMimeType = 'application/json';
          }

          const res = await this.fetchFn(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload),
            signal: controller.signal
          });

          clearTimeout(timer);
          const data = await res.json();

          if (res.ok) {
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const latency = Date.now() - start;
            this.recordMetrics(latency, true);
            return {
              provider: 'gemini',
              model,
              text,
              latencyMs: latency,
              raw: data
            };
          }

          const errMsg = data.error?.message || `HTTP ${res.status}`;
          lastError = new Error(`Gemini (${model}) attempt ${attempt} error: ${errMsg}`);

          if (res.status === 404) {
            // Model not found, skip immediately to next model
            break;
          }

          const isRetryable = res.status === 429 || res.status >= 500 || /demand|spike|quota|overloaded/i.test(errMsg);
          if (isRetryable && attempt < 2) {
            await new Promise(r => setTimeout(r, 1000 * attempt));
            continue;
          }
          break;
        } catch (err) {
          clearTimeout(timer);
          lastError = err;
          if (err.name === 'AbortError') {
            lastError = new Error(`Gemini (${model}) timed out after ${timeoutMs}ms`);
            break;
          }
        }
      }
    }

    const latency = Date.now() - start;
    this.recordMetrics(latency, false);
    throw lastError || new Error('All Gemini models exhausted without success.');
  }
}
