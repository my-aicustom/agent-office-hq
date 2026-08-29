// Iron Director — Gemini Provider Adapter (Fast Triage / Scout)
// Supports multi-model Gemini 3+ cascade with exponential backoff.

import { BaseProvider } from './base_provider.mjs';

const CANDIDATE_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.7-flash'
];

function addUsage(total, current) {
  for (const key of ['promptTokens', 'completionTokens', 'visibleCompletionTokens', 'thinkingTokens', 'totalTokens']) {
    total[key] += Number(current[key] || 0);
  }
}

function interactionText(data) {
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  const stepText = steps
    .filter(step => step?.type === 'model_output')
    .flatMap(step => Array.isArray(step.content) ? step.content : [])
    .filter(item => item?.type === 'text' && typeof item.text === 'string')
    .map(item => item.text)
    .join('');
  if (stepText) return stepText;

  const outputs = Array.isArray(data?.outputs) ? data.outputs : [];
  return outputs
    .filter(item => item?.type === 'text' && typeof item.text === 'string')
    .map(item => item.text)
    .join('');
}

function normalizedUsage(data, fallback = {}) {
  const usage = data?.usage || data?.usageMetadata || {};
  const promptTokens = usage.prompt_tokens ?? usage.promptTokenCount ?? fallback.promptTokens ?? 0;
  const visibleCompletionTokens = usage.completion_tokens ?? usage.candidatesTokenCount ?? fallback.visibleCompletionTokens ?? 0;
  const thinkingTokens = usage.thoughts_tokens ?? usage.thoughtsTokenCount ?? fallback.thinkingTokens ?? 0;
  return {
    promptTokens,
    completionTokens: visibleCompletionTokens + thinkingTokens,
    visibleCompletionTokens,
    thinkingTokens,
    totalTokens: usage.total_tokens ?? usage.totalTokenCount ?? (promptTokens + visibleCompletionTokens + thinkingTokens)
  };
}

export class GeminiProvider extends BaseProvider {
  constructor({ apiKey = null, model = null, fetchFn = globalThis.fetch } = {}) {
    super('gemini');
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    this.preferredModel = model;
    this.fetchFn = fetchFn;
  }

  getApiKey() {
    return this.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  }

  isAvailable() {
    return Boolean(this.getApiKey());
  }

  async execute({
    system = '',
    user = '',
    jsonMode = false,
    jsonSchema = null,
    timeoutMs = 25000,
    maxOutputTokens = 1000
  } = {}) {
    const key = this.getApiKey();
    if (!key) {
      throw new Error('Gemini API key is not configured.');
    }

    const models = [
      this.preferredModel,
      ...CANDIDATE_MODELS
    ].filter((m, i, arr) => m && arr.indexOf(m) === i);

    const start = Date.now();
    let lastError = null;
    const aggregateUsage = normalizedUsage({});
    const outboundAttempts = [];

    for (const model of models) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const url = jsonMode
            ? 'https://generativelanguage.googleapis.com/v1beta/interactions'
            : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
          const bodyPayload = jsonMode ? {
            model,
            input: user,
            system_instruction: system || undefined,
            response_format: {
              type: 'text',
              mime_type: 'application/json',
              schema: jsonSchema || { type: 'object' }
            },
            generation_config: {
              max_output_tokens: maxOutputTokens || 1000,
              thinking_level: 'low'
            },
            store: false
          } : {
            system_instruction: system ? { parts: [{ text: system }] } : undefined,
            contents: [{ parts: [{ text: user }] }],
            generationConfig: {
              maxOutputTokens: maxOutputTokens || 1000
            }
          };

          const res = await this.fetchFn(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(jsonMode ? {
                'x-goog-api-key': key,
                'Api-Revision': '2026-05-20'
              } : {})
            },
            body: JSON.stringify(bodyPayload),
            signal: controller.signal
          });

          clearTimeout(timer);
          const data = await res.json();
          const attemptUsage = normalizedUsage(data);
          addUsage(aggregateUsage, attemptUsage);
          const attemptEvidence = {
            model,
            httpStatus: res.status,
            requestId: data.id || data.responseId || null,
            api: jsonMode ? 'interactions' : 'generateContent',
            status: data.status || (res.ok ? 'completed' : 'failed'),
            structuredOutputValid: false
          };
          outboundAttempts.push(attemptEvidence);

          if (res.ok) {
            const text = jsonMode
              ? interactionText(data)
              : data.candidates?.[0]?.content?.parts?.map(part => part?.text || '').join('') || '';
            if (jsonMode && data.status && data.status !== 'completed') {
              lastError = new Error(`Gemini (${model}) returned interaction status '${data.status}'.`);
              continue;
            }
            if (!text.trim()) {
              lastError = new Error(`Gemini (${model}) returned an empty response body.`);
              continue;
            }
            if (jsonMode) {
              try {
                JSON.parse(text);
              } catch (error) {
                lastError = new Error(`Gemini (${model}) returned malformed structured JSON: ${error.message}`);
                continue;
              }
            }
            attemptEvidence.structuredOutputValid = true;
            const latency = Date.now() - start;
            this.recordMetrics(latency, true);
            return {
              provider: 'gemini',
              model,
              text,
              latencyMs: latency,
              usage: aggregateUsage,
              outboundEvidence: {
                verified: true,
                httpStatus: res.status,
                apiHost: 'generativelanguage.googleapis.com',
                requestId: data.id || data.responseId || null,
                api: jsonMode ? 'interactions' : 'generateContent',
                attempts: outboundAttempts
              },
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
          }
          outboundAttempts.push({
            model,
            httpStatus: null,
            requestId: null,
            api: jsonMode ? 'interactions' : 'generateContent',
            status: err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
            structuredOutputValid: false
          });
          break;
        }
      }
    }

    const latency = Date.now() - start;
    this.recordMetrics(latency, false);
    const finalError = lastError || new Error('All Gemini models exhausted without success.');
    finalError.usage = aggregateUsage;
    finalError.outboundEvidence = {
      verified: false,
      apiHost: 'generativelanguage.googleapis.com',
      attempts: outboundAttempts
    };
    throw finalError;
  }
}
