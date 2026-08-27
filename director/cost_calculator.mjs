// Iron Director — Cost Calculator & Token Pricing Engine
// Estimates API token costs in IDR from provider-reported usage and configured rates.
// Exchange rate benchmark: 1 USD = Rp 16.000

export const PROVIDER_PRICING_PER_1M_TOKENS = Object.freeze({
  gemini: {
    promptUsd: 0.10,
    completionUsd: 0.40,
    name: 'Gemini 3+ Flash'
  },
  claude: {
    promptUsd: 3.00,
    completionUsd: 15.00,
    name: 'Claude Sonnet'
  },
  codex: {
    promptUsd: 0.15,
    completionUsd: 0.60,
    name: 'Legacy OpenRouter alias'
  },
  openrouter: {
    promptUsd: 0.15,
    completionUsd: 0.60,
    name: 'OpenRouter / openai/gpt-4o-mini'
  }
});

const USD_TO_IDR = 16_000;

export class CostCalculator {
  /**
   * Calculates an estimate in Rupiah based on provider-reported tokens.
   */
  static calculateCostIdr(providerKey, promptTokens = 0, completionTokens = 0) {
    const pricing = PROVIDER_PRICING_PER_1M_TOKENS[providerKey.toLowerCase()] || PROVIDER_PRICING_PER_1M_TOKENS.openrouter;
    const promptCostUsd = (promptTokens / 1_000_000) * pricing.promptUsd;
    const completionCostUsd = (completionTokens / 1_000_000) * pricing.completionUsd;
    const totalCostUsd = promptCostUsd + completionCostUsd;
    const totalCostIdr = Math.round(totalCostUsd * USD_TO_IDR * 100) / 100; // Round to 2 decimal places

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd: totalCostUsd,
      costIdr: totalCostIdr,
      accountingType: 'ESTIMATE_FROM_REPORTED_TOKENS',
      usdToIdrRate: USD_TO_IDR,
      rateUsdPer1M: pricing
    };
  }
}
