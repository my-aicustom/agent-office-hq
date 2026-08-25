import { NEGATIVE_MATCH_TYPES, WASTE_CATEGORIES } from './constants.mjs';

/** Filters normalized search terms down to the ones flagged as wasted spend. */
export function identifyWastedTerms(records) {
  return (records || []).filter((r) => r.isWasted);
}

function toExactMatch(term) {
  return `[${term.trim().toLowerCase()}]`;
}

function toPhraseMatch(term) {
  return `"${term.trim().toLowerCase()}"`;
}

/**
 * Groups wasted search terms into exact-match and phrase-match negative
 * keyword lists, deduplicated by term text, plus a per-category breakdown.
 */
export function buildNegativeKeywordLists(wastedTerms) {
  const seen = new Set();
  const exact = [];
  const phrase = [];
  const byCategory = {};

  for (const record of wastedTerms || []) {
    const termKey = record.term.trim().toLowerCase();
    if (seen.has(termKey)) continue;
    seen.add(termKey);

    const category = record.wasteCategory || WASTE_CATEGORIES.IRRELEVANT.key;

    exact.push({ term: record.term, matchType: NEGATIVE_MATCH_TYPES.EXACT, keyword: toExactMatch(record.term), category });
    phrase.push({ term: record.term, matchType: NEGATIVE_MATCH_TYPES.PHRASE, keyword: toPhraseMatch(record.term), category });

    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push(record.term);
  }

  return { exact, phrase, byCategory, totalUniqueTerms: seen.size };
}

/** Computes estimated budget savings from blocking the given wasted terms. */
export function calculateSavings(wastedTerms) {
  const terms = wastedTerms || [];
  const totalSaved = terms.reduce((sum, r) => sum + (r.savedValue || 0), 0);
  const totalSpentDespiteBlock = terms.reduce((sum, r) => sum + (r.costValue || 0), 0);

  return {
    termsBlocked: terms.length,
    totalSaved,
    totalSpentDespiteBlock,
    estimatedMonthlySavings: totalSaved,
    estimatedAnnualSavings: totalSaved * 12,
    currency: 'IDR'
  };
}
