import assert from 'node:assert/strict';
import test from 'node:test';

import { RianAgent, rianAgent } from '../agents/rian/agent.mjs';
import { RIAN_IDENTITY, WASTE_CATEGORIES } from '../agents/rian/constants.mjs';
import { buildNegativeKeywordLists, calculateSavings, identifyWastedTerms } from '../agents/rian/negative_builder.mjs';
import {
  classifyWasteCategory,
  loadSearchTerms,
  normalizeSearchTerm,
  parseRupiah,
  parseSavedRupiah,
  summarizeSearchTerms
} from '../agents/rian/search_terms.mjs';

// A small fixture mirroring the shape of SEARCH_TERMS_VAULT_DATA, covering
// one term per waste category plus two active (non-wasted) buyer terms.
const FIXTURE_TERMS = [
  {
    id: 'fx-1',
    term: 'laser cutting plat besi',
    campaign: 'Fixture Campaign',
    category: 'buyer',
    intent: 'High-Intent Buyer',
    clicks: 5,
    cost: 'Rp 55.209',
    avgCpc: 'Rp 11.041',
    conversions: '3 Lead WA',
    action: 'Targeted Organik',
    status: 'ACTIVE_ORGANIC'
  },
  {
    id: 'fx-2',
    term: 'cutting laser terdekat',
    campaign: 'Fixture Campaign',
    category: 'location',
    intent: 'Local High-Intent',
    clicks: 7,
    cost: 'Rp 51.402',
    avgCpc: 'Rp 7.343',
    conversions: '4 Lead WA',
    action: 'Targeted Organik',
    status: 'ACTIVE_ORGANIC'
  },
  {
    id: 'fx-3',
    term: 'lowongan operator mesin laser cutting',
    campaign: 'Fixture Campaign',
    category: 'negative',
    intent: 'Non-Buyer (Loker)',
    clicks: 0,
    cost: 'Rp 0 (Saved Rp 36.000)',
    avgCpc: 'Rp 4.500',
    conversions: '0',
    action: 'BLOKIR NEGATIVE KEYWORD',
    status: 'BLOCKED_NEGATIVE'
  },
  {
    id: 'fx-4',
    term: 'harga mesin laser cutting fiber bekas',
    campaign: 'Fixture Campaign',
    category: 'negative',
    intent: 'Non-Buyer (Jual Beli Mesin)',
    clicks: 0,
    cost: 'Rp 0 (Saved Rp 72.000)',
    avgCpc: 'Rp 6.000',
    conversions: '0',
    action: 'BLOKIR NEGATIVE KEYWORD',
    status: 'BLOCKED_NEGATIVE'
  },
  {
    id: 'fx-5',
    term: 'cara membuat pagar laser cutting sendiri',
    campaign: 'Fixture Campaign',
    category: 'negative',
    intent: 'DIY Tutorial',
    clicks: 0,
    cost: 'Rp 0 (Saved Rp 27.000)',
    avgCpc: 'Rp 4.500',
    conversions: '0',
    action: 'BLOKIR NEGATIVE KEYWORD',
    status: 'BLOCKED_NEGATIVE'
  },
  {
    id: 'fx-6',
    term: 'skripsi analisis kekuatan laser fiber',
    campaign: 'Fixture Campaign',
    category: 'negative',
    intent: 'Akademik',
    clicks: 0,
    cost: 'Rp 0 (Saved Rp 31.500)',
    avgCpc: 'Rp 4.500',
    conversions: '0',
    action: 'BLOKIR NEGATIVE KEYWORD',
    status: 'BLOCKED_NEGATIVE'
  },
  {
    id: 'fx-7',
    // Wasted term (negative status) that matches none of the specific
    // keyword buckets — must fall back to IRRELEVANT rather than crash.
    term: 'zzz totally unrelated query',
    campaign: 'Fixture Campaign',
    category: 'negative',
    intent: 'Unknown',
    clicks: 0,
    cost: 'Rp 0 (Saved Rp 10.000)',
    avgCpc: 'Rp 4.500',
    conversions: '0',
    action: 'BLOKIR NEGATIVE KEYWORD',
    status: 'BLOCKED_NEGATIVE'
  }
];

// ---- parseRupiah / parseSavedRupiah ---------------------------------------

test('parseRupiah extracts integer amounts from Rupiah strings', () => {
  assert.equal(parseRupiah('Rp 55.209'), 55209);
  assert.equal(parseRupiah('Rp 0 (Saved Rp 54.000)'), 0);
  assert.equal(parseRupiah('Rp 1.234.567'), 1234567);
  assert.equal(parseRupiah('not a rupiah string'), 0);
  assert.equal(parseRupiah(null), 0);
  assert.equal(parseRupiah(undefined), 0);
});

test('parseSavedRupiah extracts the saved amount from a blocked term cost string', () => {
  assert.equal(parseSavedRupiah('Rp 0 (Saved Rp 54.000)'), 54000);
  assert.equal(parseSavedRupiah('Rp 55.209'), 0);
  assert.equal(parseSavedRupiah(null), 0);
});

