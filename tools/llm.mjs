import { DATA_STATUSES } from '../agents/nadia/constants.mjs';

export class LLMProvider {
  constructor(name = 'none') {
    this.name = name;
  }

  async explain() {
    return {
      source: `llm:${this.name}`,
      status: DATA_STATUSES.UNAVAILABLE,
      fetchedAt: new Date().toISOString(),
      text: null,
      error: 'No LLM provider is configured; deterministic reasoning is active.'
    };
  }
}

// Real Claude-backed provider. Used by Maya (agent_brain.mjs) for the
// interrogation console. Deliberately NOT wired into Nadia — her opportunity
// scoring stays fully deterministic by design (see README "Nadia v1"); she
// only ever instantiates the base LLMProvider above to honestly report that
// no LLM is in her reasoning path.
//
// Plain fetch, no SDK, matching this repo's zero-dependency convention.
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export class ClaudeProvider extends LLMProvider {
  constructor({ model = process.env.MAYA_LLM_MODEL || 'claude-sonnet-5', maxTokens = 1024 } = {}) {
    super('claude');
    this.model = model;
    this.maxTokens = maxTokens;
  }

  isConfigured() {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  /** Real status report, in the same shape as the base class's explain(). */
  async explain() {
    if (!this.isConfigured()) {
      return {
        source: `llm:${this.name}`,
        status: DATA_STATUSES.UNAVAILABLE,
        fetchedAt: new Date().toISOString(),
        text: null,
        error: 'ANTHROPIC_API_KEY is not configured.'
      };
    }
    return {
      source: `llm:${this.name}`,
      status: DATA_STATUSES.LIVE,
      fetchedAt: new Date().toISOString(),
      text: `Claude (${this.model}) configured and ready.`,
      error: null
    };
  }

  /**
   * @param {string} system - system prompt
   * @param {string} user - user message
   * @returns {Promise<string>} the model's plain-text reply
   */
  async generate(system, user) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system,
        messages: [{ role: 'user', content: user }]
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Claude API error: ${data.error?.message || res.status}`);
    }
    return (data.content || []).map(block => block.text || '').join('');
  }
}

