import { SEARCH_TERMS_VAULT_DATA } from '../../serp_auditor.mjs';
import { WASTE_CATEGORIES } from './constants.mjs';

/** Parses an Indonesian Rupiah string ("Rp 55.209") into an integer. Returns 0 for anything unparseable. */
export function parseRupiah(value) {
  if (typeof value !== 'string') return 0;
  const match = value.match(/Rp\s*([\d.]+)/);
  if (!match) return 0;
  const digits = match[1].replace(/\./g, '');
  return parseInt(digits, 10) || 0;
}

/** Extracts the "Saved Rp X" amount embedded in a blocked term's cost string, e.g. "Rp 0 (Saved Rp 54.000)". */
export function parseSavedRupiah(value) {
  if (typeof value !== 'string') return 0;
  const match = value.match(/Saved Rp\s*([\d.]+)/i);
  if (!match) return 0;
  const digits = match[1].replace(/\./g, '');
  return parseInt(digits, 10) || 0;
}

/**
 * Classifies a wasted search term into a WASTE_CATEGORIES bucket by keyword
 * match. Checked in a fixed priority order (employment, used machines, DIY,
 * irrelevant) so a term matching multiple signals still gets one category.
 * Returns null when no keyword matches.
 */
export function classifyWasteCategory(term) {
  const lower = String(term || '').toLowerCase();
  const priority = [WASTE_CATEGORIES.EMPLOYMENT, WASTE_CATEGORIES.USED_MACHINES, WASTE_CATEGORIES.DIY, WASTE_CATEGORIES.IRRELEVANT];
  for (const category of priority) {
    if (category.keywords.some((kw) => lower.includes(kw))) return category.key;
  }
  return null;
}

/** Normalizes one raw SEARCH_TERMS_VAULT_DATA record with parsed money values and waste classification. */
export function normalizeSearchTerm(record) {
  const costValue = parseRupiah(record.cost);
  const savedValue = parseSavedRupiah(record.cost);
  const avgCpcValue = parseRupiah(record.avgCpc);
  const isWasted = record.category === 'negative' || record.status === 'BLOCKED_NEGATIVE';
  return {
    ...record,
    costValue,
    savedValue,
    avgCpcValue,
    isWasted,
    wasteCategory: isWasted ? (classifyWasteCategory(record.term) || WASTE_CATEGORIES.IRRELEVANT.key) : null
  };
}

/** Loads and normalizes search terms from the Search Terms Vault (or an injected source, for testing). */
export function loadSearchTerms(source = SEARCH_TERMS_VAULT_DATA) {
  if (!Array.isArray(source)) {
    throw new TypeError('loadSearchTerms: source must be an array of search term records');
  }
  return source.map(normalizeSearchTerm);
}

/** Aggregates spend/click/waste totals across a set of normalized search terms. */
export function summarizeSearchTerms(records) {
  const active = records.filter((r) => !r.isWasted);
  const wasted = records.filter((r) => r.isWasted);
  const wastedByCategory = wasted.reduce((acc, r) => {
    acc[r.wasteCategory] = (acc[r.wasteCategory] || 0) + 1;
    return acc;
  }, {});

  return {
    totalTerms: records.length,
    activeTerms: active.length,
    wastedTerms: wasted.length,
    totalSpend: active.reduce((sum, r) => sum + r.costValue, 0),
    totalClicks: active.reduce((sum, r) => sum + (Number(r.clicks) || 0), 0),
    wastedByCategory
  };
}
