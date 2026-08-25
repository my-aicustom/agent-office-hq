// Live SERP Auditor, Competitor Intelligence & Google Ads Search Terms Vault
//
// Ranking data (position/clicks/impressions) is fetched live from the Google
// Search Console API — see search_console.mjs and README.md "Setup Google
// Search Console". It is cached to disk and refreshed on a schedule (see
// server.mjs) so requests don't hit the GSC API directly.
//
// Competitor benchmarking (who ranks #1/#2/#3 above us) is NOT available via
// Search Console — Google does not expose competitors' rankings through this
// API. That intel below is manually curated and stays static until a paid
// SERP API (e.g. DataForSEO) is wired in.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { queryKeywordPosition, isConfigured as isGscConfigured } from './search_console.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, 'data');
const CACHE_PATH = path.join(CACHE_DIR, 'serp-cache.json');

// Search Console property URL per domain (must match exactly how the property
// is verified in Search Console: a URL-prefix like "https://example.com/" or
// a domain property like "sc-domain:example.com"). Overridable via env var.
const SITE_MAP = {
  tepatlaser: process.env.GSC_SITE_TEPATLASER || 'sc-domain:tepatlaser.com',
  rajacutting: process.env.GSC_SITE_RAJACUTTING || 'sc-domain:rajacuttinglaser.com',
  jasalasercutting: process.env.GSC_SITE_JASALASERCUTTING || 'sc-domain:jasalasercutting.com'
};

const DOMAIN_NAMES = {
  tepatlaser: 'tepatlaser.com',
  rajacutting: 'rajacuttinglaser.com',
  jasalasercutting: 'jasalasercutting.com'
};

