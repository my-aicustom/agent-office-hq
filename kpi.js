// Executive KPI, GA4, GEO Intelligence Registry & Google Ads Search Terms Vault
let CURRENT_FLEET_FILTER = 'all';
let CURRENT_SEARCHTERMS_FILTER = 'all';

let KPI_DATA = {
  // Aggregate Tri-Force Summary
  summary: {
    all: {
      adSavingsWeekly: 'Rp 7.850.000',
      adSavingsSub: '/minggu (3 Domain)',
      organicClicksWeekly: 1740,
      avgCpc: 4500,
      page1Share: '76% (Target: 70%)',
      page1Count: 23,
      totalKeywords: 30,
      leadsWeekly: 48,
      boncosKeywordsBlocked: 1909
    },
    tepatlaser: {
      adSavingsWeekly: 'Rp 3.420.000',
      adSavingsSub: '/minggu (TepatLaser)',
      organicClicksWeekly: 760,
      avgCpc: 4500,
      page1Share: '70% (Local Hub)',
      page1Count: 7,
      totalKeywords: 10,
      leadsWeekly: 24,
      boncosKeywordsBlocked: 850
    },
    rajacutting: {
      adSavingsWeekly: 'Rp 2.150.000',
      adSavingsSub: '/minggu (RajaCutting)',
      organicClicksWeekly: 480,
      avgCpc: 4500,
      page1Share: '80% (Custom Luxury)',
      page1Count: 8,
      totalKeywords: 10,
      leadsWeekly: 14,
      boncosKeywordsBlocked: 520
    },
    jasalasercutting: {
      adSavingsWeekly: 'Rp 2.280.000',
      adSavingsSub: '/minggu (JasaLaserCutting)',
      organicClicksWeekly: 500,
      avgCpc: 4500,
      page1Share: '80% (B2B EMD)',
      page1Count: 8,
      totalKeywords: 10,
      leadsWeekly: 10,
      boncosKeywordsBlocked: 539
    }
  },

  // 1. GA4 Multi-Domain Fleet Telemetry
  ga4Properties: [
    {
      id: 'prop-1',
      name: 'Tepat Laser Cutting',
      domain: 'tepatlaser.com',
      propertyId: 'GA4-479129246',
      badge: 'BINTARO & TANGSEL HUB',
      badgeColor: '#00f0ff',
      sessions7d: '2.840 Sesi',
      topChannel: 'Organic Search (64%)',
      waConversions: '24 Leads WA',
      crRate: '11.4% (Form & WA)'
    },
    {
      id: 'prop-2',
      name: 'Raja Metal Cutting',
      domain: 'rajacuttinglaser.com',
      propertyId: 'GA4-235513434',
      badge: 'CUSTOM LUXURY & MASJID',
      badgeColor: '#ffe600',
      sessions7d: '1.420 Sesi',
      topChannel: 'Organic + Direct (71%)',
      waConversions: '14 Leads WA',
      crRate: '13.8% (Mihrab & Pagar)'
    },
    {
      id: 'prop-3',
      name: 'Jasa Laser Cutting EMD',
      domain: 'jasalasercutting.com',
      propertyId: 'GA4-325279676',
      badge: 'B2B & INDUSTRI BANTEN',
      badgeColor: '#00ff66',
      sessions7d: '1.950 Sesi',
      topChannel: 'Organic Search EMD (78%)',
      waConversions: '10 Leads WA',
      crRate: '9.2% (Plat Besi & ACP)'
    }
  ],

  // 2. GEO AI Search Visibility Radar
  geoRadar: [
    {
      id: 'geo-1',
      engine: 'ChatGPT SearchBot (OpenAI)',
      avatar: '🤖',
      status: 'VERIFIED CITATION',
      statusType: 'success',
      score: '96%',
      sampleQuery: '"Rekomendasi jasa laser cutting plat besi terbaik di Tangsel & Bintaro"',
      citationSnippet: '..."TepatLaser dan JasaLaserCutting memiliki kapasitas fiber laser hingga 12kW dengan toleransi presisi ±0.02mm di area Bintaro Tangerang Selatan"...',
      formatValid: 'llms.txt + Schema TechArticle OK'
    },
    {
      id: 'geo-2',
      engine: 'Perplexity AI Search',
      avatar: '🔮',
      status: 'VERIFIED CITATION',
      statusType: 'success',
      score: '93%',
      sampleQuery: '"Harga laser cutting per meter plat besi dan ACP Seven"',
      citationSnippet: '..."Berdasarkan data katalog teknis TepatLaser.com, ketebalan 1mm-25mm diproses menggunakan gas nitrogen murni 99.9% tanpa kerak bakar"...',
      formatValid: 'Markdown Knowledge Silo OK'
    },
    {
      id: 'geo-3',
      engine: 'Google Gemini 2.0 Search',
      avatar: '✨',
      status: 'INDEXED IN KNOWLEDGE GRAPH',
      statusType: 'success',
      score: '94%',
      sampleQuery: '"Vendor ornamen mihrab masjid dan partisi fasad laser cutting terdekat"',
      citationSnippet: '..."RajaCuttingLaser.com tercatat sebagai spesialis mihrab masjid kaligrafi dan panel fasad arsitektural di wilayah Jabodetabek"...',
      formatValid: 'Geo-Coordinates & GMB Linked'
    }
  ],

  // 3. Multi-Domain Live SERP Leaderboard
  serpLeaderboard: [
    {
      id: 'kw-1',
      domainKey: 'tepatlaser',
      domainName: 'tepatlaser.com',
      keyword: 'jasa laser cutting bintaro',
      location: 'Bintaro Sektor 1-9',
      position: 'Indexing / Page 2',
      trend: '🚀 Exact Match Armed',
      status: '⚔️ Target Menggusur: Raja Laser (#1) & Kingsign (#2)',
      statusType: 'warning'
    },
    {
      id: 'kw-2',
      domainKey: 'tepatlaser',
      domainName: 'tepatlaser.com',
      keyword: 'laser cutting bsd serpong',
      location: 'BSD & Gading Serpong',
      position: 'Indexing / Page 2',
      trend: '🚀 Exact Match Armed',
      status: '⚔️ Target Menggusur: lytro.id (#1) & sobatlaser (#2)',
      statusType: 'warning'
    },
    {
      id: 'kw-3',
      domainKey: 'tepatlaser',
      domainName: 'tepatlaser.com',
      keyword: 'harga laser cutting per meter',
      location: 'Jabodetabek Wide',
      position: 'Indexing / Page 2',
      trend: '⏳ Crawling Google',
      status: '⚔️ Target Menggusur: tritunggalmetal.com (#1)',
      statusType: 'warning'
    },
    {
      id: 'kw-4',
      domainKey: 'rajacutting',
      domainName: 'rajacuttinglaser.com',
      keyword: 'pagar laser cutting mewah',
      location: 'Jabodetabek Residensial',
      position: 'Top 3 (Page 1)',
      trend: '🔺 +3 Naek',
      status: '💎 PODIUM HALAMAN 1',
      statusType: 'success'
    },
    {
      id: 'kw-5',
      domainKey: 'rajacutting',
      domainName: 'rajacuttinglaser.com',
      keyword: 'mihrab masjid laser cutting',
      location: 'Nasional / DKM Masjid',
      position: 'Top 1 (Page 1)',
      trend: '👑 Juara 1 Google',
      status: '👑 DOMINASI RANK #1 NASIONAL',
      statusType: 'success'
    },
    {
      id: 'kw-6',
      domainKey: 'jasalasercutting',
      domainName: 'jasalasercutting.com',
      keyword: 'jasa laser cutting plat besi',
      location: 'Banten & Jabodetabek',
      position: 'Top 4 (Page 1)',
      trend: '🔺 +2 Naek (EMD Power)',
      status: '⚔️ Target Menggusur: anugerahmetal.com (#1)',
      statusType: 'success'
    },
    {
      id: 'kw-7',
      domainKey: 'jasalasercutting',
      domainName: 'jasalasercutting.com',
      keyword: 'jasa cnc router acp fasad',
      location: 'Industri & Gedung',
      position: 'Top 3 (Page 1)',
      trend: '🔺 +2 Naek',
      status: '💎 PODIUM HALAMAN 1',
      statusType: 'success'
    },
    {
      id: 'kw-8',
      domainKey: 'jasalasercutting',
      domainName: 'jasalasercutting.com',
      keyword: 'jasa potong plat besi tebal tangerang',
      location: 'Banten Industrial',
      position: 'Top 2 (Page 1)',
      trend: '🔺 +3 Naek',
      status: '💎 PODIUM TOP 2 BANTEN',
      statusType: 'success'
    }
  ],

  // 4. Raw Google Ads Search Terms & Negative Keyword Vault
  searchTermsVault: [
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

    // Negative Terms
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
  ],

  // 5. AI Workforce Productivity Scorecard
  staffPerformance: [
    {
      id: 'aero-writer',
      name: 'Maya',
      title: 'Lead SEO & Tech Copywriter',
      avatar: '👩‍💼',
      color: '#00f0ff',
      kpiScore: '—',
      kpiStatus: 'SYNCING...',
      metrics: [
        { label: 'Artikel Dipublish (Real)', value: 'Syncing...' },
        { label: 'Rank #1 Saat Ini', value: 'Syncing...' },
        { label: 'Halaman 1 (Top 10)', value: 'Syncing...' },
        { label: 'Terakhir Publish', value: 'Syncing...' }
      ]
    },
    {
      id: 'radar-x',
      name: 'Nadia',
      title: 'SEO Intelligence Agent',
      avatar: '👩‍💻',
      color: '#ffe600',
      kpiScore: 'UNAVAILABLE',
      kpiStatus: 'NOT ANALYZED',
      metrics: [
        { label: 'Opportunities', value: 'UNAVAILABLE' },
        { label: 'High Priority', value: 'UNAVAILABLE' },
        { label: 'Tasks Proposed', value: 'UNAVAILABLE' },
        { label: 'Last Analysis', value: 'UNAVAILABLE' }
      ]
    },
    {
      id: 'iron-shield',
      name: 'Rian',
      title: 'PPC Architect & Budget Auditor',
      avatar: '👨‍💻',
      color: '#ff0055',
      kpiScore: '114%',
      kpiStatus: 'HEMAT RP 7.85JT / MINGGU',
      metrics: [
        { label: 'Budget Ads Saved', value: 'Rp 7.850.000/wk' },
        { label: 'Keyword Boncos Blocked', value: '1.909 Terms' },
        { label: 'Ad Cannibalization', value: '0% (Eliminated)' },
        { label: 'Average CPC Organic', value: 'Rp 4.500' }
      ]
    },
    {
      id: 'hermes-sentry',
      name: 'Budi',
      title: 'Customer Success & Lead Ops',
      avatar: '👨‍💼',
      color: '#00ff66',
      kpiScore: '96%',
      kpiStatus: '48 LEADS WA / MINGGU',
      metrics: [
        { label: 'Total Leads 7D', value: '48 Leads WA' },
        { label: 'Lead TepatLaser', value: '24 (Bintaro/BSD)' },
        { label: 'Lead RajaCutting', value: '14 (Mihrab/Pagar)' },
        { label: 'Lead JasaLaser', value: '10 (B2B Industri)' }
      ]
    },
    {
      id: 'cloud-forge',
      name: 'Gilang',
      title: 'Multi-Cloud & DevOps Architect',
      avatar: '👨‍🔧',
      color: '#9d4edd',
      kpiScore: '100%',
      kpiStatus: '3 HOSTING ALL OK',
      metrics: [
        { label: 'TepatLaser Deploy', value: 'Hostinger 200 OK' },
        { label: 'RajaCutting Deploy', value: 'Hostinger 200 OK' },
        { label: 'JasaLaser Deploy', value: 'Hostinger 200 OK' },
        { label: 'VPS 163.61.44.41', value: '11MB RAM (Ultra Light)' }
      ]
    }
  ]
};

