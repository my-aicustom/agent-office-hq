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
  evaluate({ turns = [], verifierResult = { passed: false, errors: ['Verifier was not run.'] } } = {}) {
    // A live provider requires successful outbound HTTP evidence and provider-reported tokens.
    const successfulTurns = turns.filter(t =>
      t.status === 'SUCCESS' &&
      t.providerKey &&
      t.outboundEvidence?.verified === true &&
      t.outboundEvidence.httpStatus >= 200 &&
      t.outboundEvidence.httpStatus < 300 &&
      t.usage?.totalTokens > 0
    );

    const successfulProviders = new Set(successfulTurns.map(t => t.providerKey.toLowerCase()));
    const approvedProviders = new Set(verifierResult.approvedProviders || []);
    const liveCount = successfulProviders.size;
    const approvalCount = approvedProviders.size;
    const failedTurns = turns.filter(t => t.status === 'FAILED');

    const result = {
      evaluatedAt: new Date().toISOString(),
      liveCount,
      minRequired: this.minLiveProviders,
      successfulProviders: Array.from(successfulProviders),
      approvedProviders: Array.from(approvedProviders),
      approvalCount,
      failedProviders: failedTurns.map(t => ({ speaker: t.speaker, error: t.error })),
      verifierPassed: Boolean(verifierResult.passed),
      verifierErrors: verifierResult.errors || [],
      status: QUORUM_STATES.PENDING,
      verdict: '',
      reason: ''
    };

    // 2. Strict Quorum Decision Matrix
    if (liveCount >= this.minLiveProviders && approvalCount >= this.minLiveProviders && result.verifierPassed) {
      result.status = QUORUM_STATES.QUORUM_MET;
      result.verdict = 'ACTION_APPROVED';
      result.reason = `${approvalCount} independent outbound providers approved the exact action '${verifierResult.requiredActionType}'.`;
    } else if (liveCount === 1 && result.verifierPassed) {
      result.status = QUORUM_STATES.DEGRADED;
      result.verdict = 'DEGRADED_NO_AUTOMATION';
      result.reason = `Only 1 verified live provider (${Array.from(successfulProviders).join(', ')}) responded. Automatic execution is forbidden.`;
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
