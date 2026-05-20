// SPDX-License-Identifier: BUSL-1.1

/**
 * Investment fee drag and 401(k) fee analyzer.
 *
 * Computes expense ratio impact over time (compound drag), 401(k) fee
 * breakdowns (admin, fund, advisory), fee comparisons between similar
 * funds, total cost of ownership projections (10/20/30 year), and
 * basis point to dollar conversion.
 *
 * All monetary values are integer cents. Fees in basis points.
 * Pure functions — no side effects or mutations.
 *
 * References: issue #1702
 */

import type {
  BasisPoints,
  Cents,
  FeeAnalysisResult,
  FeeBreakdown,
  FeeComparison,
  FeeDragProjection,
  Percent,
} from './types';
import { bankersRound, safeDivide } from './trade-import';

// ---------------------------------------------------------------------------
// Fee breakdown
// ---------------------------------------------------------------------------

/**
 * Create a 401(k) fee breakdown from individual fee components.
 *
 * @param expenseRatioBps - Fund expense ratio in basis points.
 * @param adminFeeBps - Administrative fee in basis points (default 0).
 * @param advisoryFeeBps - Advisory/wrap fee in basis points (default 0).
 * @returns Complete fee breakdown with total.
 */
export function createFeeBreakdown(
  expenseRatioBps: BasisPoints,
  adminFeeBps: BasisPoints = 0,
  advisoryFeeBps: BasisPoints = 0,
): FeeBreakdown {
  return {
    expenseRatioBps,
    adminFeeBps,
    advisoryFeeBps,
    totalFeeBps: expenseRatioBps + adminFeeBps + advisoryFeeBps,
  };
}

// ---------------------------------------------------------------------------
// Basis point / dollar conversion
// ---------------------------------------------------------------------------

/**
 * Convert basis points to annual dollar cost in cents.
 *
 * @param portfolioValueCents - Portfolio value in cents.
 * @param bps - Fee in basis points.
 * @returns Annual cost in cents.
 */
export function bpsToDollarsCents(portfolioValueCents: Cents, bps: BasisPoints): Cents {
  return bankersRound(safeDivide(portfolioValueCents * bps, 10000));
}

/**
 * Convert annual dollar cost in cents to basis points.
 *
 * @param portfolioValueCents - Portfolio value in cents.
 * @param annualCostCents - Annual cost in cents.
 * @returns Fee in basis points.
 */
export function dollarsCentsToBps(portfolioValueCents: Cents, annualCostCents: Cents): BasisPoints {
  return bankersRound(safeDivide(annualCostCents * 10000, portfolioValueCents));
}

// ---------------------------------------------------------------------------
// Fee drag projection
// ---------------------------------------------------------------------------

/**
 * Project portfolio value with fee drag over a given number of years.
 *
 * Uses compound growth:
 *   Without fees: V = P × (1 + r)^t
 *   With fees:    V = P × (1 + r − f)^t
 *
 * @param initialValueCents - Starting portfolio value in cents.
 * @param annualReturnPercent - Expected annual return (e.g., 7 for 7%).
 * @param totalFeeBps - Total all-in fee in basis points.
 * @param years - Number of years to project.
 * @returns Fee drag projection for the given time horizon.
 */
export function projectFeeDragAnalytics(
  initialValueCents: Cents,
  annualReturnPercent: Percent,
  totalFeeBps: BasisPoints,
  years: number,
): FeeDragProjection {
  const annualReturn = annualReturnPercent / 100;
  const feeRate = totalFeeBps / 10000;

  const valueWithoutFeesCents = bankersRound(initialValueCents * Math.pow(1 + annualReturn, years));
  const valueWithFeesCents = bankersRound(
    initialValueCents * Math.pow(1 + annualReturn - feeRate, years),
  );
  const totalFeesPaidCents = valueWithoutFeesCents - valueWithFeesCents;
  const growthWithoutFees = valueWithoutFeesCents - initialValueCents;
  const feeDragPercent =
    growthWithoutFees > 0
      ? Math.round(safeDivide(totalFeesPaidCents, growthWithoutFees) * 10000) / 100
      : 0;

  return {
    years,
    valueWithoutFeesCents,
    valueWithFeesCents,
    totalFeesPaidCents,
    feeDragPercent,
  };
}

/**
 * Generate fee drag projections for standard time horizons (10, 20, 30 years).
 *
 * @param initialValueCents - Starting portfolio value in cents.
 * @param annualReturnPercent - Expected annual return percentage.
 * @param totalFeeBps - Total fee in basis points.
 * @returns Projections at 10, 20, and 30 years.
 */
