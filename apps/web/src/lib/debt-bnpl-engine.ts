// SPDX-License-Identifier: BUSL-1.1

/**
 * BNPL (Buy Now Pay Later) aggregation and alert engine.
 *
 * Calculates total exposure, detects payment collisions, and computes
 * risk scores for BNPL obligations.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issues #1685, #1690
 */

import type { BnplAlert, BnplObligation, BnplRiskScore, BnplSummary } from './debt-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default monthly income threshold percentage for BNPL warning. */
const DEFAULT_THRESHOLD_PERCENT = 10;

/** Maximum obligations before "stacking" warning triggers. */
const DEFAULT_MAX_OBLIGATIONS = 4;

// ---------------------------------------------------------------------------
// Summary calculation
// ---------------------------------------------------------------------------

/**
 * Calculates aggregate summary of all BNPL obligations.
 *
 * @param obligations - All active BNPL obligations.
 * @returns Aggregated summary with totals and cost comparison.
 */
export function calculateBnplSummary(obligations: readonly BnplObligation[]): BnplSummary {
  if (obligations.length === 0) {
    return {
      totalOutstandingCents: 0,
      totalOriginalCents: 0,
      totalFeesCents: 0,
      activeCount: 0,
      costVsUpfrontCents: 0,
      monthlyCommitmentCents: 0,
    };
  }

  let totalOutstandingCents = 0;
  let totalOriginalCents = 0;
  let totalFeesCents = 0;
  let monthlyCommitmentCents = 0;

  for (const obl of obligations) {
    totalOutstandingCents += obl.remainingBalanceCents;
    totalOriginalCents += obl.originalAmountCents;
    totalFeesCents += obl.totalFeesCents;

    // Estimate monthly commitment: if there are upcoming due dates,
    // count those due within the next 30 days
    if (obl.upcomingDueDates.length > 0) {
      monthlyCommitmentCents += obl.installmentAmountCents;
    }
  }

  return {
    totalOutstandingCents,
    totalOriginalCents,
    totalFeesCents,
    activeCount: obligations.length,
    costVsUpfrontCents: totalFeesCents,
    monthlyCommitmentCents,
  };
}

/**
 * Calculates the cost of using BNPL vs. paying upfront.
 *
 * @param obligation - A single BNPL obligation.
 * @returns Extra cost in cents (total payments - original amount).
 */
export function calculateBnplCostVsUpfront(obligation: BnplObligation): number {
  const totalPayments = obligation.installmentAmountCents * obligation.totalInstallments;
  return Math.max(0, totalPayments - obligation.originalAmountCents);
}

// ---------------------------------------------------------------------------
// Collision detection
// ---------------------------------------------------------------------------

/**
 * Detects payment collisions — dates where multiple BNPL payments are due.
 *
 * @param obligations - All active BNPL obligations.
 * @param thresholdCents - Amount threshold for critical alerts (in cents).
 *   When total due on a single date exceeds this, alert level is 'critical'.
 * @returns Array of collision alerts.
 */
export function detectPaymentCollisions(
  obligations: readonly BnplObligation[],
  thresholdCents: number = 0,
): BnplAlert[] {
  // Group all due dates by date string
  const dateMap = new Map<string, { ids: string[]; totalCents: number; names: string[] }>();

  for (const obl of obligations) {
    for (const date of obl.upcomingDueDates) {
      const existing = dateMap.get(date);
      if (existing) {
        existing.ids.push(obl.id);
        existing.totalCents += obl.installmentAmountCents;
        existing.names.push(obl.merchantName);
      } else {
        dateMap.set(date, {
          ids: [obl.id],
          totalCents: obl.installmentAmountCents,
          names: [obl.merchantName],
        });
      }
    }
  }

  const alerts: BnplAlert[] = [];

  // Check for stacking (too many obligations)
  if (obligations.length > DEFAULT_MAX_OBLIGATIONS) {
    const allIds = obligations.map((o) => o.id);
    alerts.push({
      level: 'warning',
      type: 'stacking',
      message: `You have ${obligations.length} active BNPL obligations. Consider paying off some before adding more.`,
      dates: [],
      obligationIds: allIds,
      totalDueCents: 0,
    });
  }

  // Check each date for collisions
  for (const [date, info] of dateMap) {
    if (info.ids.length >= 2) {
      const level: BnplAlert['level'] =
        thresholdCents > 0 && info.totalCents > thresholdCents ? 'critical' : 'warning';

      alerts.push({
        level,
        type: 'collision',
        message: `${info.ids.length} BNPL payments due on ${date}: ${info.names.join(', ')}. Total: $${(info.totalCents / 100).toFixed(2)}.`,
        dates: [date],
        obligationIds: info.ids,
        totalDueCents: info.totalCents,
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Risk scoring
// ---------------------------------------------------------------------------

/**
 * Calculates a BNPL risk score (0-100) based on exposure factors.
 *
 * Factors considered:
 * - Number of active obligations (more = higher risk)
 * - Total outstanding as percentage of monthly income
 * - Whether any obligations carry interest/fees
 * - Payment collision frequency
 *
 * @param obligations - All active BNPL obligations.
 * @param monthlyIncomeCents - Monthly gross income in cents.
 * @param thresholdPercent - Percentage of income considered risky (default 10%).
 * @returns Risk score with category and contributing factors.
 */
export function calculateBnplRiskScore(
  obligations: readonly BnplObligation[],
  monthlyIncomeCents: number,
  thresholdPercent: number = DEFAULT_THRESHOLD_PERCENT,
): BnplRiskScore {
  if (obligations.length === 0 || monthlyIncomeCents <= 0) {
    return { score: 0, category: 'low', factors: [] };
  }

  let score = 0;
  const factors: string[] = [];

  // Factor 1: Number of obligations (0-25 points)
  const obligationScore = Math.min(25, obligations.length * 5);
  score += obligationScore;
  if (obligations.length > 3) {
    factors.push(`${obligations.length} active BNPL obligations`);
  }

  // Factor 2: Monthly commitment as % of income (0-35 points)
  const summary = calculateBnplSummary(obligations);
  const commitmentPercent = (summary.monthlyCommitmentCents * 100) / monthlyIncomeCents;
  if (commitmentPercent > thresholdPercent) {
    const overageMultiplier = Math.min(3.5, commitmentPercent / thresholdPercent);
    score += Math.round(overageMultiplier * 10);
    factors.push(
      `Monthly BNPL payments are ${commitmentPercent.toFixed(1)}% of income (threshold: ${thresholdPercent}%)`,
    );
  }

  // Factor 3: Interest-bearing obligations (0-20 points)
  const interestBearing = obligations.filter((o) => o.annualRateBps > 0);
  if (interestBearing.length > 0) {
    score += Math.min(20, interestBearing.length * 10);
    factors.push(`${interestBearing.length} obligation(s) carry interest or fees`);
  }

  // Factor 4: Payment collisions (0-20 points)
  const collisions = detectPaymentCollisions(obligations).filter((a) => a.type === 'collision');
  if (collisions.length > 0) {
    score += Math.min(20, collisions.length * 10);
    factors.push(`${collisions.length} date(s) with overlapping payments`);
  }

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  let category: BnplRiskScore['category'];
  if (score <= 25) category = 'low';
  else if (score <= 50) category = 'moderate';
  else if (score <= 75) category = 'high';
  else category = 'critical';

  return { score, category, factors };
}