// Static metadata + manually-curated competitor intel per tracked keyword.
export const KEYWORD_TARGETS = [
  {
    id: 'kw-1',
    domainKey: 'tepatlaser',
    keyword: 'jasa laser cutting bintaro',
    location: 'Bintaro Sektor 1-9',
    url: '/jasa-laser-cutting-bintaro/',
    topCompetitor: 'rajalasercutting.com',
    competitorsPage1: [
      { rank: 1, name: 'Raja Laser Cutting (rajalasercutting.com)', strength: 'Authority domain lama, kantor di BSD/Parigi' },
      { rank: 2, name: 'Kingsign Bintaro (kingsign.id)', strength: 'Spesialis reklame & workshop fisik Bintaro' },
      { rank: 3, name: 'EasyPrint (easyprint.id)', strength: 'Spesialis akrilik & signage retail' },
      { rank: 4, name: 'Dania Da / SMK (daniada.com)', strength: 'Jasa cutting metal & non-metal Tangsel' },
      { rank: 5, name: 'Sobat Laser (sobatlaser.com)', strength: 'Layanan 24 jam & gratis antar jemput' }
    ],
    actionPlan: 'Push cluster 15 artikel internal links Bintaro Sektor 1-9 & inject FAQ Schema radius 15 menit.'
  },
  {
    id: 'kw-2',
    domainKey: 'tepatlaser',
    keyword: 'laser cutting bsd serpong',
    location: 'BSD & Gading Serpong',
    url: '/jasa-laser-cutting-bsd/',
    topCompetitor: 'lytro.id',
    competitorsPage1: [
      { rank: 1, name: 'Lytro Laser (lytro.id)', strength: 'SEO Page 1 BSD & Serpong' },
      { rank: 2, name: 'Sobat Laser (sobatlaser.com)', strength: 'Free ongkir BSD cluster' },
      { rank: 3, name: 'Barz Laser (barz-laser.com)', strength: 'Partisi & fasad Gading Serpong' }
    ],
    actionPlan: 'Optimasi landing page BSD dengan kalkulator estimasi biaya express 1 hari jadi.'
  },
  {
    id: 'kw-3',
    domainKey: 'tepatlaser',
    keyword: 'harga laser cutting per meter',
    location: 'Jabodetabek Wide',
    url: '/harga-laser-cutting-per-meter/',
    topCompetitor: 'tritunggalmetal.com',
    competitorsPage1: [
      { rank: 1, name: 'Tritunggal Metal (tritunggalmetal.com)', strength: 'Tabel harga komprehensif' },
      { rank: 2, name: 'Dania Da (daniada.com)', strength: 'Katalog harga cutting per mm' }
    ],
    actionPlan: 'Tampilkan tabel harga real-time plat besi, ACP, stainless, akrilik di halaman /harga/.'
  },
  {
    id: 'kw-4',
    domainKey: 'rajacutting',
    keyword: 'pagar laser cutting mewah',
    location: 'Jabodetabek Residensial',
    url: '/produk/pagar-laser-cutting/',
    topCompetitor: 'pagarlaser.com',
    competitorsPage1: [
      { rank: 1, name: 'Pagar Laser Jakarta (pagarlaser.com)', strength: 'Portofolio rumah mewah PIK & Pondok Indah' },
      { rank: 2, name: 'Raja Laser (rajalasercutting.com)', strength: 'Atelier custom pagar motif islami' },
      { rank: 3, name: 'RajaCuttingLaser.com (KITA)', strength: 'Galeri 100+ motif CAD/DXF premium' }
    ],
    actionPlan: 'Tambah video reel/shorts showcase pagar finishing powder coating antik.'
  },
  {
    id: 'kw-5',
    domainKey: 'rajacutting',
    keyword: 'mihrab masjid laser cutting',
    location: 'Nasional / DKM Masjid',
    url: '/produk/mihrab-panel-islami/',
    topCompetitor: 'rajacuttinglaser.com (KITA)',
    competitorsPage1: [
      { rank: 1, name: 'RajaCuttingLaser.com (KITA)', strength: 'Pionir ornamen kaligrafi & mihrab masjid GRC/Kuningan' },
      { rank: 2, name: 'OrnamenMasjid.id', strength: 'Spesialis kubah & krawangan' }
    ],
    actionPlan: 'Pertahankan juara 1 dengan update studi kasus masjid agung dan review DKM.'
  },
  {
    id: 'kw-6',
    domainKey: 'jasalasercutting',
    keyword: 'jasa laser cutting plat besi',
    location: 'Banten & Jabodetabek',
    url: '/jasa-laser-fiber',
    topCompetitor: 'anugerahmetal.com',
    competitorsPage1: [
      { rank: 1, name: 'PT Metal Anugerah Suksestama (anugerahmetal.com)', strength: 'Pabrikan besar, otoritas tinggi industri' },
      { rank: 2, name: 'Sobat Laser (sobatlaser.com)', strength: 'Layanan 24 jam & armada pickup' },
      { rank: 3, name: 'Sumber Jaya Laser (sumberjayalaser.com)', strength: 'Stok plat besi tebal lengkap' },
      { rank: 4, name: 'JasaLaserCutting.com (KITA)', strength: 'EMD Domain authority + Fiber 12kW' }
    ],
    actionPlan: 'Bongkar kelemahan AnugerahMetal: Tambah tabel ketebalan 1mm-25mm & gas Nitrogen purity 99.9%.'
  },
  {
    id: 'kw-7',
    domainKey: 'jasalasercutting',
    keyword: 'jasa cnc router acp fasad',
    location: 'Industri & Gedung',
    url: '/jasa-cnc-router',
    topCompetitor: 'daniada.com',
    competitorsPage1: [
      { rank: 1, name: 'Dania Da (daniada.com)', strength: 'Vendor fasad gedung & ACP Seven' },
      { rank: 2, name: 'Barz Laser (barz-laser.com)', strength: 'Spesialis secondary skin' },
      { rank: 3, name: 'JasaLaserCutting.com (KITA)', strength: 'Silo teknis ACP & CNC Router meja 2x4 meter' }
    ],
    actionPlan: 'Upload downloadable file DXF parametric facade untuk arsitek dan drafter.'
  },
  {
    id: 'kw-8',
    domainKey: 'jasalasercutting',
    keyword: 'jasa potong plat besi tebal tangerang',
    location: 'Banten Industrial',
    url: '/jasa-laser-fiber',
    topCompetitor: 'anugerahmetal.com',
    competitorsPage1: [
      { rank: 1, name: 'PT Metal Anugerah (anugerahmetal.com)', strength: 'Kapasitas tonase pabrik' },
      { rank: 2, name: 'JasaLaserCutting.com (KITA)', strength: 'Radius Banten-Cilegon & Fiber 12kW' }
    ],
    actionPlan: 'Gusur AnugerahMetal dengan penawaran gratis sample potongan uji presisi 0.02mm.'
  },
  {
    id: 'kw-9',
    domainKey: 'tepatlaser',
    keyword: 'jasa laser cutting kota tangerang',
    location: 'Kota Tangerang',
    url: '/jasa-laser-cutting-tangerang/',
    topCompetitor: 'anugerahmetal.com',
    competitorsPage1: [
      { rank: 1, name: 'PT Metal Anugerah (anugerahmetal.com)', strength: 'Authority manufaktur plat' },
      { rank: 2, name: 'Sobat Laser (sobatlaser.com)', strength: 'Workshop Tangerang' }
    ],
    actionPlan: 'Deploy silo khusus Kawasan Industri & UMKM Kota Tangerang.'
  },
  {
    id: 'kw-10',
    domainKey: 'tepatlaser',
    keyword: 'jasa laser cutting jakarta barat',
    location: 'Jakarta Barat',
    url: '/jasa-laser-cutting-jakarta-barat/',
    topCompetitor: 'tritunggalmetal.com',
    competitorsPage1: [
      { rank: 1, name: 'Tritunggal Metal (tritunggalmetal.com)', strength: 'Spesialis metal Jakbar' },
      { rank: 2, name: 'Dania Da (daniada.com)', strength: 'Fasad & Partisi' }
    ],
    actionPlan: 'Target arsitek & kontraktor residensial Puri Indah & Kebon Jeruk.'
  },
  {
    id: 'kw-11',
    domainKey: 'tepatlaser',
    keyword: 'laser cutting gading serpong',
    location: 'Gading Serpong',
    url: '/jasa-laser-cutting-gading-serpong/',
    topCompetitor: 'lytro.id',
    competitorsPage1: [
      { rank: 1, name: 'Lytro Laser (lytro.id)', strength: 'Otoritas lokal Gading Serpong' },
      { rank: 2, name: 'Barz Laser (barz-laser.com)', strength: 'Showroom interior Serpong' }
    ],
    actionPlan: 'Optimasi landing page komersial ruko & cluster hunian Paramount/Summarecon.'
  },
  {
    id: 'kw-12',
    domainKey: 'tepatlaser',
    keyword: 'jasa laser cutting kelapa gading',
    location: 'Kelapa Gading',
    url: '/jasa-laser-cutting-kelapa-gading/',
    topCompetitor: 'easyprint.id',
    competitorsPage1: [
      { rank: 1, name: 'EasyPrint (easyprint.id)', strength: 'Retail signage Jakut' },
      { rank: 2, name: 'Laser Cutting Jakarta (lasercuttingjakarta.com)', strength: 'Pagar & ornamen metal' }
    ],
    actionPlan: 'Target perumahan mewah & bisnis retail Kelapa Gading Jakarta Utara.'
  },
  {
    id: 'kw-13',
    domainKey: 'tepatlaser',
    keyword: 'laser cutting alam sutera',
    location: 'Alam Sutera',
    url: '/jasa-laser-cutting-alam-sutera/',
    topCompetitor: 'sobatlaser.com',
    competitorsPage1: [
      { rank: 1, name: 'Sobat Laser (sobatlaser.com)', strength: 'Free delivery Tangerang' },
      { rank: 2, name: 'Lytro Laser (lytro.id)', strength: 'Partisi modern Alam Sutera' }
    ],
    actionPlan: 'Fokus pada proyek pagar laser cutting & interior ruko Jalur Sutera.'
  }
];

