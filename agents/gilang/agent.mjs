import {
  DEFAULT_REQUIRED_BUILD_FILES,
  DeploymentTracker,
  buildSitemapXml,
  validateStaticBuild,
  verifySitemapUrls
} from './build_runner.mjs';
import { cloudflarePurgeClient } from './cloudflare_purge.mjs';
import { DEPLOY_STATUSES, GILANG_IDENTITY, TARGET_ENVIRONMENTS } from './constants.mjs';

const DEFAULT_SITE_BASE_URL = 'https://tepatlaser.com';

/** Build manifest for the TepatLaser static site — the files a build must ship. */
const DEFAULT_BUILD_FILES = Object.freeze([
  'index.html',
  'style.css',
  'app.js',
  'server.mjs',
  'agents.js',
  'kpi.js',
  'office.js',
  'audio.js'
]);

/** Default sitemap for the TepatLaser static site. */
const DEFAULT_SITEMAP_URLS = Object.freeze([
  `${DEFAULT_SITE_BASE_URL}/`
]);

export class GilangAgent {
  constructor({
    buildFiles = DEFAULT_BUILD_FILES,
    requiredFiles = DEFAULT_REQUIRED_BUILD_FILES,
    sitemapUrls = DEFAULT_SITEMAP_URLS,
    baseUrl = DEFAULT_SITE_BASE_URL,
    purgeClient = cloudflarePurgeClient,
    tracker = new DeploymentTracker()
  } = {}) {
    this.buildFiles = buildFiles;
    this.requiredFiles = requiredFiles;
    this.sitemapUrls = sitemapUrls;
    this.baseUrl = baseUrl;
    this.purgeClient = purgeClient;
    this.tracker = tracker;
  }

  /**
   * Runs the full deploy pipeline for one environment: validate the static
   * build manifest, verify the sitemap, then record a deployment. A failed
   * validation or sitemap check short-circuits the deployment to FAILED —
   * it never reaches DEPLOYING/LIVE with a broken build.
   * @returns {object} the finished (or failed) deployment record.
   */
  triggerBuild(environment) {
    if (!Object.values(TARGET_ENVIRONMENTS).includes(environment)) {
      const error = new Error(`Unknown target environment: ${environment}`);
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const buildResult = validateStaticBuild({ files: this.buildFiles, requiredFiles: this.requiredFiles });
    const sitemapResult = verifySitemapUrls(this.sitemapUrls, { baseUrl: this.baseUrl });

    const deployment = this.tracker.startDeploy({ environment, buildResult, sitemapResult });

    if (!buildResult.valid || !sitemapResult.valid) {
      return this.tracker.updateStatus(deployment.id, DEPLOY_STATUSES.FAILED);
    }

    this.tracker.updateStatus(deployment.id, DEPLOY_STATUSES.BUILDING);
    this.tracker.updateStatus(deployment.id, DEPLOY_STATUSES.VALIDATING);
    this.tracker.updateStatus(deployment.id, DEPLOY_STATUSES.DEPLOYING);
    return this.tracker.updateStatus(deployment.id, DEPLOY_STATUSES.LIVE);
  }

  /** Renders the current sitemap.xml for the configured URL set. */
  renderSitemap() {
    return buildSitemapXml(this.sitemapUrls);
  }

  async purgeCache(urls = []) {
    return this.purgeClient.purgeUrls(urls);
  }

  getDeployLogs({ environment, limit } = {}) {
    return this.tracker.getLogs({ environment, limit });
  }

  async getStatus() {
    const latest = this.tracker.getLatest();
    const purgeStatus = await this.purgeClient.explain();
    return {
      agent: GILANG_IDENTITY,
      currentStatus: latest ? latest.status : 'IDLE',
      latestDeployment: latest,
      totalDeployments: this.tracker.deployments.length,
      cloudflarePurge: purgeStatus
    };
  }

  /** Chat-console answer, grounded in the real deploy tracker — same response shape as Nadia/Maya. */
  async answer(message) {
    const status = await this.getStatus();
    const lower = String(message || '').toLowerCase();

    let reply;
    if (lower.includes('vps') || lower.includes('ram') || lower.includes('server')) {
      reply = `Jujur Bos, gua belum punya akses monitoring RAM/CPU VPS langsung dari sini (belum ada modul buat itu) — yang bisa gua laporin: ${status.totalDeployments} deployment tercatat, status terakhir **${status.currentStatus}**. Kalau Bos mau gua bisa dibikinin modul health-check VPS beneran.`;
    } else if (lower.includes('jadwal') || lower.includes('deploy') || lower.includes('github') || lower.includes('actions') || lower.includes('cron')) {
      reply = `Jadwal cron beneran (dari \`daily-publish.yml\` di repo tepatlaser): otomatis jalan tiap hari **00:00 UTC (07:00 WIB)**, bisa juga dipicu manual.\nDi sisi gua sendiri: **${status.totalDeployments} deployment** tercatat${status.latestDeployment ? `, terakhir status **${status.latestDeployment.status}** untuk environment ${status.latestDeployment.environment} pada ${status.latestDeployment.startedAt || status.latestDeployment.updatedAt || '-'}` : ', belum pernah ada deployment lewat gua'}.`;
    } else if (lower.includes('aman') || lower.includes('crash') || lower.includes('overload') || lower.includes('beban')) {
      reply = `Status validasi build & cache, Bos:\n- Cloudflare purge: **${status.cloudflarePurge.status}**${status.cloudflarePurge.error ? ` (${status.cloudflarePurge.error})` : ''}\n- Deployment terakhir: **${status.currentStatus}**\nGua gak punya data uptime/crash real-time VPS dari sini — itu di luar scope modul gua sekarang.`;
    } else {
      reply = `Siap Bos! Status: ${status.totalDeployments} deployment tercatat, status terakhir ${status.currentStatus}, Cloudflare purge ${status.cloudflarePurge.status}. Mau gua trigger build/deploy atau purge cache sekarang?`;
    }

    return {
      status: 'success',
      agentId: 'cloud-forge',
      agentName: 'Gilang',
      agentAvatar: '👨‍🔧',
      agentColor: '#9d4edd',
      timestamp: new Date().toLocaleTimeString('id-ID'),
      reply
    };
  }
}

export const gilangAgent = new GilangAgent();
