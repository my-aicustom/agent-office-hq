import { DATA_STATUSES } from './constants.mjs';

const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';

/**
 * Cloudflare Cache Purge client. Mirrors budi's TelegramBridge shape: when
 * credentials are not configured it never throws or blocks a purge
 * request — it returns a clearly-labeled mock result instead, so
 * triggerBuild/purgeCache flows work in dev/test without live Cloudflare
 * access.
 */
export class CloudflarePurgeClient {
  constructor({
    apiToken = process.env.GILANG_CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN,
    zoneId = process.env.GILANG_CLOUDFLARE_ZONE_ID || process.env.CF_ZONE_ID
  } = {}) {
    this.apiToken = apiToken || null;
    this.zoneId = zoneId || null;
  }

  isConfigured() {
    return !!(this.apiToken && this.zoneId);
  }

  async explain() {
    return {
      source: 'cloudflare_purge',
      status: this.isConfigured() ? DATA_STATUSES.LIVE : DATA_STATUSES.UNAVAILABLE,
      fetchedAt: new Date().toISOString(),
      error: this.isConfigured() ? null : 'GILANG_CLOUDFLARE_API_TOKEN / GILANG_CLOUDFLARE_ZONE_ID is not configured.'
    };
  }

  /**
   * Purges the given URLs (or the whole zone when `urls` is empty) from
   * Cloudflare's cache. Falls back to a mock result when unconfigured;
   * network/API failures are reported in the return value, never thrown,
   * so a Cloudflare outage can never crash a deploy pipeline.
   * @returns {Promise<{ purged: boolean, mocked: boolean, urls: string[], error: string|null }>}
   */
  async purgeUrls(urls = []) {
    const payload = urls.length > 0 ? { files: urls } : { purge_everything: true };

    if (!this.isConfigured()) {
      return { purged: true, mocked: true, urls: [...urls], error: null, payload };
    }

    try {
      const res = await fetch(`${CLOUDFLARE_API_URL}/zones/${this.zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiToken}`
        },
        body: JSON.stringify(payload)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) {
        const message = body.errors?.[0]?.message || res.status;
        return { purged: false, mocked: false, urls: [...urls], error: `Cloudflare API error: ${message}`, payload };
      }
      return { purged: true, mocked: false, urls: [...urls], error: null, payload };
    } catch (error) {
      return { purged: false, mocked: false, urls: [...urls], error: error.message, payload };
    }
  }
}

export const cloudflarePurgeClient = new CloudflarePurgeClient();
