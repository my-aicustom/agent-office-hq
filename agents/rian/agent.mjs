import { SEARCH_TERMS_VAULT_DATA } from '../../serp_auditor.mjs';
import { RIAN_IDENTITY } from './constants.mjs';
import { buildNegativeKeywordLists, calculateSavings, identifyWastedTerms } from './negative_builder.mjs';
import { loadSearchTerms, summarizeSearchTerms } from './search_terms.mjs';

export class RianAgent {
  constructor({ searchTermsSource = SEARCH_TERMS_VAULT_DATA } = {}) {
    this.searchTermsSource = searchTermsSource;
    this.lastAudit = null;
  }

  /** Runs a full search-terms audit: classify waste, build negative lists, estimate savings. */
  auditSearchTerms({ searchTerms } = {}) {
    const records = loadSearchTerms(searchTerms || this.searchTermsSource);
    const wastedTerms = identifyWastedTerms(records);
    const negativeLists = buildNegativeKeywordLists(wastedTerms);
    const savings = calculateSavings(wastedTerms);
    const summary = summarizeSearchTerms(records);

    const audit = {
      auditedAt: new Date().toISOString(),
      agent: RIAN_IDENTITY,
      summary,
      records,
      wastedTerms,
      negativeLists,
      savings
    };
    this.lastAudit = audit;
    return audit;
  }

  /** Returns the exact/phrase negative keyword lists from the last audit, running one if needed. */
  getNegativeKeywords() {
    const audit = this.lastAudit || this.auditSearchTerms();
    return audit.negativeLists;
  }

  /** Exports the last audit's negative keyword lists as json (default), csv, or newline-delimited text. */
  exportNegatives({ format = 'json' } = {}) {
    const lists = this.getNegativeKeywords();

    if (format === 'csv') {
      const rows = ['keyword,matchType,category'];
      for (const item of [...lists.exact, ...lists.phrase]) {
        rows.push(`${item.keyword},${item.matchType},${item.category}`);
      }
      return rows.join('\n');
    }

    if (format === 'text') {
      return [...lists.exact.map((i) => i.keyword), ...lists.phrase.map((i) => i.keyword)].join('\n');
    }

    return JSON.stringify(lists, null, 2);
  }

  getStatus() {
    const audit = this.lastAudit || this.auditSearchTerms();
    return {
      agent: RIAN_IDENTITY,
      currentStatus: audit.wastedTerms.length > 0 ? 'READY' : 'IDLE',
      lastAudit: audit.auditedAt,
      termsAudited: audit.summary.totalTerms,
      wastedTermsBlocked: audit.wastedTerms.length,
      estimatedSavings: audit.savings
    };
  }

  formatRupiah(value) {
    return `Rp ${Math.round(value || 0).toLocaleString('id-ID')}`;
  }

  /** Chat-console answer, grounded in the real last (or freshly-run) audit — same response shape as Nadia/Maya. */
  answer(message) {
    const audit = this.lastAudit || this.auditSearchTerms();
    const lower = String(message || '').toLowerCase();
    const categoryLabels = { EMPLOYMENT: 'lowongan kerja', USED_MACHINES: 'jual-beli mesin bekas', DIY: 'tutorial DIY', IRRELEVANT: 'tidak relevan/gratisan' };
    const byCategory = Object.entries(audit.summary.wastedByCategory)
      .map(([key, count]) => `${count} "${categoryLabels[key] || key}"`)
      .join(', ');

    let reply;
    if (lower.includes('blokir') || lower.includes('keyword') || lower.includes('kenapa')) {
      reply = audit.wastedTerms.length === 0
        ? `Belum ada search term yang gua blokir, Bos — dari ${audit.summary.totalTerms} term yang gua audit, semuanya masih dianggap relevan/berpotensi buyer.`
        : `Gua blokir **${audit.wastedTerms.length} dari ${audit.summary.totalTerms} search term** di Search Terms Vault, Bos.\nBreakdown kategori: ${byCategory || 'tidak terklasifikasi'}.\nIni murni rule-based (bukan tebakan) — term yang cocok pola loker/mesin bekas/tutorial DIY/gratisan otomatis masuk daftar negative.`;
    } else if (lower.includes('yakin') || lower.includes('ngurangin') || lower.includes('turun') || lower.includes('lead') || lower.includes('aman')) {
      reply = `Prinsip kerja gua deterministic, Bos, bukan LLM yang bisa salah tebak: term cuma gua tandai "wasted" kalau match pola non-buyer (loker, mesin bekas, tutorial, gratisan) — data source-nya dari Search Terms Vault (\`serp_auditor.mjs\`, status: MANUAL, bukan live Google Ads API). Belum ada validasi silang ke data konversi WA beneran, jadi kalau Bos mau lebih presisi, itu langkah berikutnya yang bisa gua bangun.`;
    } else if (lower.includes('rupiah') || lower.includes('hemat') || lower.includes('budget') || lower.includes('uang') || lower.includes('biaya')) {
      const s = audit.savings;
      reply = s.termsBlocked === 0
        ? `Belum ada penghematan tercatat, Bos — belum ada term yang diblokir dari data saat ini.`
        : `Hitungan real dari ${s.termsBlocked} term yang diblokir, Bos:\n- Total tersimpan: **${this.formatRupiah(s.totalSaved)}**\n- Estimasi/bulan: **${this.formatRupiah(s.estimatedMonthlySavings)}**\n- Estimasi/tahun: **${this.formatRupiah(s.estimatedAnnualSavings)}**\n(Dihitung dari kolom "Saved Rp X" di Search Terms Vault, bukan angka karangan.)`;
    } else {
      reply = `Siap Bos! Status audit terakhir: ${audit.summary.totalTerms} term dianalisis, ${audit.wastedTerms.length} diblokir. Mau gua jalankan audit ulang atau export daftar negative keyword-nya?`;
    }

    return {
      status: 'success',
      agentId: 'iron-shield',
      agentName: 'Rian',
      agentAvatar: '👨‍💻',
      agentColor: '#ff0055',
      timestamp: new Date().toLocaleTimeString('id-ID'),
      reply
    };
  }
}

export const rianAgent = new RianAgent();