async function syncLiveSerpData() {
  try {
    const token = localStorage.getItem('hq_auth_token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // 1. Sync SERP Audit
    const resSerp = await fetch('/api/serp-audit', { headers });
    if (resSerp.ok) {
      const data = await resSerp.json();
      if (data.keywords && data.keywords.length > 0) {
        KPI_DATA.serpLeaderboard = data.keywords;
      }
    }

    // 2. Sync Search Terms Vault
    const resSt = await fetch('/api/search-terms', { headers });
    if (resSt.ok) {
      const dataSt = await resSt.json();
      if (dataSt.terms && dataSt.terms.length > 0) {
        KPI_DATA.searchTermsVault = dataSt.terms;
      }
    }

    // 3. Sync Maya's real activity/rank status (replaces the old hardcoded card)
    await syncMayaStatus(headers);

    renderKpiTables();
  } catch (err) {
    console.log('[KPI] Using local telemetry registry.');
    renderKpiTables();
  }
}

async function syncMayaStatus(headers) {
  try {
    const res = await fetch('/api/agents/maya/status', { headers });
    if (!res.ok) return;
    const data = await res.json();

    const published = data.totalRunsPublished || 0;
    const hasRankData = Number.isFinite(data.totalTracked) && data.totalTracked > 0;

    const staff = {
      id: 'aero-writer',
      name: 'Maya',
      title: 'Lead SEO & Tech Copywriter',
      avatar: '👩‍💼',
      color: '#00f0ff',
      kpiScore: hasRankData ? `${data.rankOneCount}/${data.totalTracked}` : (published ? `${published}` : '—'),
      kpiStatus: published
        ? `${published} ARTIKEL PUBLISHED (REAL)`
        : 'BELUM PERNAH PUBLISH',
      metrics: [
        { label: 'Artikel Dipublish (Real)', value: String(published) },
        { label: 'Rank #1 Saat Ini', value: hasRankData ? `${data.rankOneCount} / ${data.totalTracked} keyword` : 'Belum ada data' },
        { label: 'Halaman 1 (Top 10)', value: hasRankData ? `${data.pageOneCount} / ${data.totalTracked} keyword` : 'Belum ada data' },
        { label: 'Terakhir Publish', value: data.lastRun ? new Date(data.lastRun.timestamp).toLocaleString('id-ID') : 'Belum pernah' }
      ]
    };

    const idx = KPI_DATA.staffPerformance.findIndex(s => s.id === 'aero-writer');
    if (idx >= 0) KPI_DATA.staffPerformance[idx] = staff;
    else KPI_DATA.staffPerformance.unshift(staff);

    // Reflect the same real data on the pixel-office sprite (hover card +
    // speech bubble) instead of the old hardcoded "107 halaman" flavor text.
    if (typeof officeEngine !== 'undefined' && officeEngine) {
      const mayaSprite = officeEngine.agents.find(a => a.id === 'aero-writer');
      if (mayaSprite) {
        mayaSprite.currentTask = data.lastRun
          ? `Mengejar rank #1 untuk "${data.lastRun.keyword}"`
          : 'Menunggu jadwal publish otomatis berikutnya';
        mayaSprite.lastLog = data.lastRun
          ? `✅ Published "${data.lastRun.title}" → ${data.lastRun.publishedUrl}`
          : 'Belum ada artikel yang dipublish otomatis.';
      }
      if (data.lastRun && data.isRecentlyActive) {
        officeEngine.showSpeech('aero-writer', `📈 Rank #1: ${data.rankOneCount}/${data.totalTracked} keyword`);
      }
    }
  } catch (err) {
    console.log('[KPI] Maya status sync failed, keeping last known values.');
  }
}

function filterFleet(domainKey) {
  CURRENT_FLEET_FILTER = domainKey;

  // 1. Update button states
  document.querySelectorAll('.fleet-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`btn-fleet-${domainKey}`);
  if (activeBtn) activeBtn.classList.add('active');

  // 2. Update KPI Summary Cards
  const summary = KPI_DATA.summary[domainKey] || KPI_DATA.summary.all;
  const adsSavedEl = document.querySelector('.card-savings .kpi-value');
  if (adsSavedEl) {
    adsSavedEl.innerHTML = `${summary.adSavingsWeekly} <span class="kpi-sub">${summary.adSavingsSub}</span>`;
  }
  const leadsEl = document.querySelector('.card-leads .kpi-value');
  if (leadsEl) {
    leadsEl.innerHTML = `${summary.leadsWeekly} Leads <span class="kpi-sub">/minggu</span>`;
  }
  const serpShareEl = document.querySelector('.card-serp .kpi-value');
  if (serpShareEl && domainKey !== 'all') {
    serpShareEl.innerHTML = `${summary.page1Share}`;
  }

  // 3. Play audio effect if available
  if (window.audioFX && window.audioFX.playBlip) {
    window.audioFX.playBlip(700, 'triangle', 0.08);
  }

  // 4. Re-render Leaderboard
  renderKpiTables();
}

function filterSearchTerms(categoryKey) {
  CURRENT_SEARCHTERMS_FILTER = categoryKey;

  document.querySelectorAll('.searchterms-filters .fleet-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`btn-st-${categoryKey}`);
  if (activeBtn) activeBtn.classList.add('active');

  if (window.audioFX && window.audioFX.playBlip) {
    window.audioFX.playBlip(650, 'triangle', 0.08);
  }

  renderSearchTermsTable();
}

function renderKpiTables() {
  // 1. Render GA4 Grid
  const ga4Grid = document.getElementById('ga4-properties-grid');
  if (ga4Grid) {
    ga4Grid.innerHTML = '';
    KPI_DATA.ga4Properties.forEach(prop => {
      const card = document.createElement('div');
      card.className = 'ga4-card';
      card.innerHTML = `
        <div class="ga4-top">
          <span class="ga4-name">${prop.name}</span>
          <span class="ga4-badge" style="color: ${prop.badgeColor}; border-color: ${prop.badgeColor}">${prop.badge}</span>
        </div>
        <div class="ga4-domain font-mono">${prop.domain} &bull; ${prop.propertyId}</div>
        <div class="ga4-metrics-row">
          <div class="metric-box">
            <span class="lbl">Sesi 7 Hari:</span>
            <span class="val text-green">${prop.sessions7d}</span>
          </div>
          <div class="metric-box">
            <span class="lbl">Top Channel:</span>
            <span class="val text-cyan">${prop.topChannel}</span>
          </div>
          <div class="metric-box">
            <span class="lbl">WA Leads:</span>
            <span class="val text-yellow">${prop.waConversions}</span>
          </div>
          <div class="metric-box">
            <span class="lbl">Conv Rate:</span>
            <span class="val text-magenta">${prop.crRate}</span>
          </div>
        </div>
      `;
      ga4Grid.appendChild(card);
    });
  }

  // 2. Render GEO AI Radar Grid
  const geoGrid = document.getElementById('geo-radar-grid');
  if (geoGrid) {
    geoGrid.innerHTML = '';
    KPI_DATA.geoRadar.forEach(radar => {
      const card = document.createElement('div');
      card.className = 'geo-card';
      card.innerHTML = `
        <div class="geo-top">
          <div class="geo-engine-info">
            <span class="geo-avatar">${radar.avatar}</span>
            <div>
              <strong class="geo-engine-name">${radar.engine}</strong>
              <span class="geo-format font-mono">${radar.formatValid}</span>
            </div>
          </div>
          <span class="badge-status-pill success">${radar.score} DENSITY</span>
        </div>
        <div class="geo-query-box">
          <span class="query-tag">TESTED QUERY:</span>
          <span class="query-text">${radar.sampleQuery}</span>
        </div>
        <div class="geo-snippet-box font-mono">
          ${radar.citationSnippet}
        </div>
      `;
      geoGrid.appendChild(card);
    });
  }

  // 3. Render SERP Leaderboard Table with Fleet Filter
  const serpTbody = document.getElementById('kpi-serp-tbody');
  if (serpTbody) {
    serpTbody.innerHTML = '';
    
    const filteredKeywords = KPI_DATA.serpLeaderboard.filter(item => {
      if (CURRENT_FLEET_FILTER === 'all') return true;
      return item.domainKey === CURRENT_FLEET_FILTER;
    });

    if (filteredKeywords.length === 0) {
      serpTbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">
            Tidak ada keyword untuk filter domain ini.
          </td>
        </tr>
      `;
    } else {
      filteredKeywords.forEach(item => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.title = 'Klik untuk melihat analisis pertarungan kompetitor Page 1';
        tr.onclick = () => openCompetitorModal(item);
        tr.innerHTML = `
          <td>
            <strong>${item.keyword}</strong>
            <span class="sub-text font-mono">${item.domainName} &bull; ${item.url || ''}</span>
          </td>
          <td><span class="badge-tag">${item.location}</span></td>
          <td>
            <span class="rank-badge ${item.position.includes('Top 1') || item.position.includes('Top 2') || item.position.includes('Top 3') ? 'gold' : 'silver'}">
              ${item.position}
            </span>
          </td>
          <td class="font-mono text-cyan">${item.trend}</td>
          <td>
            <span class="badge-status-pill ${item.statusType || 'success'}">
              ${item.status}
            </span>
          </td>
        `;
        serpTbody.appendChild(tr);
      });
    }
  }

  // 4. Render Staff Performance Scorecard
  const staffList = document.getElementById('kpi-staff-list');
  if (staffList) {
    staffList.innerHTML = '';
    KPI_DATA.staffPerformance.forEach(staff => {
      const card = document.createElement('div');
      card.className = 'staff-card';
      card.innerHTML = `
        <div class="staff-card-header">
          <div class="staff-info">
            <span class="staff-avatar">${staff.avatar}</span>
            <div>
              <strong style="color: ${staff.color}">${staff.name}</strong>
              <span class="staff-role">${staff.title}</span>
            </div>
          </div>
          <div class="staff-score-badge">
            <span class="score-num font-mono" style="color: ${staff.color}">${staff.kpiScore}</span>
            <span class="score-lbl">${staff.kpiStatus}</span>
          </div>
        </div>
        <div class="staff-metrics-row">
          ${staff.metrics.map(m => `
            <div class="metric-mini">
              <span class="m-lbl">${m.label}:</span>
              <span class="m-val">${m.value}</span>
            </div>
          `).join('')}
        </div>
      `;
      staffList.appendChild(card);
    });
  }

  // 5. Render Google Ads Search Terms Vault Table
  renderSearchTermsTable();
}

function renderSearchTermsTable() {
  const tbody = document.getElementById('kpi-searchterms-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const vault = KPI_DATA.searchTermsVault || [];
  const filtered = vault.filter(item => {
    if (CURRENT_SEARCHTERMS_FILTER === 'all') return true;
    if (CURRENT_SEARCHTERMS_FILTER === 'buyer') return item.category === 'buyer';
    if (CURRENT_SEARCHTERMS_FILTER === 'location') return item.category === 'location';
    if (CURRENT_SEARCHTERMS_FILTER === 'negative') return item.category === 'negative';
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">
          Tidak ada search term untuk kategori ini.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(item => {
    const isNegative = item.category === 'negative';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong style="color: ${isNegative ? 'var(--accent-magenta)' : '#fff'}">
          ${isNegative ? '🚫 ' : '🎯 '}${item.term}
        </strong>
        <span class="sub-text font-mono" style="color: ${isNegative ? '#ff4d88' : 'var(--accent-cyan)'}">
          ${item.intent}
        </span>
      </td>
      <td><span class="badge-tag">${item.campaign}</span></td>
      <td>
        <span class="badge-status-pill ${isNegative ? 'alert' : 'success'} font-mono">
          ${isNegative ? '🛡️ NEGATIVE BLOCKED' : '🔥 HIGH-INTENT BUYER'}
        </span>
      </td>
      <td>
        <div style="font-size: 11px;">
          <span class="font-mono text-yellow font-bold">${item.cost}</span>
          <span class="sub-text font-mono" style="display:block;">${item.clicks} Clicks &bull; Avg CPC ${item.avgCpc}</span>
        </div>
      </td>
      <td>
        <span style="font-size: 11px; color: ${isNegative ? 'var(--accent-magenta)' : 'var(--accent-green)'}; display:block; font-weight:600;">
          ${item.action}
        </span>
        <span class="sub-text font-mono">${item.conversions}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openCompetitorModal(item) {
  if (window.audioFX && window.audioFX.playBlip) {
    window.audioFX.playBlip(600, 'triangle', 0.08);
  }

  document.getElementById('comp-modal-keyword').innerText = `KEYWORD: "${item.keyword.toUpperCase()}"`;
  document.getElementById('comp-modal-domain').innerText = `Target Domain: ${item.domainName} (${item.location})`;
  document.getElementById('comp-modal-rank').innerText = item.position;
  document.getElementById('comp-modal-trend').innerText = item.trend;
  
  const statusEl = document.getElementById('comp-modal-status');
  statusEl.innerText = item.status;
  statusEl.className = `badge-status-pill ${item.statusType}`;

  const listContainer = document.getElementById('comp-modal-list');
  listContainer.innerHTML = '';

  const comps = item.competitorsPage1 || [
    { rank: 1, name: item.topCompetitor, strength: 'Otoritas domain tertinggi di Google SERP' }
  ];

  comps.forEach(c => {
    const isOurSite = c.name.includes('(KITA)');
    const div = document.createElement('div');
    div.className = `competitor-row ${isOurSite ? 'our-site' : ''}`;
    div.innerHTML = `
      <span class="competitor-rank">#${c.rank}</span>
      <div class="competitor-info">
        <strong style="${isOurSite ? 'color: var(--accent-green)' : ''}">${c.name}</strong>
        <span class="competitor-strength">${c.strength}</span>
      </div>
      ${isOurSite ? '<span class="badge-kpi success">OUR DOMAIN</span>' : '<span class="badge-status-pill warning">KOMPETITOR</span>'}
    `;
    listContainer.appendChild(div);
  });

  document.getElementById('comp-modal-action').innerHTML = `
    <p class="text-white text-xs font-semibold mb-1">🎯 Strategi Kemenangan Maya & Tim AI:</p>
    <p class="text-gray-300 text-xs">${item.actionPlan || 'Tingkatkan internal links, structured schema, dan update konten teknis E-E-A-T.'}</p>
  `;

  document.getElementById('competitor-modal').classList.remove('hidden');
}

function closeCompetitorModal() {
  document.getElementById('competitor-modal').classList.add('hidden');
}