// Legacy manually maintained Google Ads Search Terms Intelligence vault.
// This is never LIVE data; Nadia exposes it with MANUAL provenance.
export const SEARCH_TERMS_VAULT_DATA = [
  // 1. High Intent Buyer Search Terms (Converted to Organic Silos)
  {
    id: 'st-1',
    term: 'laser cutting plat besi',
    campaign: 'AI - Jasa Laser Cutting Metal',
    category: 'buyer',
    intent: '🔥 High-Intent B2B Buyer',
    clicks: 5,
    cost: 'Rp 55.209',
    avgCpc: 'Rp 11.041',
    conversions: '3 Lead WA',
    action: 'Targeted Organik di /jasa-laser-cutting-plat-besi/ (Rank #4)',
    status: 'ACTIVE_ORGANIC'
  },
  {
    id: 'st-2',
    term: 'cutting laser terdekat',
    campaign: 'AI - Jasa Laser Cutting Metal',
    category: 'location',
    intent: '📍 Local High-Intent (Urgent)',
    clicks: 7,
    cost: 'Rp 51.402',
    avgCpc: 'Rp 7.343',
    conversions: '4 Lead WA',
    action: 'Diambil alih 15 Hub Lokasi (Bintaro Sektor 1-9 & BSD)',
    status: 'ACTIVE_ORGANIC'
  },
  {
    id: 'st-3',
    term: 'laser cut stainless steel',
    campaign: 'AI - Jasa Laser Cutting Metal',
    category: 'buyer',
    intent: '🔥 High-Intent Precision Steel',
    clicks: 2,
    cost: 'Rp 46.145',
    avgCpc: 'Rp 23.072',
    conversions: '2 Lead WA (Tiket Gede)',
    action: 'Targeted Organik di /jasa-laser-cutting-stainless/',
    status: 'ACTIVE_ORGANIC'
  },
  {
    id: 'st-4',
    term: 'jasa laser cutting terdekat',
    campaign: 'AI - Jasa Laser Cutting Metal',
    category: 'location',
    intent: '📍 Local Buyer Tangsel',
    clicks: 6,
    cost: 'Rp 39.774',
    avgCpc: 'Rp 6.629',
    conversions: '3 Lead WA',
    action: 'Targeted Organik di /lokasi/bintaro/ & /lokasi/bsd/',
    status: 'ACTIVE_ORGANIC'
  },
  {
    id: 'st-5',
    term: 'laser plat besi',
    campaign: 'AI - Jasa Laser Cutting Metal',
    category: 'buyer',
    intent: '🔥 Workshop & Tukang Las Intent',
    clicks: 5,
    cost: 'Rp 35.809',
    avgCpc: 'Rp 7.161',
    conversions: '2 Lead WA',
    action: 'Targeted Organik di jasalasercutting.com/jasa-laser-fiber',
    status: 'ACTIVE_ORGANIC'
  },
  {
    id: 'st-6',
    term: 'jasa cutting plat besi terdekat',
    campaign: 'AI - Jasa Laser Cutting Metal',
    category: 'location',
    intent: '📍 Local B2B Buyer Urgent',
    clicks: 4,
    cost: 'Rp 30.439',
    avgCpc: 'Rp 7.609',
    conversions: '2 Lead WA',
    action: 'Targeted Organik di tepatlaser.com',
    status: 'ACTIVE_ORGANIC'
  },
  {
    id: 'st-7',
    term: 'jasa cnc aluminium',
    campaign: 'Jasa Laser Cutting MDF Oktober',
    category: 'buyer',
    intent: '🔥 Industrial Machining',
    clicks: 4,
    cost: 'Rp 48.454',
    avgCpc: 'Rp 12.113',
    conversions: '1 Lead WA (Proyek Fasad)',
    action: 'Targeted Organik di jasalasercutting.com/jasa-cnc-router',
    status: 'ACTIVE_ORGANIC'
  },
  {
    id: 'st-8',
    term: 'cutting mdf',
    campaign: 'Jasa Laser Cutting MDF Oktober',
    category: 'buyer',
    intent: '🔥 Interior & Furniture Intent',
    clicks: 2,
    cost: 'Rp 41.352',
    avgCpc: 'Rp 20.676',
    conversions: '1 Lead WA',
    action: 'Targeted Organik di /jasa-laser-cutting-mdf-ai/',
    status: 'ACTIVE_ORGANIC'
  },
  {
    id: 'st-9',
    term: 'laser cutting kayu',
    campaign: 'Jasa Laser Cutting MDF Oktober',
    category: 'buyer',
    intent: '🔥 Woodwork / Handicraft',
    clicks: 3,
    cost: 'Rp 63.644',
    avgCpc: 'Rp 21.214',
    conversions: '1 Lead WA',
    action: 'Targeted Organik di /jasa-laser-cutting-mdf-ai/',
    status: 'ACTIVE_ORGANIC'
  },
  {
    id: 'st-10',
    term: 'pagar laser cutting bintaro',
    campaign: 'AI - Jasa Laser Cutting Metal',
    category: 'location',
    intent: '📍 Luxury Residential Bintaro',
    clicks: 8,
    cost: 'Rp 42.000',
    avgCpc: 'Rp 5.250',
    conversions: '4 Lead WA',
    action: 'Targeted di tepatlaser.com/produk/pagar-laser-cutting/',
    status: 'ACTIVE_ORGANIC'
  },
  {
    id: 'st-11',
    term: 'mihrab masjid laser cutting',
    campaign: 'RajaCutting Campaign',
    category: 'buyer',
    intent: '👑 High-Ticket DKM Masjid',
    clicks: 6,
    cost: 'Rp 38.000',
    avgCpc: 'Rp 6.333',
    conversions: '3 Lead WA (Rank #1 Google)',
    action: 'Ads DIBATALKAN -> Diambil Alih 100% Organik (Save Budget)',
    status: 'ANTI_CANNIBALIZED'
  },
  {
    id: 'st-12',
    term: 'fasad laser cutting acp seven',
    campaign: 'AI - Jasa Laser Cutting Metal',
    category: 'buyer',
    intent: '🔥 Arsitek & Kontraktor Gedung',
    clicks: 5,
    cost: 'Rp 45.000',
    avgCpc: 'Rp 9.000',
    conversions: '2 Lead WA',
    action: 'Targeted di jasalasercutting.com/jasa-cnc-router',
    status: 'ACTIVE_ORGANIC'
  },

  // 2. Negative Search Terms (Blocked by Rian - Anti-Boncos Shield)
  {
    id: 'st-13',
    term: 'download motif laser cutting gratis',
    campaign: 'AI - Jasa Laser Cutting Metal',
    category: 'negative',
    intent: '🚫 Zero Intent (Pencari Gratisan)',
    clicks: 0,
    cost: 'Rp 0 (Saved Rp 54.000)',
    avgCpc: 'Rp 4.500',
    conversions: '0 (100% Boncos)',
    action: 'BLOKIR NEGATIVE KEYWORD EXACT & PHRASE',
    status: 'BLOCKED_NEGATIVE'
  },
  {
    id: 'st-14',
    term: 'file dxf laser cutting free',
    campaign: 'AI - Jasa Laser Cutting Metal',
    category: 'negative',
    intent: '🚫 Zero Intent (Drafter/Mahasiswa)',
    clicks: 0,
    cost: 'Rp 0 (Saved Rp 40.500)',
    avgCpc: 'Rp 4.500',
    conversions: '0 (100% Boncos)',
    action: 'BLOKIR NEGATIVE KEYWORD EXACT & PHRASE',
    status: 'BLOCKED_NEGATIVE'
  },
  {
    id: 'st-15',
    term: 'harga mesin laser cutting fiber bekas',
    campaign: 'AI - Jasa Laser Cutting Metal',
    category: 'negative',
    intent: '🚫 Non-Buyer (Cari Jual Beli Mesin)',
    clicks: 0,
    cost: 'Rp 0 (Saved Rp 72.000)',
    avgCpc: 'Rp 6.000',
    conversions: '0 (100% Boncos)',
    action: 'BLOKIR NEGATIVE KEYWORD EXACT & PHRASE',
    status: 'BLOCKED_NEGATIVE'
  },
  {
    id: 'st-16',
    term: 'lowongan operator mesin laser cutting',
    campaign: 'AI - Jasa Laser Cutting Metal',
    category: 'negative',
    intent: '🚫 Non-Buyer (Pencari Kerja/Loker)',
    clicks: 0,
    cost: 'Rp 0 (Saved Rp 36.000)',
    avgCpc: 'Rp 4.500',
    conversions: '0 (100% Boncos)',
    action: 'BLOKIR NEGATIVE KEYWORD EXACT & PHRASE',
    status: 'BLOCKED_NEGATIVE'
  },
  {
    id: 'st-17',
    term: 'cara membuat pagar laser cutting sendiri',
    campaign: 'AI - Jasa Laser Cutting Metal',
    category: 'negative',
    intent: '🚫 DIY Tutorial / Pelajar',
    clicks: 0,
    cost: 'Rp 0 (Saved Rp 27.000)',
    avgCpc: 'Rp 4.500',
    conversions: '0 (100% Boncos)',
    action: 'BLOKIR NEGATIVE KEYWORD EXACT & PHRASE',
    status: 'BLOCKED_NEGATIVE'
  },
  {
    id: 'st-18',
    term: 'gantungan kunci akrilik 1 pcs',
    campaign: 'Jasa Laser Cutting Akrilik',
    category: 'negative',
    intent: '🚫 Eceran Receh (Low Ticket / Bouncing)',
    clicks: 0,
    cost: 'Rp 0 (Saved Rp 45.000)',
    avgCpc: 'Rp 4.500',
    conversions: '0 (100% Boncos)',
    action: 'BLOKIR NEGATIVE KEYWORD EXACT & PHRASE',
    status: 'BLOCKED_NEGATIVE'
  },
  {
    id: 'st-19',
    term: 'jual mesin laser bodor second olx',
    campaign: 'AI - Jasa Laser Cutting Metal',
    category: 'negative',
    intent: '🚫 Jual Beli Mesin Second',
    clicks: 0,
    cost: 'Rp 0 (Saved Rp 63.000)',
    avgCpc: 'Rp 7.000',
    conversions: '0 (100% Boncos)',
    action: 'BLOKIR NEGATIVE KEYWORD EXACT & PHRASE',
    status: 'BLOCKED_NEGATIVE'
  },
  {
    id: 'st-20',
    term: 'skripsi analisis kekuatan laser fiber',
    campaign: 'AI - Jasa Laser Cutting Metal',
    category: 'negative',
    intent: '🚫 Akademik / Mahasiswa',
    clicks: 0,
    cost: 'Rp 0 (Saved Rp 31.500)',
    avgCpc: 'Rp 4.500',
    conversions: '0 (100% Boncos)',
    action: 'BLOKIR NEGATIVE KEYWORD EXACT & PHRASE',
    status: 'BLOCKED_NEGATIVE'
  }
];

