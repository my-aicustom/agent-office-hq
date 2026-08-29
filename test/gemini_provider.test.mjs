import test from 'node:test';
import assert from 'node:assert/strict';

import { GeminiProvider } from '../director/providers/gemini_provider.mjs';

const validVote = JSON.stringify({
  decision: 'APPROVE',
  actionType: 'HTTP_HEALTH_CHECK',
  rationale: 'The action is read-only and independently verifiable.',
  risks: ['Transient network failure'],
  acceptanceCriteria: ['The target returns HTTP 200.']
});

function interactionResponse(text, overrides = {}) {
  return {
    id: 'int_test_123',
    status: 'completed',
    steps: [{ type: 'model_output', content: [{ type: 'text', text }] }],
    usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
    ...overrides
  };
}

test('GeminiProvider uses the current Interactions API with a strict JSON schema', async () => {
  const calls = [];
  const provider = new GeminiProvider({
    apiKey: 'test-only',
    model: 'gemini-3.7-flash',
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => interactionResponse(validVote) };
    }
  });
  const schema = { type: 'object', properties: { decision: { type: 'string' } }, required: ['decision'] };
  const result = await provider.execute({ system: 'system', user: 'vote', jsonMode: true, jsonSchema: schema });

  assert.equal(result.provider, 'gemini');
  assert.equal(result.model, 'gemini-3.7-flash');
  assert.deepEqual(JSON.parse(result.text), JSON.parse(validVote));
  assert.equal(result.outboundEvidence.api, 'interactions');
  assert.equal(result.usage.totalTokens, 140);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'test-only');
  assert.equal(calls[0].options.headers['Api-Revision'], '2026-05-20');
  const request = JSON.parse(calls[0].options.body);
  assert.equal(request.model, 'gemini-3.7-flash');
  assert.deepEqual(request.response_format.schema, schema);
  assert.equal(request.response_format.mime_type, 'application/json');
});

test('GeminiProvider retries malformed structured JSON without counting it as success', async () => {
  let calls = 0;
  const provider = new GeminiProvider({
    apiKey: 'test-only',
    model: 'gemini-3.7-flash',
    fetchFn: async () => {
      calls += 1;
      const text = calls === 1 ? '{"decision":' : validVote;
      return { ok: true, status: 200, json: async () => interactionResponse(text) };
    }
  });
  const result = await provider.execute({ user: 'vote', jsonMode: true });
  assert.equal(calls, 2);
  assert.equal(JSON.parse(result.text).decision, 'APPROVE');
  assert.equal(result.usage.totalTokens, 280);
  assert.equal(result.outboundEvidence.attempts.length, 2);
  assert.equal(result.outboundEvidence.attempts[0].structuredOutputValid, false);
  assert.equal(result.outboundEvidence.attempts[1].structuredOutputValid, true);
  assert.equal(provider.getMetrics().successfulCalls, 1);
  assert.equal(provider.getMetrics().failedCalls, 0);
});

test('GeminiProvider rejects empty or incomplete structured responses after bounded retries', async () => {
  let calls = 0;
  const provider = new GeminiProvider({
    apiKey: 'test-only',
    model: 'gemini-3.7-flash',
    fetchFn: async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => interactionResponse('', { status: 'incomplete' }) };
    }
  });
  await assert.rejects(provider.execute({ user: 'vote', jsonMode: true }), error => {
    assert.match(error.message, /status 'incomplete'|empty response/i);
    assert.equal(error.usage.totalTokens, 560);
    assert.equal(error.outboundEvidence.attempts.length, 4);
    return true;
  });
  assert.equal(calls, 4);
  assert.equal(provider.getMetrics().successfulCalls, 0);
  assert.equal(provider.getMetrics().failedCalls, 1);
});
