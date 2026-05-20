// SPDX-License-Identifier: BUSL-1.1

/**
 * Investment recession simulator.
 *
 * Overlays historical recession scenarios (dot-com, 2008, COVID) onto
 * a portfolio, simulates drawdowns, estimates recovery timelines,
 * models sector rotation impact, and generates defensive allocation
 * suggestions.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issue #1746
 */

import type {
  AssetClassName,
  Cents,
  HoldingRecessionImpact,
  Percent,
  RecessionSimResult,
  RecessionTemplate,
} from './types';
import { bankersRound, safeDivide } from './trade-import';

// ---------------------------------------------------------------------------
// Historical recession templates
// ---------------------------------------------------------------------------

/** Dot-com bubble burst (2000–2002). */
export const DOT_COM_RECESSION: RecessionTemplate = {
  id: 'dot-com',
  name: 'Dot-Com Bust (2000–2002)',
  description:
    'Technology bubble collapse. NASDAQ fell ~78%. Prolonged recovery over 13+ years for tech-heavy portfolios.',
  startDate: '2000-03-10',
  endDate: '2002-10-09',
  peakDeclinePercent: -49,
  recoveryMonths: 56,
  sectorImpacts: [
    { sector: 'Technology', declinePercent: -78 },
    { sector: 'Telecom', declinePercent: -65 },
    { sector: 'Financials', declinePercent: -20 },
    { sector: 'Healthcare', declinePercent: -15 },
    { sector: 'Consumer Staples', declinePercent: -5 },
    { sector: 'Utilities', declinePercent: -10 },
  ],
};

/** 2008 Great Financial Crisis. */
export const GFC_2008_RECESSION: RecessionTemplate = {
  id: 'gfc-2008',
  name: 'Great Financial Crisis (2007–2009)',
  description:
    'Subprime mortgage crisis and bank failures. S&P 500 fell ~57%. Recovery took ~4 years.',
  startDate: '2007-10-09',
  endDate: '2009-03-09',
  peakDeclinePercent: -57,
  recoveryMonths: 49,
  sectorImpacts: [
    { sector: 'Financials', declinePercent: -83 },
    { sector: 'Real Estate', declinePercent: -68 },
    { sector: 'Industrials', declinePercent: -55 },
    { sector: 'Technology', declinePercent: -45 },
    { sector: 'Consumer Discretionary', declinePercent: -50 },
    { sector: 'Healthcare', declinePercent: -35 },
    { sector: 'Consumer Staples', declinePercent: -25 },
    { sector: 'Utilities', declinePercent: -30 },
  ],
};

/** COVID-19 pandemic crash (2020). */
export const COVID_RECESSION: RecessionTemplate = {
  id: 'covid-2020',
  name: 'COVID-19 Crash (2020)',
  description: 'Rapid pandemic selloff. S&P 500 fell ~34% in 33 days but recovered in ~5 months.',
  startDate: '2020-02-19',
  endDate: '2020-03-23',
  peakDeclinePercent: -34,
  recoveryMonths: 5,
  sectorImpacts: [
    { sector: 'Energy', declinePercent: -60 },
    { sector: 'Travel & Leisure', declinePercent: -55 },
    { sector: 'Financials', declinePercent: -35 },
    { sector: 'Real Estate', declinePercent: -25 },
    { sector: 'Technology', declinePercent: -20 },
    { sector: 'Healthcare', declinePercent: -15 },
    { sector: 'Consumer Staples', declinePercent: -10 },
  ],
};

/** All built-in recession templates. */
export const RECESSION_TEMPLATES: readonly RecessionTemplate[] = [
  DOT_COM_RECESSION,
  GFC_2008_RECESSION,
  COVID_RECESSION,
];

// ---------------------------------------------------------------------------
// Asset class decline mapping
// ---------------------------------------------------------------------------

/**
 * Map asset class to estimated decline for a given recession scenario.
 *
 * Uses the peak market decline and adjusts per asset class based on
 * historical behavior.
 *
 * @param assetClass - The asset class.
 * @param peakDeclinePercent - The overall market peak decline (negative).
 * @returns Estimated decline percentage for the asset class.
 */
export function estimateAssetClassDecline(
  assetClass: AssetClassName,
  peakDeclinePercent: Percent,
): Percent {
  // Multipliers relative to peak market decline
  const multipliers: Record<AssetClassName, number> = {
    US_STOCKS: 1.0,
    INTERNATIONAL_STOCKS: 1.1,
    BONDS: -0.1, // Bonds often gain during equity declines
    REAL_ESTATE: 0.8,
    COMMODITIES: 0.6,
    CASH: 0,
    CRYPTO: 1.5,
    OTHER: 0.5,
  };

  const multiplier = multipliers[assetClass] ?? 0.5;
  return Math.round(peakDeclinePercent * multiplier * 100) / 100;
}

// ---------------------------------------------------------------------------
// Portfolio recession simulation
// ---------------------------------------------------------------------------

/**
 * Simulate the impact of a recession on individual holdings.
 *
 * @param holdings - Portfolio holdings with asset class and value.
 * @param peakDeclinePercent - Overall market peak decline (negative).
 * @returns Per-holding recession impact details.
 */