// ---- Live GSC cache -------------------------------------------------------

let cache = { lastAuditTimestamp: null, results: {} };

function loadCache() {
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    // No cache on disk yet (first run) — keep defaults.
  }
}
loadCache();

function saveCache() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

/**
 * Queries Google Search Console for every tracked keyword and persists the
 * result to disk. Called on a schedule from server.mjs. Never throws — a
 * failed keyword is recorded with its error message so the dashboard can
 * show it plainly instead of silently falling back to fake numbers.
 */
export async function refreshSerpData() {
  if (!isGscConfigured()) {
    throw new Error('GSC_SERVICE_ACCOUNT_JSON is not configured — see README.md "Setup Google Search Console"');
  }

  const previousResults = cache.results || {};
  const results = {};

  for (const kw of KEYWORD_TARGETS) {
    const siteUrl = SITE_MAP[kw.domainKey];
    try {
      const live = await queryKeywordPosition(siteUrl, kw.keyword);
      const previous = previousResults[kw.id];
      const previousPosition = previous && previous.found ? previous.position : null;
      results[kw.id] = {
        ...live,
        previousPosition,
        error: null,
        checkedAt: new Date().toISOString()
      };
    } catch (e) {
      results[kw.id] = {
        found: false,
        position: null,
        clicks: 0,
        impressions: 0,
        ctr: 0,
        rankingPages: [],
        dateRange: null,
        previousPosition: null,
        error: e.message,
        checkedAt: new Date().toISOString()
      };
    }
  }

  cache = { lastAuditTimestamp: new Date().toISOString(), results };
  saveCache();
  return cache;
}

