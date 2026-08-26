// Iron Director — Event-Driven Incident & Opportunity Sentry
// Continuously monitors telemetry, catches failures, and auto-triggers War Room sessions.

import EventEmitter from 'events';

export const SENTRY_EVENT_TYPES = Object.freeze({
  INCIDENT_PROVIDER_FAILURE: 'INCIDENT:PROVIDER_FAILURE',
  INCIDENT_PIPELINE_ERROR: 'INCIDENT:PIPELINE_ERROR',
  INCIDENT_WORKER_STALLED: 'INCIDENT:WORKER_STALLED',
  OPPORTUNITY_KEYWORD_PAGE_ONE: 'OPPORTUNITY:KEYWORD_PAGE_ONE',
  OPPORTUNITY_AD_WASTE_SPIKE: 'OPPORTUNITY:AD_WASTE_SPIKE'
});

export class SentryWatcher extends EventEmitter {
  constructor({
    ledger = null,
    circuitBreaker = null,
    dedupTtlMs = 3600_000 // 1 hour dedup
  } = {}) {
    super();
    this.ledger = ledger;
    this.circuitBreaker = circuitBreaker;
    this.dedupTtlMs = dedupTtlMs;
    this.triggeredIncidents = new Map(); // incidentKey -> timestamp
  }

  /**
   * Evaluates whether an incident has already been triggered recently.
   */
  _isDeduplicated(incidentKey) {
    const now = Date.now();
    if (this.triggeredIncidents.has(incidentKey)) {
      const ts = this.triggeredIncidents.get(incidentKey);
      if (now - ts < this.dedupTtlMs) {
        return true;
      }
    }
    this.triggeredIncidents.set(incidentKey, now);
    return false;
  }

  /**
   * Ingests an external or internal failure event.
   */
  reportPipelineFailure({ pipelineName, error, runId = null, metadata = {} }) {
    const key = `pipeline:${pipelineName}:${runId || error}`;
    if (this._isDeduplicated(key)) return null;

    const event = {
      type: SENTRY_EVENT_TYPES.INCIDENT_PIPELINE_ERROR,
      severity: 'CRITICAL',
      source: 'pipeline_monitor',
      title: `Pipeline Failure: ${pipelineName} failed with error`,
      error: typeof error === 'string' ? error : error?.message,
      metadata: { pipelineName, runId, ...metadata },
      timestamp: new Date().toISOString()
    };

    this.emit('sentry_alert', event);
    return event;
  }

  /**
   * Ingests a provider outage (e.g. 503 spike).
   */
  reportProviderOutage({ providerName, model, error }) {
    const key = `provider:${providerName}:${error}`;
    if (this._isDeduplicated(key)) return null;

    const event = {
      type: SENTRY_EVENT_TYPES.INCIDENT_PROVIDER_FAILURE,
      severity: 'HIGH',
      source: 'circuit_monitor',
      title: `Provider Outage: ${providerName} (${model}) experiencing disruption`,
      error: typeof error === 'string' ? error : error?.message,
      metadata: { providerName, model },
      timestamp: new Date().toISOString()
    };

    this.emit('sentry_alert', event);
    return event;
  }

  /**
   * Evaluates Task Ledger for stalled workers.
   */
  scanStalledWorkers(timeoutMs = 120_000) {
    if (!this.ledger) return [];
    const stuck = this.ledger.getStuckTasks(timeoutMs);
    const events = [];

    for (const task of stuck) {
      const key = `stalled:${task.id}:${task.state}`;
      if (this._isDeduplicated(key)) continue;

      const event = {
        type: SENTRY_EVENT_TYPES.INCIDENT_WORKER_STALLED,
        severity: 'HIGH',
        source: 'ledger_heartbeat',
        title: `Worker Stalled: Task '${task.id}' lost heartbeat in state [${task.state}]`,
        error: `No heartbeat received for > ${timeoutMs / 1000}s`,
        metadata: { taskId: task.id, owner: task.owner, taskTitle: task.title },
        timestamp: new Date().toISOString()
      };

      events.push(event);
      this.emit('sentry_alert', event);
    }
    return events;
  }

  /**
   * Ingests SEO ranking opportunity (e.g. Page 1 keyword near #1).
   */
  reportRankingOpportunity({ keyword, position, impressions, targetPage }) {
    const key = `seo_opp:${keyword}:${Math.round(position)}`;
    if (this._isDeduplicated(key)) return null;

    const event = {
      type: SENTRY_EVENT_TYPES.OPPORTUNITY_KEYWORD_PAGE_ONE,
      severity: 'OPPORTUNITY',
      source: 'gsc_watcher',
      title: `SEO Opportunity: Keyword "${keyword}" is at position ${position} (${impressions} impressions)`,
      metadata: { keyword, position, impressions, targetPage },
      timestamp: new Date().toISOString()
    };

    this.emit('sentry_alert', event);
    return event;
  }

  /**
   * Ingests PPC waste detection from Rian.
   */
  reportAdWaste({ wastedCount, estimatedSavingsRupiah, sampleTerms = [] }) {
    const key = `ad_waste:${wastedCount}:${estimatedSavingsRupiah}`;
    if (this._isDeduplicated(key)) return null;

    const event = {
      type: SENTRY_EVENT_TYPES.OPPORTUNITY_AD_WASTE_SPIKE,
      severity: 'OPPORTUNITY',
      source: 'rian_ad_auditor',
      title: `Ad Waste Detected: ${wastedCount} negative terms found (Potential Savings: Rp ${estimatedSavingsRupiah.toLocaleString('id-ID')})`,
      metadata: { wastedCount, estimatedSavingsRupiah, sampleTerms },
      timestamp: new Date().toISOString()
    };

    this.emit('sentry_alert', event);
    return event;
  }
}
