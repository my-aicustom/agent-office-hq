// Iron Director — Durable Case Packet
// Comprehensive, immutable audit packet for incident resolution & multi-AI consensus.

import { PersistentDedup } from './persistent_dedup.mjs';
import { CostCalculator } from './cost_calculator.mjs';

export class CasePacket {
  constructor({
    caseId,
    title,
    type,
    severity = 'HIGH',
    source = 'sentry',
    rawError = null,
    metadata = {},
    budgetMaxTokens = 2500,
    budgetMaxCostIdr = 500
  } = {}) {
    this.caseId = caseId || `case-${Date.now()}`;
    this.title = title || 'Untitled Incident';
    this.type = type || 'INCIDENT:UNKNOWN';
    this.severity = severity;
    this.source = source;
    this.rawError = rawError;
    this.metadata = metadata;

    // Deterministic Canonical Fingerprint
    this.fingerprint = PersistentDedup.generateFingerprint({
      type: this.type,
      source: this.source,
      targetOrError: this.rawError || JSON.stringify(this.metadata)
    });

    // Identity-Pinned Turns
    this.turns = [];

    // Token & Cost Budget Accounting
    this.budget = {
      maxTokens: budgetMaxTokens,
      maxCostIdr: budgetMaxCostIdr,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokensUsed: 0,
      totalCostIdr: 0
    };

    // Quorum & State
    this.quorum = {
      status: 'PENDING',
      verdict: '',
      liveProvidersCount: 0,
      verifierPassed: false
    };

    this.status = 'CREATED';
    this.dispatchedTaskId = null;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.resolvedAt = null;
  }

  /**
   * Adds an identity-pinned turn to the case packet.
   */
  addTurn({
    speaker,
    role,
    avatar,
    status = 'SUCCESS',
    actualModel = 'unknown',
    message = '',
    error = null,
    latencyMs = 0,
    promptTokens = 0,
    completionTokens = 0
  } = {}) {
    const costData = CostCalculator.calculateCostIdr(speaker, promptTokens, completionTokens);

    // Update cumulative token & cost budget
    this.budget.totalPromptTokens += promptTokens;
    this.budget.totalCompletionTokens += completionTokens;
    this.budget.totalTokensUsed += costData.totalTokens;
    this.budget.totalCostIdr = Math.round((this.budget.totalCostIdr + costData.costIdr) * 100) / 100;

    const turnEntry = {
      turnIndex: this.turns.length + 1,
      speaker: String(speaker).toUpperCase(),
      role,
      avatar,
      status, // SUCCESS | FAILED | SKIPPED
      actualModel,
      message,
      error,
      latencyMs,
      usage: costData,
      timestamp: new Date().toISOString()
    };

    this.turns.push(turnEntry);
    this.updatedAt = new Date().toISOString();
    return turnEntry;
  }

  seal(quorumResult, dispatchedTaskId = null) {
    this.quorum = quorumResult;
    this.dispatchedTaskId = dispatchedTaskId;
    this.status = quorumResult.status === 'QUORUM_MET' ? 'RESOLVED' : (quorumResult.status === 'DEGRADED' ? 'RESOLVED_DEGRADED' : 'ESCALATED_NO_QUORUM');
    this.resolvedAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      caseId: this.caseId,
      fingerprint: this.fingerprint,
      title: this.title,
      type: this.type,
      severity: this.severity,
      source: this.source,
      rawError: this.rawError,
      metadata: this.metadata,
      status: this.status,
      budget: this.budget,
      quorum: this.quorum,
      turns: this.turns,
      dispatchedTaskId: this.dispatchedTaskId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      resolvedAt: this.resolvedAt
    };
  }
}
