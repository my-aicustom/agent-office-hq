// Iron Director — Base Provider Interface

export class BaseProvider {
  constructor(name) {
    this.name = name;
    this.totalCalls = 0;
    this.successfulCalls = 0;
    this.failedCalls = 0;
    this.totalLatencyMs = 0;
  }

  isAvailable() {
    return true;
  }

  async execute(_options) {
    throw new Error(`execute() not implemented on provider '${this.name}'`);
  }

  recordMetrics(latencyMs, success) {
    this.totalCalls += 1;
    this.totalLatencyMs += latencyMs;
    if (success) this.successfulCalls += 1;
    else this.failedCalls += 1;
  }

  getMetrics() {
    const avgLatency = this.successfulCalls > 0 ? Math.round(this.totalLatencyMs / this.successfulCalls) : 0;
    return {
      name: this.name,
      totalCalls: this.totalCalls,
      successfulCalls: this.successfulCalls,
      failedCalls: this.failedCalls,
      avgLatencyMs: avgLatency
    };
  }
}