function describeTrend(live) {
  if (!live) return '⏳ Belum pernah diaudit';
  if (live.error) return '⚠️ Gagal fetch GSC';
  if (!live.found) return '❓ Belum ada impression';
  if (live.previousPosition == null) return '🆕 Data pertama';
  const delta = Math.round((live.previousPosition - live.position) * 10) / 10;
  if (delta > 0.05) return `🔺 +${delta} Naik`;
  if (delta < -0.05) return `🔻 ${delta} Turun`;
  return '➖ Stabil';
}

function describePosition(live) {
  if (!live) return 'Belum Pernah Diaudit';
  if (live.error) return `Error: ${live.error}`;
  if (!live.found) return 'Tidak Ada Impression (28 Hari)';
  const rounded = Math.round(live.position);
  if (rounded <= 10) return `Top ${rounded} (Page 1)`;
  const page = Math.ceil(rounded / 10);
  return `Page ${page} (Rank ~${rounded})`;
}

function describeStatus(live) {
  if (!live) return { status: '⏳ Belum Pernah Diaudit: menunggu jadwal refresh GSC pertama', statusType: 'warning' };
  if (live.error) return { status: '⚠️ Perlu Perhatian: gagal ambil data GSC', statusType: 'warning' };
  if (!live.found) return { status: '❓ Belum Ada Data: keyword belum tercatat impression di Search Console 28 hari terakhir', statusType: 'warning' };
  const rounded = Math.round(live.position);
  if (rounded === 1) return { status: '👑 DOMINASI RANK #1', statusType: 'success' };
  if (rounded <= 3) return { status: '💎 PODIUM HALAMAN 1', statusType: 'success' };
  if (rounded <= 10) return { status: '✅ Halaman 1 Google', statusType: 'success' };
  return { status: '⚔️ Belum Halaman 1 — perlu optimasi', statusType: 'warning' };
}

