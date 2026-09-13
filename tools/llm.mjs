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
const DEFAULT_OPENROUTER_CLAUDE_MODEL = 'anthropic/claude-sonnet-4.5';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class ClaudeProvider extends LLMProvider {
  constructor({ model = process.env.MAYA_LLM_MODEL || 'claude-sonnet-5', maxTokens = 1024 } = {}) {
    super('claude');
    this.model = model;
    this.maxTokens = maxTokens;
    this.openrouterModel = process.env.CLAUDE_OPENROUTER_MODEL || DEFAULT_OPENROUTER_CLAUDE_MODEL;
  }

  isConfigured() {
    return !!(process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY);
  }

  /** Real status report, in the same shape as the base class's explain(). */
  async explain() {
    if (!this.isConfigured()) {
      return {
        source: `llm:${this.name}`,
        status: DATA_STATUSES.UNAVAILABLE,
        fetchedAt: new Date().toISOString(),
        text: null,
        error: 'Neither ANTHROPIC_API_KEY nor OPENROUTER_API_KEY is configured.'
      };
    }
    const host = process.env.ANTHROPIC_API_KEY ? 'Anthropic API' : `OpenRouter (${this.openrouterModel})`;
    return {
      source: `llm:${this.name}`,
      status: DATA_STATUSES.LIVE,
      fetchedAt: new Date().toISOString(),
      text: `Claude configured and ready via ${host}.`,
      error: null
    };
  }

  /**
   * @param {string} system - system prompt
   * @param {string} user - user message
   * @returns {Promise<string>} the model's plain-text reply
   */
  async generate(system, user) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;

    if (anthropicKey) {
      const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
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

    if (openrouterKey) {
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: user });

      const res = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openrouterKey}`
        },
        body: JSON.stringify({
          model: this.openrouterModel,
          max_tokens: this.maxTokens,
          messages
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(`Claude (OpenRouter) API error: ${data.error?.message || res.status}`);
      }
      return data.choices?.[0]?.message?.content || '';
    }

    throw new Error('Neither ANTHROPIC_API_KEY nor OPENROUTER_API_KEY is configured');
  }
}

export class GeminiProvider extends LLMProvider {
  constructor({ model = process.env.MAYA_GEMINI_MODEL || 'gemini-3.6-flash', maxTokens = 1024 } = {}) {
    super('gemini');
    this.model = model;
    this.maxTokens = maxTokens;
  }

  isConfigured() {
    return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  }

  async explain() {
    if (!this.isConfigured()) {
      return {
        source: `llm:${this.name}`,
        status: DATA_STATUSES.UNAVAILABLE,
        fetchedAt: new Date().toISOString(),
        text: null,
        error: 'GEMINI_API_KEY is not configured.'
      };
    }
    return {
      source: `llm:${this.name}`,
      status: DATA_STATUSES.LIVE,
      fetchedAt: new Date().toISOString(),
      text: `Gemini (${this.model}) configured and ready.`,
      error: null
    };
  }

  async generate(system, user) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: {
          maxOutputTokens: this.maxTokens,
        }
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Gemini API error: ${data.error?.message || res.status}`);
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
}

export function createDefaultLlmProvider() {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return new GeminiProvider();
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return new ClaudeProvider();
  }
  return new GeminiProvider();
}

