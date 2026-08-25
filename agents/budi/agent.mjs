import { BUDI_IDENTITY, LEAD_SOURCES } from './constants.mjs';
import { budiLeadsDb } from './leads_db.mjs';
import { telegramBridge } from './telegram_bridge.mjs';

/** Best-effort field extraction — inbound WA webhook payload shapes vary by provider (Fonnte, Wablas, Meta Cloud API, ...). */
function extractLeadFromWhatsAppPayload(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const phone = source.phone || source.from || source.sender || source.wa_number || source.waNumber || null;
  const name = source.name || source.pushname || source.profileName || (phone ? `WhatsApp ${phone}` : null);
  const message = source.message || source.text || source.body || null;
  return { name, phone, message, source: LEAD_SOURCES.WHATSAPP };
}

export class BudiAgent {
  constructor({ leadsDb = budiLeadsDb, bridge = telegramBridge } = {}) {
    this.leadsDb = leadsDb;
    this.bridge = bridge;
  }

  /**
   * Persists the lead first, then best-effort dispatches a Telegram alert.
   * A Telegram outage never blocks or loses a lead: persistence always
   * happens before the alert attempt, and alert failures are reported,
   * not thrown.
   * @returns {Promise<{ inserted: boolean, duplicate: boolean, lead: object, alert: object }>}
   */
  async ingestLead(data) {
    const result = await this.leadsDb.insertLead(data);
    const alert = result.inserted
      ? await this.bridge.sendLeadAlert(result.lead)
      : { dispatched: false, error: null, skipped: true };
    return { ...result, alert };
  }

  async syncWhatsAppWebhook(payload) {
    return this.ingestLead(extractLeadFromWhatsAppPayload(payload));
  }

  async getLeads(filter) {
    return this.leadsDb.getLeads(filter);
  }

  async updateLeadStatus(leadId, status) {
    return this.leadsDb.updateLeadStatus(leadId, status);
  }

  async getStatus() {
    const [metrics, telegramStatus] = await Promise.all([
      this.leadsDb.getLeadMetrics(),
      this.bridge.explain()
    ]);
    return {
      agent: BUDI_IDENTITY,
      currentStatus: metrics.total > 0 ? 'READY' : 'IDLE',
      metrics,
      telegram: telegramStatus
    };
  }

  /** Chat-console answer, grounded in the real leads DB — same response shape as Nadia/Maya. */
  async answer(message) {
    const [metrics, telegramStatus] = await Promise.all([this.leadsDb.getLeadMetrics(), this.bridge.explain()]);
    const lower = String(message || '').toLowerCase();

    let reply;
    if (lower.includes('wilayah') || lower.includes('mana') || lower.includes('lokasi') || lower.includes('asal')) {
      const bySource = Object.entries(metrics.byStatus).filter(([, count]) => count > 0).map(([status, count]) => `${status}: ${count}`).join(', ');
      reply = metrics.total === 0
        ? `Belum ada lead tercatat sama sekali, Bos — belum bisa gua breakdown per wilayah.`
        : `Jujur Bos, gua belum nge-track lead per wilayah/domain (belum ada field itu di database gua) — kalau Bos mau, itu bisa gua tambahin. Yang gua punya sekarang: total **${metrics.total} lead**, breakdown status: ${bySource || '-'}.`;
    } else if (lower.includes('bocor') || lower.includes('hilang') || lower.includes('drop') || lower.includes('pesan')) {
      reply = `Arsitektur gua: setiap lead **selalu disimpan ke database dulu** (file JSON atomic-write) sebelum gua coba kirim alert Telegram — jadi kalaupun Telegram lagi down, leadnya tetap tersimpan, gak ada yang hilang.\nStatus Telegram bridge saat ini: **${telegramStatus.status}**${telegramStatus.error ? ` (${telegramStatus.error})` : ''}.`;
    } else if (lower.includes('rata') || lower.includes('konversi') || lower.includes('jumlah') || lower.includes('minggu')) {
      reply = metrics.total === 0
        ? `Belum ada lead sama sekali, Bos — database masih kosong.`
        : `Rekap real, Bos:\n- Total: **${metrics.total} lead**\n- Baru 24 jam terakhir: **${metrics.newLast24h}**\n- Conversion rate (WON dari yang closed): **${(metrics.conversionRate * 100).toFixed(1)}%**\n- Breakdown status: ${Object.entries(metrics.byStatus).filter(([, c]) => c > 0).map(([s, c]) => `${s}: ${c}`).join(', ') || '-'}`;
    } else {
      reply = `Siap Bos! Status: ${metrics.total} lead di database, Telegram bridge ${telegramStatus.status}. Mau gua tampilkan lead terbaru atau update status salah satu?`;
    }

    return {
      status: 'success',
      agentId: 'hermes-sentry',
      agentName: 'Budi',
      agentAvatar: '👨‍💼',
      agentColor: '#00ff66',
      timestamp: new Date().toLocaleTimeString('id-ID'),
      reply
    };
  }
}

export const budiAgent = new BudiAgent();