/** Merges static keyword metadata with the latest cached live GSC data. */
export function getKeywordsData() {
  return KEYWORD_TARGETS.map((kw) => {
    const live = cache.results[kw.id] || null;
    const { status, statusType } = describeStatus(live);
    return {
      ...kw,
      domainName: DOMAIN_NAMES[kw.domainKey],
      liveData: !!(live && live.found),
      rankNumber: live && live.found ? live.position : null,
      clicks: live ? live.clicks : null,
      impressions: live ? live.impressions : null,
      ctr: live ? live.ctr : null,
      rankingUrls: live?.rankingPages || (live?.page ? [{
        url: live.page,
        clicks: live.clicks || 0,
        impressions: live.impressions || 0,
        ctr: live.ctr || 0,
        position: live.position
      }] : []),
      dateRange: live?.dateRange || null,
      lastChecked: live ? live.checkedAt : null,
      dataError: live ? live.error : null,
      position: describePosition(live),
      trend: describeTrend(live),
      status,
      statusType
    };
  });
}

export function getAuditSummary() {
  const keywords = getKeywordsData();
  const total = keywords.length;
  const withData = keywords.filter((k) => k.liveData);
  const page1 = withData.filter((k) => Math.round(k.rankNumber) <= 10).length;
  const top3 = withData.filter((k) => Math.round(k.rankNumber) <= 3).length;
  const noData = total - withData.length;

  return {
    dataSource: cache.lastAuditTimestamp ? 'google_search_console' : 'GSC_NOT_AVAILABLE',
    dataStatus: cache.lastAuditTimestamp ? 'CACHED' : 'UNAVAILABLE',
    fetchedAt: cache.lastAuditTimestamp,
    configured: isGscConfigured(),
    totalKeywords: total,
    page1Count: page1,
    top3Count: top3,
    noDataCount: noData,
    page1Percentage: total ? Math.round((page1 / total) * 100) + '%' : '0%',
    lastAuditTimestamp: cache.lastAuditTimestamp
      ? new Date(cache.lastAuditTimestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB'
      : 'Belum pernah di-audit'
  };
}

export function getGscCacheSnapshot() {
  const queries = {};
  for (const target of KEYWORD_TARGETS) {
    const live = cache.results?.[target.id];
    if (!live || live.error) continue;
    queries[target.keyword.toLowerCase()] = {
      clicks: live.clicks || 0,
      impressions: live.impressions || 0,
      ctr: live.impressions ? (live.clicks || 0) / live.impressions : null,
      position: live.position ?? null,
      rankingUrls: live.rankingPages || (live.page ? [{
        url: live.page,
        clicks: live.clicks || 0,
        impressions: live.impressions || 0,
        ctr: live.impressions ? (live.clicks || 0) / live.impressions : 0,
        position: live.position
      }] : []),
      dateRange: live.dateRange || null,
      checkedAt: live.checkedAt || cache.lastAuditTimestamp
    };
  }
  return { lastAuditTimestamp: cache.lastAuditTimestamp, queries };
}

export { isGscConfigured };
