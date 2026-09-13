import test from 'node:test';
import assert from 'node:assert/strict';

import { ClaudeProvider } from '../director/providers/claude_provider.mjs';

const validClaudeVote = JSON.stringify({
  decision: 'APPROVE',
  actionType: 'HTTP_HEALTH_CHECK',
  rationale: 'Claude Chief Architect approves the read-only inspection.',
  risks: ['Network latency'],
  acceptanceCriteria: ['HTTP status 200 returned']
});

test('ClaudeProvider executes via native Anthropic API when apiKey is provided', async () => {
  const calls = [];
  const provider = new ClaudeProvider({
    apiKey: 'sk-ant-test-key',
    model: 'claude-sonnet-5',
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'msg_test_anthropic_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: validClaudeVote }],
          model: 'claude-sonnet-5',
          usage: {
            input_tokens: 120,
            output_tokens: 45
          }
        })
      };
    }
  });

  assert.equal(provider.isAvailable(), true);
  const result = await provider.execute({ system: 'system prompt', user: 'user prompt' });

  assert.equal(result.provider, 'claude');
  assert.equal(result.model, 'claude-sonnet-5');
  assert.equal(result.text, validClaudeVote);
  assert.equal(result.usage.promptTokens, 120);
  assert.equal(result.usage.completionTokens, 45);
  assert.equal(result.usage.totalTokens, 165);
  assert.equal(result.outboundEvidence.apiHost, 'api.anthropic.com');
  assert.equal(result.outboundEvidence.requestId, 'msg_test_anthropic_123');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].options.headers['x-api-key'], 'sk-ant-test-key');
});

test('ClaudeProvider seamlessly falls back to OpenRouter Claude bridge when Anthropic key is absent', async () => {
  const calls = [];
  const provider = new ClaudeProvider({
    apiKey: '',
    openrouterApiKey: 'sk-or-test-key',
    openrouterModel: 'anthropic/claude-sonnet-4.5',
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'gen-test-openrouter-456',
          model: 'anthropic/claude-sonnet-4.5',
          provider: 'Amazon Bedrock',
          choices: [
            {
              message: {
                role: 'assistant',
                content: validClaudeVote
              }
            }
          ],
          usage: {
            prompt_tokens: 150,
            completion_tokens: 50
          }
        })
      };
    }
  });

  assert.equal(provider.isAvailable(), true);
  const result = await provider.execute({ system: 'system prompt', user: 'user prompt' });

  assert.equal(result.provider, 'claude');
  assert.equal(result.model, 'anthropic/claude-sonnet-4.5');
  assert.equal(result.text, validClaudeVote);
  assert.equal(result.usage.promptTokens, 150);
  assert.equal(result.usage.completionTokens, 50);
  assert.equal(result.usage.totalTokens, 200);
  assert.equal(result.outboundEvidence.apiHost, 'openrouter.ai');
  assert.equal(result.outboundEvidence.requestId, 'gen-test-openrouter-456');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(calls[0].options.headers['Authorization'], 'Bearer sk-or-test-key');
});

test('ClaudeProvider fails fast when neither Anthropic key nor OpenRouter key is configured', async () => {
  const provider = new ClaudeProvider({
    apiKey: '',
    openrouterApiKey: ''
  });

  assert.equal(provider.isAvailable(), false);
  await assert.rejects(
    async () => provider.execute({ system: 'system', user: 'user' }),
    /Anthropic API key is not configured/
  );
});
