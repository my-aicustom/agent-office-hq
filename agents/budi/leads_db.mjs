import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { LEAD_STATUSES, LEAD_SOURCES, LEAD_VALIDATION_RULES } from './constants.mjs';

const DEFAULT_LEADS_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'data', 'budi_leads.json'
);

function normalizePhone(rawPhone) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

function normalizeEmail(rawEmail) {
  return String(rawEmail || '').trim().toLowerCase();
}

function dedupeKeyFor(lead) {
  const phoneKey = normalizePhone(lead.phone);
  if (phoneKey) return `phone:${phoneKey}`;
  const emailKey = normalizeEmail(lead.email);
  if (emailKey) return `email:${emailKey}`;
  return null;
}

function createLeadId(createdAt) {
  const stamp = createdAt.replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `LEAD-${stamp}-${suffix}`;
}

async function readCollection(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`Budi leads_db read failed for ${path.basename(filePath)}: ${error.message}`);
  }
}

async function atomicWrite(filePath, records) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), records }, null, 2);
  await fs.writeFile(tempPath, payload, { encoding: 'utf8', flag: 'wx' });
  await fs.rename(tempPath, filePath);
}

export class BudiLeadsDb {
  constructor(filePath = process.env.BUDI_LEADS_FILE || DEFAULT_LEADS_FILE) {
    this.filePath = path.resolve(filePath);
    this.writeQueue = Promise.resolve();
    this._cache = null;
    this._dedupeIndex = new Map();
    this._idIndex = new Map();
    this._mtimeMs = 0;
  }

  queueWrite(operation) {
    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }

  async _loadCache() {
    try {
      const stat = await fs.stat(this.filePath);
      if (this._cache && stat.mtimeMs === this._mtimeMs) {
        return this._cache;
      }
      const records = await readCollection(this.filePath);
      this._cache = records;
      this._mtimeMs = stat.mtimeMs;
      this._dedupeIndex.clear();
      this._idIndex.clear();
      for (const record of records) {
        if (record.dedupeKey) this._dedupeIndex.set(record.dedupeKey, record);
        if (record.id) this._idIndex.set(record.id, record);
      }
      return this._cache;
    } catch (err) {
      if (err.code === 'ENOENT') {
        this._cache = [];
        this._dedupeIndex.clear();
        this._idIndex.clear();
        this._mtimeMs = 0;
        return this._cache;
      }
      throw err;
    }
  }

  async readAll() {
    return (await this._loadCache()).slice();
  }

  /**
   * @throws {Error} code VALIDATION_ERROR if required fields are missing.
   * @returns {Promise<{ inserted: boolean, duplicate: boolean, lead: object }>}
   */
  async insertLead(data) {
    const input = data && typeof data === 'object' ? data : {};
    const missing = LEAD_VALIDATION_RULES.requiredFields.filter(field => !String(input[field] || '').trim());
    if (missing.length) {
      const error = new Error(`Missing required lead field(s): ${missing.join(', ')}`);
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    const hasContact = LEAD_VALIDATION_RULES.requiredContactFields.some(field => String(input[field] || '').trim());
    if (!hasContact) {
      const error = new Error(`Lead must include at least one of: ${LEAD_VALIDATION_RULES.requiredContactFields.join(', ')}`);
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    if (input.source && !LEAD_VALIDATION_RULES.allowedSources.includes(input.source)) {
      const error = new Error(`Unknown lead source: ${input.source}`);
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    return this.queueWrite(async () => {
      await this._loadCache();
      const dedupeKey = dedupeKeyFor(input);
      if (dedupeKey && this._dedupeIndex.has(dedupeKey)) {
        return { inserted: false, duplicate: true, lead: this._dedupeIndex.get(dedupeKey) };
      }

      const createdAt = new Date().toISOString();
      const lead = {
        id: createLeadId(createdAt),
        name: String(input.name).trim(),
        phone: normalizePhone(input.phone) || null,
        email: normalizeEmail(input.email) || null,
        source: input.source || LEAD_SOURCES.MANUAL,
        message: input.message ? String(input.message).trim() : null,
        status: LEAD_STATUSES.NEW,
        dedupeKey,
        createdAt,
        updatedAt: createdAt
      };
      this._cache.push(lead);
      if (dedupeKey) this._dedupeIndex.set(dedupeKey, lead);
      this._idIndex.set(lead.id, lead);

      await atomicWrite(this.filePath, this._cache);
      try {
        const stat = await fs.stat(this.filePath);
        this._mtimeMs = stat.mtimeMs;
      } catch {}

      return { inserted: true, duplicate: false, lead };
    });
  }

  /**
   * @param {{ status?: string, source?: string, limit?: number }} filter
   */
  async getLeads(filter = {}) {
    const { status, source, limit = 500 } = filter;
    const records = await this.readAll();
    return records
      .filter(lead => !status || lead.status === status)
      .filter(lead => !source || lead.source === source)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(1, Math.min(1000, Number(limit) || 500)));
  }

  async updateLeadStatus(leadId, status) {
    if (!LEAD_VALIDATION_RULES.allowedStatuses.includes(status)) {
      const error = new Error(`Unknown lead status: ${status}`);
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    return this.queueWrite(async () => {
      const records = await this.readAll();
      const index = records.findIndex(lead => lead.id === leadId);
      if (index < 0) {
        const error = new Error(`Lead not found: ${leadId}`);
        error.code = 'LEAD_NOT_FOUND';
        throw error;
      }
      records[index] = { ...records[index], status, updatedAt: new Date().toISOString() };
      await atomicWrite(this.filePath, records);
      return records[index];
    });
  }

  async getLeadMetrics() {
    const records = await this.readAll();
    const byStatus = Object.fromEntries(Object.values(LEAD_STATUSES).map(status => [status, 0]));
    for (const lead of records) {
      if (byStatus[lead.status] === undefined) byStatus[lead.status] = 0;
      byStatus[lead.status] += 1;
    }
    const closed = byStatus.WON + byStatus.LOST;
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return {
      total: records.length,
      byStatus,
      conversionRate: closed > 0 ? Number((byStatus.WON / closed).toFixed(4)) : 0,
      newLast24h: records.filter(lead => Date.parse(lead.createdAt) >= dayAgo).length
    };
  }
}

export const budiLeadsDb = new BudiLeadsDb();
export const insertLead = (...args) => budiLeadsDb.insertLead(...args);
export const getLeads = (...args) => budiLeadsDb.getLeads(...args);
export const updateLeadStatus = (...args) => budiLeadsDb.updateLeadStatus(...args);
export const getLeadMetrics = (...args) => budiLeadsDb.getLeadMetrics(...args);
