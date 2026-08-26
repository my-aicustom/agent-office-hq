// Iron Director — Multi-Provider Circuit Breaker
// Protects the swarm from pounding failing LLMs and guarantees instant automatic failover.

import { CIRCUIT_STATE, DEFAULT_DIRECTOR_CONFIG } from './constants.mjs';

export class CircuitBreaker {
  constructor({
    threshold = DEFAULT_DIRECTOR_CONFIG.circuitBreakerThreshold,
    cooldownMs = DEFAULT_DIRECTOR_CONFIG.circuitBreakerCooldownMs
  } = {}) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.providers = new Map();
  }

  _getProviderState(providerName) {
    if (!this.providers.has(providerName)) {
      this.providers.set(providerName, {
        name: providerName,
        state: CIRCUIT_STATE.CLOSED,
        failureCount: 0,
        successCount: 0,
        lastFailure: null,
        lastSuccess: null,
        trippedAt: null,
        totalErrors: 0
      });
    }
    return this.providers.get(providerName);
  }

  /**
   * Evaluates if a provider is allowed to receive traffic.
   */
  canExecute(providerName) {
    const p = this._getProviderState(providerName);
    const now = Date.now();

    if (p.state === CIRCUIT_STATE.CLOSED) {
      return true;
    }

    if (p.state === CIRCUIT_STATE.OPEN) {
      if (p.trippedAt && now - p.trippedAt >= this.cooldownMs) {
        // Cooldown elapsed -> probe in HALF_OPEN state
        p.state = CIRCUIT_STATE.HALF_OPEN;
        return true;
      }
      return false;
    }

    if (p.state === CIRCUIT_STATE.HALF_OPEN) {
      // Allow single probe
      return true;
    }

    return false;
  }

  /**
   * Registers a successful request.
   */
  recordSuccess(providerName) {
    const p = this._getProviderState(providerName);
    p.lastSuccess = new Date().toISOString();
    p.successCount += 1;

    if (p.state === CIRCUIT_STATE.HALF_OPEN || p.failureCount > 0) {
      p.state = CIRCUIT_STATE.CLOSED;
      p.failureCount = 0;
      p.trippedAt = null;
    }
  }

  /**
   * Registers a failed request (e.g. 503, 429, timeout).
   */
  recordFailure(providerName, error) {
    const p = this._getProviderState(providerName);
    const errMsg = error?.message || String(error);
    p.lastFailure = {
      timestamp: new Date().toISOString(),
      error: errMsg
    };
    p.totalErrors += 1;
    p.failureCount += 1;

    if (p.state === CIRCUIT_STATE.HALF_OPEN || p.failureCount >= this.threshold) {
      p.state = CIRCUIT_STATE.OPEN;
      p.trippedAt = Date.now();
    }
  }

  /**
   * Manually resets a provider circuit.
   */
  reset(providerName) {
    const p = this._getProviderState(providerName);
    p.state = CIRCUIT_STATE.CLOSED;
    p.failureCount = 0;
    p.trippedAt = null;
  }

  /**
   * Returns a telemetry snapshot of all registered provider circuits.
   */
  getSnapshot() {
    const snapshot = {};
    for (const [name, state] of this.providers.entries()) {
      snapshot[name] = { ...state };
    }
    return snapshot;
  }
}
