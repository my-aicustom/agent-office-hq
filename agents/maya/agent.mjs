import { MayaPersistence } from './persistence.mjs';
import { fetchMayaSource } from './sync.mjs';
import { createDefaultLlmProvider } from '../../tools/llm.mjs';

const MAYA_IDENTITY = { id: 'aero-writer', name: 'Maya', avatar: '👩‍💼', color: '#00f0ff' };
const RECENTLY_ACTIVE_MS = 26 * 60 * 60 * 1000; // daily cron + slack

const SYSTEM_PROMPT_PREFIX = `Kamu adalah Maya, Lead SEO & Tech Copywriter untuk Tepat Laser. Kamu menjawab pertanyaan Bos di console interogasi dashboard AI Swarm HQ tentang pekerjaan SEO nyata yang sudah kamu kerjakan.

ATURAN PENTING: Jawab HANYA berdasarkan data aktivitas nyata di bawah ini. Jika datanya kosong/belum ada, katakan terus terang bahwa kamu belum pernah publish artikel — JANGAN mengarang angka seperti "107 halaman" atau klaim lain yang tidak ada di data. Gaya bicara: percaya diri, terstruktur, panggil user "Bos".`;

class MayaAgent {
  constructor({ persistence = new MayaPersistence(), llmProvider = createDefaultLlmProvider() } = {}) {
    this.persistence = persistence;
    this.llmProvider = llmProvider;
  }

  /** Fetches the latest data from tepatlaser and caches it locally. */
  async sync() {
    const { status, rankings, syncedAt, errors } = await fetchMayaSource();
    if (status) await this.persistence.writeStatus({ ...status, syncedAt, syncError: errors.length ? errors.join('; ') : null });
    if (rankings) await this.persistence.writeRankings({ ...rankings, syncedAt, syncError: errors.length ? errors.join('; ') : null });
    return { syncedAt, errors };
  }

  async getStatus() {
    const [statusFile, rankingsFile] = await Promise.all([this.persistence.readStatus(), this.persistence.readRankings()]);
    const runs = statusFile.runs || [];
    const lastRun = runs.length ? runs[runs.length - 1] : null;
    const latestSnapshot = rankingsFile.snapshots?.length ? rankingsFile.snapshots[rankingsFile.snapshots.length - 1] : null;

    const minutesSinceLastRun = lastRun ? Math.round((Date.now() - Date.parse(lastRun.timestamp)) / 60000) : null;
    const isRecentlyActive = lastRun ? (Date.now() - Date.parse(lastRun.timestamp)) < RECENTLY_ACTIVE_MS : false;

    return {
      identity: MAYA_IDENTITY,
      syncedAt: statusFile.syncedAt || null,
      syncError: statusFile.syncError || null,
      totalRunsPublished: runs.length,
      lastRun,
      minutesSinceLastRun,
      isRecentlyActive,
      rankOneCount: latestSnapshot?.rankOneCount ?? null,
      pageOneCount: latestSnapshot?.pageOneCount ?? null,
      totalTracked: latestSnapshot?.totalTracked ?? null,
      rankingsCheckedAt: latestSnapshot?.checkedAt ?? null,
      recentRuns: runs.slice(-10).reverse()
    };
  }

  buildGroundingContext(status) {
    if (!status.totalRunsPublished) {
      return 'DATA AKTIVITAS: Belum ada artikel yang berhasil dipublish. Belum pernah sync data atau publisher belum pernah jalan.';
    }
    const lines = [
      `Total artikel yang sudah dipublish: ${status.totalRunsPublished}`,
      `Rank #1 saat ini: ${status.rankOneCount ?? 'belum diketahui'} dari ${status.totalTracked ?? '?'} keyword yang dipantau`,
      `Halaman 1 (posisi 1-10): ${status.pageOneCount ?? 'belum diketahui'} dari ${status.totalTracked ?? '?'}`,
      `Terakhir publish: ${status.lastRun ? `"${status.lastRun.title}" untuk keyword "${status.lastRun.keyword}" (${status.lastRun.timestamp}), alasan: ${status.lastRun.reason}` : 'tidak ada'}`,
      `5 publish terakhir: ${status.recentRuns.slice(0, 5).map(r => `${r.keyword} → ${r.publishedUrl}`).join(' | ') || '-'}`
    ];
    return `DATA AKTIVITAS NYATA:\n${lines.join('\n')}`;
  }

  async answer(message) {
    const status = await this.getStatus();
    const timestamp = new Date().toLocaleTimeString('id-ID');

    if (!this.llmProvider.isConfigured?.()) {
      return {
        status: 'success',
        agentId: MAYA_IDENTITY.id,
        agentName: MAYA_IDENTITY.name,
        agentAvatar: MAYA_IDENTITY.avatar,
        agentColor: MAYA_IDENTITY.color,
        timestamp,
        reply: 'LLM API Key (ANTHROPIC_API_KEY / OPENROUTER_API_KEY / GEMINI_API_KEY) belum di-set di server ini, Bos — saya belum bisa mikir. ' + this.buildGroundingContext(status)
      };
    }

    try {
      const system = `${SYSTEM_PROMPT_PREFIX}\n\n${this.buildGroundingContext(status)}`;
      const reply = await this.llmProvider.generate(system, message);
      return {
        status: 'success',
        agentId: MAYA_IDENTITY.id,
        agentName: MAYA_IDENTITY.name,
        agentAvatar: MAYA_IDENTITY.avatar,
        agentColor: MAYA_IDENTITY.color,
        timestamp,
        reply
      };
    } catch (error) {
      return {
        status: 'success',
        agentId: MAYA_IDENTITY.id,
        agentName: MAYA_IDENTITY.name,
        agentAvatar: MAYA_IDENTITY.avatar,
        agentColor: MAYA_IDENTITY.color,
        timestamp,
        reply: `Maaf Bos, ada error manggil Claude API: ${error.message}`
      };
    }
  }
}

export const mayaAgent = new MayaAgent();
export { MayaAgent, MAYA_IDENTITY };
