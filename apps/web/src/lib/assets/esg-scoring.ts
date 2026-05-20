// SPDX-License-Identifier: BUSL-1.1

/**
 * ESG score display and ethical-screening alerts.
 *
 * Assigns E/S/G subscores (0-100), computes portfolio-weighted ESG scores,
 * performs ethical screening against user preferences, and generates alerts
 * when holdings violate exclusion rules or fall below score thresholds.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issue #1739
 */

import type {
  ESGHolding,
  ESGScore,
  PortfolioESGSummary,
  ScreenCategory,
  ScreeningAlert,
  ScreeningPreferences,
} from './types';

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

/**
 * Compute the overall ESG score from sub-scores.
 *
 * Equal-weighted average of environmental, social, and governance scores.
 * Each sub-score is clamped to [0, 100].
 *
 * @param environmental - Environmental sub-score (0-100).
 * @param social - Social sub-score (0-100).
 * @param governance - Governance sub-score (0-100).
 * @returns Overall ESG score (0-100).
 */
export function computeOverallScore(
  environmental: number,
  social: number,
  governance: number,
): number {
  const e = Math.max(0, Math.min(100, environmental));
  const s = Math.max(0, Math.min(100, social));
  const g = Math.max(0, Math.min(100, governance));
  return Math.round(((e + s + g) / 3) * 100) / 100;
}

/**
 * Create an ESGScore from sub-scores.
 *
 * @param symbol - Ticker symbol.
 * @param environmental - Environmental sub-score (0-100).
 * @param social - Social sub-score (0-100).
 * @param governance - Governance sub-score (0-100).
 * @returns ESGScore object.
 */
export function createESGScore(
  symbol: string,
  environmental: number,
  social: number,
  governance: number,
): ESGScore {
  return {
    symbol,
    environmental: Math.max(0, Math.min(100, environmental)),
    social: Math.max(0, Math.min(100, social)),
    governance: Math.max(0, Math.min(100, governance)),
    overall: computeOverallScore(environmental, social, governance),
  };
}

// ---------------------------------------------------------------------------
// Portfolio-weighted ESG score
// ---------------------------------------------------------------------------

/**
 * Compute portfolio-weighted ESG scores.
 *
 * Weights each holding's ESG scores by its market value proportion.
 *
 * @param holdings - Holdings with market values.
 * @param scores - ESG scores keyed by symbol.
 * @returns Portfolio-weighted E, S, G, and overall scores.
 */
export function computePortfolioESG(
  holdings: readonly ESGHolding[],
  scores: ReadonlyMap<string, ESGScore>,
): { environmental: number; social: number; governance: number; overall: number } {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValueCents, 0);
  if (totalValue === 0) {
    return { environmental: 0, social: 0, governance: 0, overall: 0 };
  }

  let weightedE = 0;
  let weightedS = 0;
  let weightedG = 0;

  for (const holding of holdings) {
    const score = scores.get(holding.symbol);
    if (!score) continue;
    const weight = holding.marketValueCents / totalValue;
    weightedE += score.environmental * weight;
    weightedS += score.social * weight;
    weightedG += score.governance * weight;
  }

  return {
    environmental: Math.round(weightedE * 100) / 100,
    social: Math.round(weightedS * 100) / 100,
    governance: Math.round(weightedG * 100) / 100,
    overall: computeOverallScore(weightedE, weightedS, weightedG),
  };
}

// ---------------------------------------------------------------------------
// Ethical screening
// ---------------------------------------------------------------------------

/**
 * Screen a single holding against user preferences.
 *
 * Checks for excluded categories and minimum score thresholds.
 *
 * @param holding - Holding to screen.
 * @param score - ESG score for the holding (undefined if unscored).
 * @param preferences - User's screening preferences.
 * @returns Array of alerts (empty if holding passes all screens).
 */