// ---- classifyWasteCategory --------------------------------------------------

test('classifyWasteCategory detects employment (loker) search terms', () => {
  assert.equal(classifyWasteCategory('lowongan operator mesin laser cutting'), WASTE_CATEGORIES.EMPLOYMENT.key);
});

test('classifyWasteCategory detects used-machine search terms', () => {
  assert.equal(classifyWasteCategory('harga mesin laser cutting fiber bekas'), WASTE_CATEGORIES.USED_MACHINES.key);
  assert.equal(classifyWasteCategory('jual mesin laser bodor second olx'), WASTE_CATEGORIES.USED_MACHINES.key);
});

test('classifyWasteCategory detects DIY tutorial search terms', () => {
  assert.equal(classifyWasteCategory('cara membuat pagar laser cutting sendiri'), WASTE_CATEGORIES.DIY.key);
});

test('classifyWasteCategory detects irrelevant (freebie/academic/eceran) search terms', () => {
  assert.equal(classifyWasteCategory('download motif laser cutting gratis'), WASTE_CATEGORIES.IRRELEVANT.key);
  assert.equal(classifyWasteCategory('skripsi analisis kekuatan laser fiber'), WASTE_CATEGORIES.IRRELEVANT.key);
  assert.equal(classifyWasteCategory('gantungan kunci akrilik 1 pcs'), WASTE_CATEGORIES.IRRELEVANT.key);
});

test('classifyWasteCategory returns null when no keyword matches', () => {
  assert.equal(classifyWasteCategory('zzz totally unrelated query'), null);
});

// ---- normalizeSearchTerm / loadSearchTerms / summarizeSearchTerms ---------

test('normalizeSearchTerm flags negative-category and BLOCKED_NEGATIVE terms as wasted with a fallback category', () => {
  const active = normalizeSearchTerm(FIXTURE_TERMS[0]);
  assert.equal(active.isWasted, false);
  assert.equal(active.wasteCategory, null);
  assert.equal(active.costValue, 55209);
  assert.equal(active.avgCpcValue, 11041);

  const wastedNoKeywordMatch = normalizeSearchTerm(FIXTURE_TERMS[6]);
  assert.equal(wastedNoKeywordMatch.isWasted, true);
  assert.equal(wastedNoKeywordMatch.wasteCategory, WASTE_CATEGORIES.IRRELEVANT.key);
  assert.equal(wastedNoKeywordMatch.savedValue, 10000);
});

test('loadSearchTerms normalizes every record and rejects non-array sources', () => {
  const records = loadSearchTerms(FIXTURE_TERMS);
  assert.equal(records.length, FIXTURE_TERMS.length);
  assert.equal(records.filter((r) => r.isWasted).length, 5);
  assert.throws(() => loadSearchTerms('not-an-array'), TypeError);
});

test('summarizeSearchTerms aggregates spend/clicks for active terms and counts waste by category', () => {
  const records = loadSearchTerms(FIXTURE_TERMS);
  const summary = summarizeSearchTerms(records);
  assert.equal(summary.totalTerms, 7);
  assert.equal(summary.activeTerms, 2);
  assert.equal(summary.wastedTerms, 5);
  assert.equal(summary.totalSpend, 55209 + 51402);
  assert.equal(summary.totalClicks, 12);
  assert.deepEqual(summary.wastedByCategory, {
    EMPLOYMENT: 1,
    USED_MACHINES: 1,
    DIY: 1,
    IRRELEVANT: 2
  });
});

// ---- negative keyword detection & list building ----------------------------

test('identifyWastedTerms filters to only wasted (negative/blocked) records', () => {
  const records = loadSearchTerms(FIXTURE_TERMS);
  const wasted = identifyWastedTerms(records);
  assert.equal(wasted.length, 5);
  assert.ok(wasted.every((r) => r.isWasted));
});

test('buildNegativeKeywordLists produces deduplicated exact and phrase lists with correct match-type syntax', () => {
  const records = loadSearchTerms(FIXTURE_TERMS);
  const wasted = identifyWastedTerms(records);
  const lists = buildNegativeKeywordLists(wasted);

  assert.equal(lists.totalUniqueTerms, 5);
  assert.equal(lists.exact.length, 5);
  assert.equal(lists.phrase.length, 5);

  const employmentExact = lists.exact.find((k) => k.category === WASTE_CATEGORIES.EMPLOYMENT.key);
  assert.equal(employmentExact.keyword, '[lowongan operator mesin laser cutting]');

  const employmentPhrase = lists.phrase.find((k) => k.category === WASTE_CATEGORIES.EMPLOYMENT.key);
  assert.equal(employmentPhrase.keyword, '"lowongan operator mesin laser cutting"');

  assert.deepEqual(lists.byCategory.USED_MACHINES.sort(), ['harga mesin laser cutting fiber bekas']);
});

