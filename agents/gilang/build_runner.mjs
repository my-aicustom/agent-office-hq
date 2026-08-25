import crypto from 'crypto';
import { DEPLOY_STATUSES, TARGET_ENVIRONMENTS } from './constants.mjs';

/** Files every TepatLaser static build must ship. Injectable for tests / future builds. */
export const DEFAULT_REQUIRED_BUILD_FILES = Object.freeze([
  'index.html',
  'style.css',
  'app.js',
  'server.mjs'
]);

/**
 * Validates a static build's file manifest against the required file set.
 * Pure function: `files` is the manifest to check (e.g. produced by walking
 * the build output directory), never touches the filesystem itself.
 */
export function validateStaticBuild({ files = [], requiredFiles = DEFAULT_REQUIRED_BUILD_FILES } = {}) {
  const present = new Set(files);
  const missingFiles = requiredFiles.filter((file) => !present.has(file));
  return {
    valid: missingFiles.length === 0,
    checkedFiles: files.length,
    requiredFiles: requiredFiles.length,
    missingFiles,
    checkedAt: new Date().toISOString()
  };
}

function isWellFormedUrl(url, baseUrl) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url);
    if (baseUrl && !url.startsWith(baseUrl)) return false;
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Verifies a set of sitemap URLs: all must be well-formed absolute https
 * URLs (optionally scoped to `baseUrl`), and duplicates are flagged.
 */
export function verifySitemapUrls(urls = [], { baseUrl = null } = {}) {
  const invalidUrls = urls.filter((url) => !isWellFormedUrl(url, baseUrl));
  const seen = new Set();
  const duplicates = new Set();
  for (const url of urls) {
    if (seen.has(url)) duplicates.add(url);
    seen.add(url);
  }
  return {
    valid: invalidUrls.length === 0 && duplicates.size === 0 && urls.length > 0,
    totalUrls: urls.length,
    uniqueUrls: seen.size,
    invalidUrls,
    duplicates: [...duplicates],
    checkedAt: new Date().toISOString()
  };
}

/** Builds a standard sitemap.xml document from a list of absolute URLs. */
export function buildSitemapXml(urls = []) {
  const entries = urls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
}

function createDeployId(startedAt) {
  const stamp = startedAt.replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `DEPLOY-${stamp}-${suffix}`;
}

/**
 * In-memory deployment history tracker, one entry per triggerBuild() call.
 * Kept separate from CloudflarePurgeClient/agent orchestration so it stays
 * trivially unit-testable without any network or filesystem dependency.
 */
export class DeploymentTracker {
  constructor() {
    this.deployments = [];
  }

  /** @returns {object} the newly created deployment record (status PENDING). */
  startDeploy({ environment, buildResult, sitemapResult } = {}) {
    if (!Object.values(TARGET_ENVIRONMENTS).includes(environment)) {
      const error = new Error(`Unknown target environment: ${environment}`);
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    const startedAt = new Date().toISOString();
    const deployment = {
      id: createDeployId(startedAt),
      environment,
      status: DEPLOY_STATUSES.PENDING,
      buildResult: buildResult || null,
      sitemapResult: sitemapResult || null,
      startedAt,
      updatedAt: startedAt
    };
    this.deployments.push(deployment);
    return deployment;
  }

  /** @returns {object} the updated deployment record. */
  updateStatus(deployId, status) {
    if (!Object.values(DEPLOY_STATUSES).includes(status)) {
      const error = new Error(`Unknown deploy status: ${status}`);
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    const deployment = this.deployments.find((d) => d.id === deployId);
    if (!deployment) {
      const error = new Error(`Deployment not found: ${deployId}`);
      error.code = 'DEPLOY_NOT_FOUND';
      throw error;
    }
    deployment.status = status;
    deployment.updatedAt = new Date().toISOString();
    return deployment;
  }

  getLogs({ environment, limit = 50 } = {}) {
    return this.deployments
      .filter((d) => !environment || d.environment === environment)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 50)));
  }

  getLatest(environment) {
    const logs = this.getLogs({ environment, limit: 1 });
    return logs[0] || null;
  }
}
