const ACTIVE_TASK_STATES = new Set(['CLAIMED', 'RUNNING', 'VERIFYING', 'HANDOFF', 'RETRYING']);
const ATTENTION_TASK_STATES = new Set(['BLOCKED', 'ESCALATED']);

function asDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function latestFirst(items, field = 'updatedAt') {
  return [...items].sort((a, b) => {
    const aTime = asDate(a?.[field])?.getTime() || 0;
    const bTime = asDate(b?.[field])?.getTime() || 0;
    return bTime - aTime;
  });
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function evidenceLinks(task) {
  const evidence = Array.isArray(task?.output?.evidence) ? task.output.evidence : [];
  const links = [];
  for (const item of evidence) {
    if (item?.prUrl) links.push({ kind: item.kind, label: `PR #${item.prNumber || ''}`.trim(), url: safeHttpUrl(item.prUrl) });
    if (item?.productionUrl) links.push({ kind: 'PRODUCTION_URL', label: 'Production', url: safeHttpUrl(item.productionUrl) });
    if (item?.targetUrl) links.push({ kind: item.kind, label: 'HTTP proof', url: safeHttpUrl(item.targetUrl) });
    for (const check of item?.checks || []) {
      if (check?.url) links.push({ kind: 'CI_CHECK', label: check.name || 'CI check', url: safeHttpUrl(check.url) });
    }
  }
  return links.filter((link, index, all) => link.url && all.findIndex(candidate => candidate.url === link.url) === index);
}

function summarizeTask(task) {
  return {
    ...task,
    evidenceLinks: evidenceLinks(task)
  };
}

function providerState(provider, circuits) {
  const metrics = provider?.metrics || {};
  const circuit = circuits?.[provider?.name] || {};
  const totalCalls = Number(metrics.totalCalls || 0);
  const successfulCalls = Number(metrics.successfulCalls || 0);
  let status = 'UNCONFIGURED';
  if (provider?.available && circuit.state === 'OPEN') status = 'CIRCUIT_OPEN';
  else if (provider?.available && totalCalls === 0) status = 'READY_UNPROVEN';
  else if (provider?.available && successfulCalls > 0) status = 'VERIFIED';
  else if (provider?.available) status = 'DEGRADED';
  return {
    name: provider?.name || 'unknown',
    available: Boolean(provider?.available),
    status,
    circuitState: circuit.state || (provider?.available ? 'CLOSED' : 'UNAVAILABLE'),
    totalCalls,
    successfulCalls,
    failedCalls: Number(metrics.failedCalls || 0),
    avgLatencyMs: Number(metrics.avgLatencyMs || 0),
    lastSuccess: circuit.lastSuccess || null,
    lastFailure: circuit.lastFailure || null
  };
}

function schedulerSummary(autonomy, now) {
  const lastRun = autonomy?.lastRun || null;
  const finishedAt = asDate(lastRun?.finishedAt);
  const intervalMs = Number(autonomy?.intervalMs || 0);
  const estimatedNextRunAt = finishedAt && intervalMs > 0
    ? new Date(finishedAt.getTime() + intervalMs).toISOString()
    : null;
  return {
    enabled: Boolean(autonomy?.enabled),
    running: Boolean(autonomy?.running),
    intervalMs,
    lastRun,
    estimatedNextRunAt,
    overdue: Boolean(estimatedNextRunAt && asDate(estimatedNextRunAt).getTime() < now.getTime() && !autonomy?.running)
  };
}

export function buildControlRoomSnapshot({
  director = {},
  tasks = [],
  cases = [],
  commitSha = 'unknown',
  dataSources = {},
  generatedAt = new Date().toISOString()
} = {}) {
  const now = asDate(generatedAt) || new Date();
  const sortedTasks = latestFirst(tasks).map(summarizeTask);
  const sortedCases = latestFirst(cases, 'createdAt');
  const activeTasks = sortedTasks.filter(task => ACTIVE_TASK_STATES.has(task.state));
  const attentionTasks = sortedTasks.filter(task => ATTENTION_TASK_STATES.has(task.state));
  const awaitingReview = sortedTasks.filter(task => task.state === 'AWAITING_REVIEW');
  const providers = (director.providers?.providers || []).map(provider => providerState(provider, director.providers?.circuits));
  const routableProviders = providers.filter(provider => provider.available && provider.circuitState !== 'OPEN');
  const verifiedProviderNames = new Set(sortedCases.flatMap(caseItem =>
    (caseItem.turns || []).filter(turn => turn?.status === 'SUCCESS' && turn?.outboundEvidence?.verified === true)
      .map(turn => turn.providerKey || String(turn.speaker || '').toLowerCase())
      .filter(Boolean)
  ));
  const scheduler = schedulerSummary(director.autonomy, now);
  const lifecycle = director.prLifecycle || {};

  const dependencyErrors = [];
  if (!scheduler.enabled) dependencyErrors.push('AUTONOMY_DISABLED');
  if (routableProviders.length < 2) dependencyErrors.push('LIVE_QUORUM_UNAVAILABLE');
  if (!lifecycle.enabled) dependencyErrors.push('LIFECYCLE_DISABLED');
  if (!lifecycle.configured) dependencyErrors.push('LIFECYCLE_GITHUB_TOKEN_MISSING');
  if (scheduler.lastRun?.status === 'FAILED') dependencyErrors.push('LAST_AUTONOMY_RUN_FAILED');
  if (['DEGRADED', 'BLOCKED_MISSING_GITHUB_TOKEN'].includes(lifecycle.lastSweep?.status)) dependencyErrors.push('LIFECYCLE_DEGRADED');

  let mode = 'IDLE';
  if (dependencyErrors.length > 0) mode = 'BLOCKED';
  else if (scheduler.running || lifecycle.running || activeTasks.length > 0) mode = 'WORKING';
  else if (ATTENTION_TASK_STATES.has(sortedTasks[0]?.state)) mode = 'ATTENTION';

  const taskCounts = director.taskCounts || {};
  const pipeline = {
    queued: Number(taskCounts.QUEUED || 0),
    executing: ['CLAIMED', 'RUNNING', 'VERIFYING', 'HANDOFF', 'RETRYING']
      .reduce((total, state) => total + Number(taskCounts[state] || 0), 0),
    awaitingReview: Number(taskCounts.AWAITING_REVIEW || 0),
    deployed: Number(taskCounts.DEPLOYED || 0),
    done: Number(taskCounts.DONE || 0),
    blocked: Number(taskCounts.BLOCKED || 0) + Number(taskCounts.ESCALATED || 0)
  };

  return {
    generatedAt: now.toISOString(),
    mode,
    dependencyErrors,
    runtime: {
      status: director.status || 'UNKNOWN',
      commitSha,
      uptimeSeconds: Number(director.uptimeSeconds || 0),
      dataSources
    },
    scheduler,
    lifecycle,
    providers,
    pipeline,
    proof: {
      recentCaseCount: sortedCases.length,
      totalTokens: Number(director.costAccounting?.totalTokens || 0),
      totalCostIdr: Number(director.costAccounting?.totalCostIdr || 0),
      routableProviderCount: routableProviders.length,
      verifiedProviderCount: verifiedProviderNames.size
    },
    agents: [
      {
        id: 'nadia-radar',
        name: 'Nadia Radar',
        role: 'GSC opportunity scheduler',
        status: !scheduler.enabled ? 'BLOCKED' : scheduler.running ? 'WORKING' : 'IDLE',
        detail: scheduler.lastRun?.status || 'NO_RUN_EVIDENCE',
        evidenceAt: scheduler.lastRun?.finishedAt || null
      },
      {
        id: 'quorum-council',
        name: 'Quorum Council',
        role: 'Independent provider approval',
        status: routableProviders.length >= 2 ? 'READY' : 'BLOCKED',
        detail: `${routableProviders.length} routable / ${verifiedProviderNames.size} outbound-verified`,
        evidenceAt: sortedCases[0]?.updatedAt || sortedCases[0]?.createdAt || null
      },
      {
        id: 'draft-executor',
        name: 'Draft PR Executor',
        role: 'Allowlisted repository mutation',
        status: activeTasks.length > 0 ? 'WORKING' : awaitingReview.length > 0 ? 'AWAITING_REVIEW' : 'IDLE',
        detail: `${activeTasks.length} executing / ${awaitingReview.length} review gate`,
        evidenceAt: sortedTasks[0]?.updatedAt || null
      },
      {
        id: 'release-verifier',
        name: 'Release Verifier',
        role: 'Merge, CI, deploy, production read-back',
        status: !lifecycle.enabled || !lifecycle.configured ? 'BLOCKED' : lifecycle.running ? 'WORKING' : 'IDLE',
        detail: lifecycle.lastSweep?.status || 'NO_SWEEP_EVIDENCE',
        evidenceAt: lifecycle.lastSweep?.finishedAt || null
      }
    ],
    recentTasks: sortedTasks.slice(0, 50),
    recentCases: sortedCases.slice(0, 20),
    director
  };
}