export function screenHolding(
  holding: ESGHolding,
  score: ESGScore | undefined,
  preferences: ScreeningPreferences,
): readonly ScreeningAlert[] {
  const alerts: ScreeningAlert[] = [];

  // Category exclusion checks
  if (holding.categories) {
    for (const category of holding.categories) {
      if (preferences.excludedCategories.includes(category)) {
        alerts.push({
          symbol: holding.symbol,
          companyName: holding.companyName,
          alertType: 'EXCLUDED_CATEGORY',
          category,
          message: `${holding.companyName} (${holding.symbol}) is in the excluded category: ${formatCategory(category)}.`,
        });
      }
    }
  }

  // Score threshold checks
  if (score) {
    if (
      preferences.minimumOverallScore !== undefined &&
      score.overall < preferences.minimumOverallScore
    ) {
      alerts.push({
        symbol: holding.symbol,
        companyName: holding.companyName,
        alertType: 'LOW_SCORE',
        score: score.overall,
        threshold: preferences.minimumOverallScore,
        message: `${holding.companyName} overall ESG score (${score.overall}) is below minimum threshold (${preferences.minimumOverallScore}).`,
      });
    }

    if (
      preferences.minimumEnvironmental !== undefined &&
      score.environmental < preferences.minimumEnvironmental
    ) {
      alerts.push({
        symbol: holding.symbol,
        companyName: holding.companyName,
        alertType: 'LOW_SCORE',
        score: score.environmental,
        threshold: preferences.minimumEnvironmental,
        message: `${holding.companyName} Environmental score (${score.environmental}) is below minimum threshold (${preferences.minimumEnvironmental}).`,
      });
    }

    if (preferences.minimumSocial !== undefined && score.social < preferences.minimumSocial) {
      alerts.push({
        symbol: holding.symbol,
        companyName: holding.companyName,
        alertType: 'LOW_SCORE',
        score: score.social,
        threshold: preferences.minimumSocial,
        message: `${holding.companyName} Social score (${score.social}) is below minimum threshold (${preferences.minimumSocial}).`,
      });
    }

    if (
      preferences.minimumGovernance !== undefined &&
      score.governance < preferences.minimumGovernance
    ) {
      alerts.push({
        symbol: holding.symbol,
        companyName: holding.companyName,
        alertType: 'LOW_SCORE',
        score: score.governance,
        threshold: preferences.minimumGovernance,
        message: `${holding.companyName} Governance score (${score.governance}) is below minimum threshold (${preferences.minimumGovernance}).`,
      });
    }
  }

  return alerts;
}

/**
 * Format a screen category for display.
 *
 * @param category - The screen category.
 * @returns Human-readable label.
 */
export function formatCategory(category: ScreenCategory): string {
  const labels: Record<ScreenCategory, string> = {
    FOSSIL_FUELS: 'Fossil Fuels',
    TOBACCO: 'Tobacco',
    ALCOHOL: 'Alcohol',
    GAMBLING: 'Gambling',
    WEAPONS: 'Weapons',
    ADULT_ENTERTAINMENT: 'Adult Entertainment',
    ANIMAL_TESTING: 'Animal Testing',
    NUCLEAR: 'Nuclear',
    PRIVATE_PRISONS: 'Private Prisons',
  };
  return labels[category];
}

// ---------------------------------------------------------------------------
// Portfolio ESG summary
// ---------------------------------------------------------------------------

/**
 * Compute a full portfolio ESG summary with alerts.
 *
 * @param holdings - All holdings with market values.
 * @param scores - ESG scores indexed by symbol.
 * @param preferences - User's screening preferences.
 * @returns Portfolio ESG summary including alerts.
 */
export function computePortfolioESGSummary(
  holdings: readonly ESGHolding[],
  scores: ReadonlyMap<string, ESGScore>,
  preferences: ScreeningPreferences,
): PortfolioESGSummary {
  const weighted = computePortfolioESG(holdings, scores);
  const allAlerts: ScreeningAlert[] = [];
  let scoredCount = 0;
  let unscoredCount = 0;

  for (const holding of holdings) {
    const score = scores.get(holding.symbol);
    if (score) {
      scoredCount++;
    } else {
      unscoredCount++;
    }
    const holdingAlerts = screenHolding(holding, score, preferences);
    allAlerts.push(...holdingAlerts);
  }

  return {
    weightedEnvironmental: weighted.environmental,
    weightedSocial: weighted.social,
    weightedGovernance: weighted.governance,
    weightedOverall: weighted.overall,
    scoredHoldingsCount: scoredCount,
    unscoredHoldingsCount: unscoredCount,
    alerts: allAlerts,
  };
}
