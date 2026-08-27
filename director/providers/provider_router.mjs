// Iron Director — Multi-Provider Router & Cross-Model Failover Engine
// Dynamically selects the best available provider with Circuit Breaker awareness.

import { TASK_ROLES } from '../constants.mjs';
import { CircuitBreaker } from '../circuit_breaker.mjs';
import { GeminiProvider } from './gemini_provider.mjs';
import { ClaudeProvider } from './claude_provider.mjs';
import { CodexProvider } from './codex_provider.mjs';

const ROLE_PREFERENCES = {
  [TASK_ROLES.SCOUT]: ['gemini', 'claude', 'openrouter'],
  [TASK_ROLES.REASONER]: ['claude', 'gemini', 'openrouter'],
  [TASK_ROLES.INSPECTOR]: ['openrouter', 'claude', 'gemini'],
  [TASK_ROLES.SUPERVISOR]: ['gemini', 'claude', 'openrouter']
};

export class ProviderRouter {
  constructor({
    circuitBreaker = new CircuitBreaker(),
    geminiProvider = new GeminiProvider(),
    claudeProvider = new ClaudeProvider(),
    codexProvider = new CodexProvider()
  } = {}) {
    this.circuitBreaker = circuitBreaker;
    this.providers = new Map([
      ['gemini', geminiProvider],
      ['claude', claudeProvider],
      ['openrouter', codexProvider]
    ]);
  }

  /**
   * Routes prompt through prioritized providers with automatic Circuit Breaker failover.
   */
  async execute({
    role = TASK_ROLES.REASONER,
    system = '',
    user = '',
    preferredProvider = null,
    jsonMode = false,
    timeoutMs = 30000
  } = {}) {
    const defaultOrder = ROLE_PREFERENCES[role] || ['gemini', 'claude', 'openrouter'];
    const plan = preferredProvider
      ? [preferredProvider, ...defaultOrder.filter(p => p !== preferredProvider)]
      : defaultOrder;

    const routeTrail = [];
    let lastError = null;

    for (const providerName of plan) {
      const provider = this.providers.get(providerName);
      if (!provider || !provider.isAvailable()) {
        routeTrail.push({ provider: providerName, status: 'UNAVAILABLE' });
        continue;
      }

      if (!this.circuitBreaker.canExecute(providerName)) {
        routeTrail.push({ provider: providerName, status: 'CIRCUIT_OPEN' });
        continue;
      }

      try {
        routeTrail.push({ provider: providerName, status: 'ATTEMPTING' });
        const result = await provider.execute({ system, user, jsonMode, timeoutMs });

        this.circuitBreaker.recordSuccess(providerName);
        routeTrail[routeTrail.length - 1].status = 'SUCCESS';

        return {
          ...result,
          routeTrail
        };
      } catch (err) {
        lastError = err;
        this.circuitBreaker.recordFailure(providerName, err);
        routeTrail[routeTrail.length - 1].status = 'FAILED';
        routeTrail[routeTrail.length - 1].error = err.message;
        console.warn(`[ProviderRouter] Provider '${providerName}' failed: ${err.message}. Cascading to backup...`);
      }
    }

    const failureErr = new Error(
      `All providers in cascade failed. Trail: ${JSON.stringify(routeTrail)}. Last error: ${lastError?.message}`
    );
    failureErr.routeTrail = routeTrail;
    throw failureErr;
  }

  getTelemetry() {
    return {
      circuits: this.circuitBreaker.getSnapshot(),
      providers: Array.from(this.providers.entries()).map(([name, p]) => ({
        name,
        available: p.isAvailable(),
        metrics: p.getMetrics()
      }))
    };
  }
}