test('buildNegativeKeywordLists deduplicates repeated wasted terms', () => {
  const duplicated = [...FIXTURE_TERMS, { ...FIXTURE_TERMS[2], id: 'fx-3-dup' }];
  const records = loadSearchTerms(duplicated);
  const wasted = identifyWastedTerms(records);
  const lists = buildNegativeKeywordLists(wasted);
  assert.equal(lists.totalUniqueTerms, 5);
});

// ---- savings calculation -----------------------------------------------------

test('calculateSavings sums the "Saved Rp X" amounts across wasted terms', () => {
  const records = loadSearchTerms(FIXTURE_TERMS);
  const wasted = identifyWastedTerms(records);
  const savings = calculateSavings(wasted);

  assert.equal(savings.termsBlocked, 5);
  assert.equal(savings.totalSaved, 36000 + 72000 + 27000 + 31500 + 10000);
  assert.equal(savings.totalSpentDespiteBlock, 0);
  assert.equal(savings.estimatedMonthlySavings, savings.totalSaved);
  assert.equal(savings.estimatedAnnualSavings, savings.totalSaved * 12);
  assert.equal(savings.currency, 'IDR');
});

test('calculateSavings returns zeroed totals for an empty set', () => {
  const savings = calculateSavings([]);
  assert.equal(savings.termsBlocked, 0);
  assert.equal(savings.totalSaved, 0);
  assert.equal(savings.estimatedAnnualSavings, 0);
});

// ---- RianAgent integration ---------------------------------------------------

test('RianAgent.auditSearchTerms runs a full audit against an injected source', () => {
  const agent = new RianAgent({ searchTermsSource: FIXTURE_TERMS });
  const audit = agent.auditSearchTerms();

  assert.equal(audit.agent.id, RIAN_IDENTITY.id);
  assert.equal(audit.summary.totalTerms, 7);
  assert.equal(audit.wastedTerms.length, 5);
  assert.equal(audit.negativeLists.totalUniqueTerms, 5);
  assert.equal(audit.savings.termsBlocked, 5);
  assert.ok(typeof audit.auditedAt === 'string' && audit.auditedAt.length > 0);
});

test('RianAgent.auditSearchTerms accepts an ad-hoc searchTerms override without mutating the default source', () => {
  const agent = new RianAgent({ searchTermsSource: FIXTURE_TERMS });
  const overrideAudit = agent.auditSearchTerms({ searchTerms: [FIXTURE_TERMS[2]] });
  assert.equal(overrideAudit.summary.totalTerms, 1);
  assert.equal(overrideAudit.wastedTerms.length, 1);

  const defaultAudit = agent.auditSearchTerms();
  assert.equal(defaultAudit.summary.totalTerms, 7);
});

test('RianAgent.getNegativeKeywords lazily runs an audit if none has run yet', () => {
  const agent = new RianAgent({ searchTermsSource: FIXTURE_TERMS });
  assert.equal(agent.lastAudit, null);
  const lists = agent.getNegativeKeywords();
  assert.equal(lists.totalUniqueTerms, 5);
  assert.ok(agent.lastAudit !== null);
});

test('RianAgent.exportNegatives supports json, csv, and text formats', () => {
  const agent = new RianAgent({ searchTermsSource: FIXTURE_TERMS });
  agent.auditSearchTerms();

  const json = agent.exportNegatives();
  const parsed = JSON.parse(json);
  assert.equal(parsed.totalUniqueTerms, 5);

  const csv = agent.exportNegatives({ format: 'csv' });
  const csvLines = csv.split('\n');
  assert.equal(csvLines[0], 'keyword,matchType,category');
  assert.equal(csvLines.length, 1 + 5 + 5); // header + exact + phrase

  const text = agent.exportNegatives({ format: 'text' });
  assert.ok(text.includes('[lowongan operator mesin laser cutting]'));
  assert.ok(text.includes('"lowongan operator mesin laser cutting"'));
});

test('RianAgent.getStatus reports READY once wasted terms are found', () => {
  const agent = new RianAgent({ searchTermsSource: FIXTURE_TERMS });
  const status = agent.getStatus();
  assert.equal(status.agent.id, RIAN_IDENTITY.id);
  assert.equal(status.currentStatus, 'READY');
  assert.equal(status.termsAudited, 7);
  assert.equal(status.wastedTermsBlocked, 5);
  assert.equal(status.estimatedSavings.totalSaved, 36000 + 72000 + 27000 + 31500 + 10000);
});

test('RianAgent.getStatus reports IDLE when no wasted terms are present', () => {
  const agent = new RianAgent({ searchTermsSource: [FIXTURE_TERMS[0], FIXTURE_TERMS[1]] });
  const status = agent.getStatus();
  assert.equal(status.currentStatus, 'IDLE');
  assert.equal(status.wastedTermsBlocked, 0);
});

test('the exported rianAgent singleton runs against the real Search Terms Vault data without throwing', () => {
  const status = rianAgent.getStatus();
  assert.equal(status.agent.id, RIAN_IDENTITY.id);
  assert.ok(status.termsAudited > 0);
  assert.ok(status.wastedTermsBlocked > 0);
  assert.ok(status.estimatedSavings.totalSaved > 0);
});