export function simulateHoldingImpacts(
  holdings: readonly { symbol: string; assetClass: AssetClassName; marketValueCents: Cents }[],
  peakDeclinePercent: Percent,
): HoldingRecessionImpact[] {
  return holdings.map((h) => {
    const declinePercent = estimateAssetClassDecline(h.assetClass, peakDeclinePercent);
    const estimatedValueCents = bankersRound(h.marketValueCents * (1 + declinePercent / 100));

    return {
      symbol: h.symbol,
      assetClass: h.assetClass,
      currentValueCents: h.marketValueCents,
      estimatedValueCents: Math.max(0, estimatedValueCents),
      declinePercent,
    };
  });
}

// ---------------------------------------------------------------------------
// Recovery estimation
// ---------------------------------------------------------------------------

/**
 * Estimate months to recovery based on drawdown severity.
 *
 * Uses a simple heuristic: deeper drawdowns take proportionally longer
 * to recover, scaled by the historical template's recovery time.
 *
 * @param portfolioDrawdownPercent - The portfolio's specific drawdown (negative).
 * @param templateDrawdownPercent - The template's market drawdown (negative).
 * @param templateRecoveryMonths - The template's historical recovery months.
 * @returns Estimated recovery months for this specific portfolio.
 */
export function estimateRecoveryMonths(
  portfolioDrawdownPercent: Percent,
  templateDrawdownPercent: Percent,
  templateRecoveryMonths: number,
): number {
  if (templateDrawdownPercent === 0) return 0;
  const ratio = safeDivide(Math.abs(portfolioDrawdownPercent), Math.abs(templateDrawdownPercent));
  return Math.max(1, bankersRound(ratio * templateRecoveryMonths));
}

// ---------------------------------------------------------------------------
// Defensive allocation suggestions
// ---------------------------------------------------------------------------

/**
 * Generate defensive allocation suggestions based on portfolio composition.
 *
 * Analyzes current allocation and suggests changes to improve recession
 * resilience.
 *
 * @param holdings - Current portfolio holdings.
 * @returns Array of plain-text suggestion strings.
 */
export function generateDefensiveSuggestions(
  holdings: readonly { assetClass: AssetClassName; marketValueCents: Cents }[],
): string[] {
  const suggestions: string[] = [];
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValueCents, 0);
  if (totalValue === 0) return suggestions;

  // Compute allocation percentages
  const allocByClass = new Map<AssetClassName, number>();
  for (const h of holdings) {
    allocByClass.set(h.assetClass, (allocByClass.get(h.assetClass) ?? 0) + h.marketValueCents);
  }

  const pctOf = (cls: AssetClassName): number =>
    Math.round(safeDivide(allocByClass.get(cls) ?? 0, totalValue) * 10000) / 100;

  const bondsPct = pctOf('BONDS');
  const cashPct = pctOf('CASH');
  const cryptoPct = pctOf('CRYPTO');
  const equityPct = pctOf('US_STOCKS') + pctOf('INTERNATIONAL_STOCKS');

  if (bondsPct < 20) {
    suggestions.push(
      `Bond allocation is ${bondsPct}%. Consider increasing to at least 20% for recession protection.`,
    );
  }

  if (cashPct < 5) {
    suggestions.push(
      `Cash position is ${cashPct}%. Maintain at least 5% cash for liquidity during downturns.`,
    );
  }

  if (cryptoPct > 10) {
    suggestions.push(
      `Crypto allocation is ${cryptoPct}%. Consider reducing below 10% — crypto is highly volatile in recessions.`,
    );
  }

  if (equityPct > 80) {
    suggestions.push(
      `Equity allocation is ${equityPct}%. Consider diversifying into bonds and alternatives to reduce drawdown risk.`,
    );
  }

  if (suggestions.length === 0) {
    suggestions.push(
      'Portfolio allocation appears reasonably diversified for recession resilience.',
    );
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Full recession simulation
// ---------------------------------------------------------------------------

/**
 * Run a complete recession simulation on a portfolio.
 *
 * @param holdings - Portfolio holdings with asset class and market value.
 * @param template - Historical recession template to apply.
 * @returns Full recession simulation result.
 */
export function simulateRecession(
  holdings: readonly { symbol: string; assetClass: AssetClassName; marketValueCents: Cents }[],
  template: RecessionTemplate,
): RecessionSimResult {
  const currentValueCents = holdings.reduce((sum, h) => sum + h.marketValueCents, 0);
  const holdingImpacts = simulateHoldingImpacts(holdings, template.peakDeclinePercent);

  const troughValueCents = holdingImpacts.reduce((sum, h) => sum + h.estimatedValueCents, 0);

  const drawdownPercent =
    currentValueCents > 0
      ? Math.round(safeDivide(troughValueCents - currentValueCents, currentValueCents) * 10000) /
        100
      : 0;

  const estimatedRecoveryMonths = estimateRecoveryMonths(
    drawdownPercent,
    template.peakDeclinePercent,
    template.recoveryMonths,
  );

  const suggestions = generateDefensiveSuggestions(holdings);

  return {
    scenarioName: template.name,
    currentValueCents,
    troughValueCents,
    drawdownPercent,
    estimatedRecoveryMonths,
    holdingImpacts,
    suggestions,
  };
}

/**
 * Run all built-in recession scenarios against a portfolio.
 *
 * @param holdings - Portfolio holdings.
 * @returns Array of simulation results, one per template.
 */
export function simulateAllRecessions(
  holdings: readonly { symbol: string; assetClass: AssetClassName; marketValueCents: Cents }[],
): RecessionSimResult[] {
  return RECESSION_TEMPLATES.map((template) => simulateRecession(holdings, template));
}
