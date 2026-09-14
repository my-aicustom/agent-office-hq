import { DATA_STATUSES } from './constants.mjs';

const TELEGRAM_API_URL = 'https://api.telegram.org';

/** Pure formatter, kept side-effect free so it is trivially unit-testable. */
export function formatLeadAlert(lead) {
  const lines = [
    `🔔 Lead baru masuk!`,
    `Nama: ${lead.name}`,
    `Telepon: ${lead.phone || '-'}`,
    lead.email ? `Email: ${lead.email}` : null,
    `Sumber: ${lead.source}`,
    lead.message ? `Pesan: ${lead.message}` : null,
    `ID: ${lead.id}`
  ].filter(Boolean);
  return lines.join('\n');
}

export class TelegramBridge {
  constructor({
    botToken = process.env.BUDI_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN,
    chatId = process.env.BUDI_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID
  } = {}) {
    this.botToken = botToken || null;
    this.chatId = chatId || null;
  }

  isConfigured() {
    return !!(this.botToken && this.chatId);
  }

  async explain() {
    return {
      source: 'telegram_bridge',
      status: this.isConfigured() ? DATA_STATUSES.LIVE : DATA_STATUSES.UNAVAILABLE,
      fetchedAt: new Date().toISOString(),
      error: this.isConfigured() ? null : 'BUDI_TELEGRAM_BOT_TOKEN / BUDI_TELEGRAM_CHAT_ID is not configured.'
    };
  }

  /**
   * Dispatches a lead alert to Telegram. Never throws — failures are
   * reported in the return value so a Telegram outage can never block
   * lead ingestion/persistence (persistence always happens first).
   * @returns {Promise<{ dispatched: boolean, error: string|null }>}
   */
  async sendLeadAlert(lead) {
    if (!this.isConfigured()) {
      return { dispatched: false, error: 'Telegram bridge is not configured.' };
    }
    try {
      const url = `${TELEGRAM_API_URL}/bot${this.botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text: formatLeadAlert(lead) })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { dispatched: false, error: `Telegram API error: ${body.description || res.status}` };
      }
      return { dispatched: true, error: null };
    } catch (error) {
      return { dispatched: false, error: error.message };
    }
  }
}

export const telegramBridge = new TelegramBridge();