export function projectFeeDragMultiYear(
  initialValueCents: Cents,
  annualReturnPercent: Percent,
  totalFeeBps: BasisPoints,
): FeeDragProjection[] {
  return [10, 20, 30].map((years) =>
    projectFeeDragAnalytics(initialValueCents, annualReturnPercent, totalFeeBps, years),
  );
}

// ---------------------------------------------------------------------------
// Fee comparison
// ---------------------------------------------------------------------------

/**
 * Compare current fee structure against an alternative.
 *
 * @param portfolioValueCents - Current portfolio value in cents.
 * @param annualReturnPercent - Expected annual return percentage.
 * @param currentLabel - Label for current fee structure.
 * @param currentTotalBps - Current total fee in basis points.
 * @param alternativeLabel - Label for alternative fee structure.
 * @param alternativeTotalBps - Alternative total fee in basis points.
 * @returns Fee comparison with savings projections.
 */
export function compareFees(
  portfolioValueCents: Cents,
  annualReturnPercent: Percent,
  currentLabel: string,
  currentTotalBps: BasisPoints,
  alternativeLabel: string,
  alternativeTotalBps: BasisPoints,
): FeeComparison {
  const currentProjections = projectFeeDragMultiYear(
    portfolioValueCents,
    annualReturnPercent,
    currentTotalBps,
  );
  const altProjections = projectFeeDragMultiYear(
    portfolioValueCents,
    annualReturnPercent,
    alternativeTotalBps,
  );

  // Savings = difference in ending values (alternative has less drag)
  const savingsAtYears = currentProjections.map((cp, i) => {
    const ap = altProjections[i];
    return {
      years: cp.years,
      valueWithoutFeesCents: cp.valueWithoutFeesCents,
      valueWithFeesCents: ap.valueWithFeesCents - cp.valueWithFeesCents,
      totalFeesPaidCents: cp.totalFeesPaidCents - ap.totalFeesPaidCents,
      feeDragPercent: cp.feeDragPercent - ap.feeDragPercent,
    };
  });

  return {
    currentLabel,
    alternativeLabel,
    currentTotalBps,
    alternativeTotalBps,
    savingsAtYears,
  };
}

// ---------------------------------------------------------------------------
// Weighted expense ratio
// ---------------------------------------------------------------------------

/**
 * Compute weighted average expense ratio from multiple fund holdings.
 *
 * @param holdings - Array of {marketValueCents, expenseRatioBps} objects.
 * @returns Weighted average expense ratio in basis points.
 */
export function computeWeightedExpenseRatio(
  holdings: readonly { marketValueCents: Cents; expenseRatioBps: BasisPoints }[],
): BasisPoints {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValueCents, 0);
  if (totalValue === 0) return 0;

  const weightedSum = holdings.reduce((sum, h) => sum + h.marketValueCents * h.expenseRatioBps, 0);

  return bankersRound(safeDivide(weightedSum, totalValue));
}

// ---------------------------------------------------------------------------
// Full 401(k) fee analysis
// ---------------------------------------------------------------------------

/**
 * Run a comprehensive 401(k) fee analysis.
 *
 * @param portfolioValueCents - Current portfolio value in cents.
 * @param expenseRatioBps - Fund expense ratio in basis points.
 * @param adminFeeBps - Administrative fee in basis points (default 0).
 * @param advisoryFeeBps - Advisory fee in basis points (default 0).
 * @param annualReturnPercent - Expected annual return (default 7%).
 * @param alternatives - Alternative fee structures to compare against.
 * @returns Complete fee analysis result.
 */
export function analyze401kFees(
  portfolioValueCents: Cents,
  expenseRatioBps: BasisPoints,
  adminFeeBps: BasisPoints = 0,
  advisoryFeeBps: BasisPoints = 0,
  annualReturnPercent: Percent = 7,
  alternatives: readonly { label: string; totalBps: BasisPoints }[] = [],
): FeeAnalysisResult {
  const breakdown = createFeeBreakdown(expenseRatioBps, adminFeeBps, advisoryFeeBps);
  const projections = projectFeeDragMultiYear(
    portfolioValueCents,
    annualReturnPercent,
    breakdown.totalFeeBps,
  );
  const totalAnnualFeesCents = bpsToDollarsCents(portfolioValueCents, breakdown.totalFeeBps);

  const comparisons = alternatives.map((alt) =>
    compareFees(
      portfolioValueCents,
      annualReturnPercent,
      'Current Plan',
      breakdown.totalFeeBps,
      alt.label,
      alt.totalBps,
    ),
  );

  return {
    breakdown,
    projections,
    comparisons,
    weightedExpenseRatioBps: expenseRatioBps,
    totalAnnualFeesCents,
    portfolioValueCents,
  };
}
