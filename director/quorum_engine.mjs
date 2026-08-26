// Iron Director — Quorum & Verification Engine
// Rejects fake consensus and enforces hard quorum boundaries across live AI providers.

export const QUORUM_STATES = Object.freeze({
  PENDING: 'PENDING',
  QUORUM_MET: 'QUORUM_MET',
  DEGRADED: 'DEGRADED',
  NO_QUORUM: 'NO_QUORUM'
});

export class QuorumEngine {
  constructor({ minLiveProviders = 2 } = {}) {
    this.minLiveProviders = minLiveProviders;
  }

  /**
   * Evaluates the multi-agent deliberation against strict quorum and verifier gates.
   */
  evaluate({ turns = [], verifierResult = { passed: true, errors: [] } } = {}) {
    // 1. Identify all distinct LIVE and SUCCESSFUL providers
    const successfulTurns = turns.filter(
      t => t.status === 'SUCCESS' && typeof t.message === 'string' && t.message.trim().length > 20
    );

    const successfulProviders = new Set(successfulTurns.map(t => t.speaker.toLowerCase()));
    const liveCount = successfulProviders.size;
    const failedTurns = turns.filter(t => t.status === 'FAILED');

    const result = {
      evaluatedAt: new Date().toISOString(),
      liveCount,
      minRequired: this.minLiveProviders,
      successfulProviders: Array.from(successfulProviders),
      failedProviders: failedTurns.map(t => ({ speaker: t.speaker, error: t.error })),
      verifierPassed: Boolean(verifierResult.passed),
      verifierErrors: verifierResult.errors || [],
      status: QUORUM_STATES.PENDING,
      verdict: '',
      reason: ''
    };

    // 2. Strict Quorum Decision Matrix
    if (liveCount >= this.minLiveProviders && result.verifierPassed) {
      result.status = QUORUM_STATES.QUORUM_MET;
      result.verdict = 'CONSENSUS_APPROVED';
      result.reason = `Quorum validated: ${liveCount} distinct live AI providers (${Array.from(successfulProviders).join(', ')}) + Deterministic Verifier Passed.`;
    } else if (liveCount === 1 && result.verifierPassed) {
      result.status = QUORUM_STATES.DEGRADED;
      result.verdict = 'DEGRADED_SINGLE_PROVIDER';
      result.reason = `Degraded state: Only 1 live AI provider (${Array.from(successfulProviders).join(', ')}) succeeded. Other providers offline: ${failedTurns.map(t => t.speaker).join(', ')}.`;
    } else {
      result.status = QUORUM_STATES.NO_QUORUM;
      result.verdict = 'QUORUM_REJECTED';
      if (!result.verifierPassed) {
        result.reason = `Quality Gate Rejected: Verifier errors [${result.verifierErrors.join('; ')}].`;
      } else {
        result.reason = `Zero Quorum: Insufficient live providers (got ${liveCount}, required ${this.minLiveProviders}). All provider calls failed.`;
      }
    }

    return result;
  }
}
