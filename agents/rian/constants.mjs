export const RIAN_PERMISSIONS = Object.freeze([
  'READ_GOOGLE_ADS_SEARCH_TERMS',
  'ANALYZE',
  'CLASSIFY_WASTED_SPEND',
  'BUILD_NEGATIVE_KEYWORD_LIST',
  'ESTIMATE_BUDGET_SAVINGS',
  'EXPORT_NEGATIVE_KEYWORDS'
]);

export const RIAN_DENIED_CAPABILITIES = Object.freeze([
  'ADD_NEGATIVE_KEYWORDS',
  'CHANGE_GOOGLE_ADS_BUDGET',
  'PAUSE_CAMPAIGN',
  'EDIT_WEBSITE',
  'MERGE_PR',
  'DEPLOY_PRODUCTION'
]);

export const RIAN_IDENTITY = Object.freeze({
  id: 'ppc-architect-r',
  name: 'Rian',
  avatar: '🛡️',
  color: '#ff3b3b',
  version: '1.0.0',
  role: 'PPC Architect & Budget Auditor',
  goal: 'Audit Google Ads search terms, unmask wasted spend, and propose negative keyword lists that protect budget from boncos clicks.',
  mode: 'DETERMINISTIC_RULE_ENGINE',
  permissions: RIAN_PERMISSIONS,
  deniedCapabilities: RIAN_DENIED_CAPABILITIES
});

// Categories of non-buyer search-term waste Rian recognizes in the Search
// Terms Vault. Each entry carries the keyword signals used to classify a
// wasted search term into that bucket (see search_terms.mjs classifyWasteCategory).
export const WASTE_CATEGORIES = Object.freeze({
  EMPLOYMENT: Object.freeze({
    key: 'EMPLOYMENT',
    label: 'Pencari Kerja / Loker',
    keywords: Object.freeze(['lowongan', 'loker', 'operator', 'gaji', 'karyawan', 'karir'])
  }),
  USED_MACHINES: Object.freeze({
    key: 'USED_MACHINES',
    label: 'Jual Beli Mesin Bekas',
    keywords: Object.freeze(['mesin bekas', 'mesin second', 'jual mesin', 'harga mesin', 'olx', 'second'])
  }),
  DIY: Object.freeze({
    key: 'DIY',
    label: 'Tutorial DIY / Belajar Sendiri',
    keywords: Object.freeze(['cara membuat', 'sendiri', 'tutorial', 'diy', 'belajar'])
  }),
  IRRELEVANT: Object.freeze({
    key: 'IRRELEVANT',
    label: 'Tidak Relevan (Gratisan / Akademik / Eceran)',
    keywords: Object.freeze(['gratis', 'free', 'download', 'dxf', 'skripsi', 'akademik', 'mahasiswa', 'pcs', 'eceran'])
  })
});

export const NEGATIVE_MATCH_TYPES = Object.freeze({
  EXACT: 'EXACT',
  PHRASE: 'PHRASE'
});

export const DATA_STATUSES = Object.freeze({
  LIVE: 'LIVE',
  CACHED: 'CACHED',
  MANUAL: 'MANUAL',
  DERIVED: 'DERIVED',
  UNAVAILABLE: 'UNAVAILABLE'
});
