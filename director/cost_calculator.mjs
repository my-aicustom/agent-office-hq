// Iron Director — Cost Calculator & Token Pricing Engine
// Calculates exact real-world API token costs in Indonesian Rupiah (IDR).
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
    name: 'Codex / Mini Router'
  }
});

const USD_TO_IDR = 16_000;

export class CostCalculator {
  /**
   * Calculates actual cost in Rupiah based on tokens consumed.
   */
  static calculateCostIdr(providerKey, promptTokens = 0, completionTokens = 0) {
    const pricing = PROVIDER_PRICING_PER_1M_TOKENS[providerKey.toLowerCase()] || PROVIDER_PRICING_PER_1M_TOKENS.codex;
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
      rateUsdPer1M: pricing
    };
  }
}
