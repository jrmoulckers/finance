// SPDX-License-Identifier: BUSL-1.1

/**
 * Composite financial wellness score dashboard engine.
 *
 * Calculates a 0-100 wellness score from weighted components:
 * emergency fund adequacy, debt-to-income ratio, savings rate,
 * retirement progress, insurance coverage, and estate planning.
 *
 * All monetary values are integer cents. Uses banker's rounding.
 *
 * References: #1775
 */

import type {
  ComponentScore,
  WellnessComponent,
  WellnessGrade,
  WellnessInput,
  WellnessScore,
} from './types';
import { bankersRound, safeDivide } from './withdrawal-optimizer';

// ---------------------------------------------------------------------------
// Component weights (must sum to 1.0)
// ---------------------------------------------------------------------------

/** Default weights for wellness score components. */
export const DEFAULT_WEIGHTS: Readonly<Record<WellnessComponent, number>> = {
  'emergency-fund': 0.25,
  'debt-to-income': 0.2,
  'savings-rate': 0.2,
  'retirement-progress': 0.2,
  'insurance-coverage': 0.08,
  'estate-planning': 0.07,
};

/** Component display labels. */
const COMPONENT_LABELS: Readonly<Record<WellnessComponent, string>> = {
  'emergency-fund': 'Emergency Fund',
  'debt-to-income': 'Debt-to-Income',
  'savings-rate': 'Savings Rate',
  'retirement-progress': 'Retirement Progress',
  'insurance-coverage': 'Insurance Coverage',
  'estate-planning': 'Estate Planning',
};

// ---------------------------------------------------------------------------
// Grade mapping
// ---------------------------------------------------------------------------

/**
 * Map a numeric score (0-100) to a letter grade.
 *
 * @param score - Numeric score from 0 to 100.
 * @returns Letter grade A through F.
 */
export function scoreToGrade(score: number): WellnessGrade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ---------------------------------------------------------------------------
// Individual component scoring
// ---------------------------------------------------------------------------

/**
 * Score emergency fund adequacy.
 *
 * Target: 6 months of expenses. Score scales linearly to 100 at 6 months,
 * with a small bonus for exceeding 6 months (up to 12).
 *
 * @param emergencyFundCents - Emergency fund balance in cents.
 * @param monthlyExpensesCents - Monthly expenses in cents.
 * @returns Score from 0-100.
 */
export function scoreEmergencyFund(
  emergencyFundCents: number,
  monthlyExpensesCents: number,
): number {
  if (monthlyExpensesCents <= 0) return emergencyFundCents > 0 ? 100 : 0;

  const monthsCovered = safeDivide(emergencyFundCents, monthlyExpensesCents);
  const targetMonths = 6;

  if (monthsCovered >= targetMonths) {
    // Bonus for over-saving, up to 12 months
    const bonus = Math.min((monthsCovered - targetMonths) * 2, 10);
    return Math.min(100, Math.round(90 + bonus));
  }

  // Linear scale: 0 months = 0, 6 months = 90
  return Math.round(safeDivide(monthsCovered * 90, targetMonths));
}

/**
 * Score debt-to-income ratio.
 *
 * Ideal: <10%, Acceptable: <20%, Concerning: <36%, Poor: >36%.
 *
 * @param monthlyDebtPaymentsCents - Monthly debt payments in cents.
 * @param grossMonthlyIncomeCents - Gross monthly income in cents.
 * @returns Score from 0-100.
 */
export function scoreDebtToIncome(
  monthlyDebtPaymentsCents: number,
  grossMonthlyIncomeCents: number,
): number {
  if (grossMonthlyIncomeCents <= 0) return monthlyDebtPaymentsCents <= 0 ? 100 : 0;
  if (monthlyDebtPaymentsCents <= 0) return 100;

  const ratio = safeDivide(monthlyDebtPaymentsCents, grossMonthlyIncomeCents);

  if (ratio <= 0.1) return 100;
  if (ratio <= 0.2) return Math.round(100 - (ratio - 0.1) * 300); // 100 → 70
  if (ratio <= 0.36) return Math.round(70 - (ratio - 0.2) * 250); // 70 → 30
  if (ratio <= 0.5) return Math.round(30 - (ratio - 0.36) * 143); // 30 → 10
  return 0;
}

/**
 * Score savings rate.
 *
 * Target: 20%+ of gross income. Excellent at 30%+.
 *
 * @param monthlySavingsCents - Monthly savings in cents.
 * @param grossMonthlyIncomeCents - Gross monthly income in cents.
 * @returns Score from 0-100.
 */
export function scoreSavingsRate(
  monthlySavingsCents: number,
  grossMonthlyIncomeCents: number,
): number {
  if (grossMonthlyIncomeCents <= 0) return monthlySavingsCents > 0 ? 100 : 0;
  if (monthlySavingsCents <= 0) return 0;

  const rate = safeDivide(monthlySavingsCents, grossMonthlyIncomeCents);

  if (rate >= 0.3) return 100;
  if (rate >= 0.2) return Math.round(85 + (rate - 0.2) * 150); // 85 → 100
  if (rate >= 0.1) return Math.round(60 + (rate - 0.1) * 250); // 60 → 85
  if (rate >= 0.05) return Math.round(30 + (rate - 0.05) * 600); // 30 → 60
  return Math.round(rate * 600); // 0 → 30
}

/**
 * Score retirement progress.
 *
 * Based on percentage of target retirement savings achieved.
 *
 * @param retirementSavingsCents - Current retirement savings in cents.
 * @param targetRetirementCents - Target retirement savings in cents.
 * @returns Score from 0-100.
 */
export function scoreRetirementProgress(
  retirementSavingsCents: number,
  targetRetirementCents: number,
): number {
  if (targetRetirementCents <= 0) return retirementSavingsCents > 0 ? 100 : 0;

  const ratio = safeDivide(retirementSavingsCents, targetRetirementCents);

  if (ratio >= 1.0) return 100;
  if (ratio >= 0.75) return Math.round(85 + (ratio - 0.75) * 60); // 85 → 100
  return Math.round(ratio * 113.33); // 0 → 85 at 75%
}

/**
 * Score insurance coverage.
 *
 * Binary: 100 if adequate, 30 if not (partial credit for having some consideration).
 *
 * @param hasAdequateInsurance - Whether insurance coverage is adequate.
 * @returns Score from 0-100.
 */
export function scoreInsuranceCoverage(hasAdequateInsurance: boolean): number {
  return hasAdequateInsurance ? 100 : 30;
}

/**
 * Score estate planning status.
 *
 * Binary: 100 if estate plan exists, 20 if not.
 *
 * @param hasEstatePlan - Whether a will or estate plan exists.
 * @returns Score from 0-100.
 */
export function scoreEstatePlanning(hasEstatePlan: boolean): number {
  return hasEstatePlan ? 100 : 20;
}

// ---------------------------------------------------------------------------
// Improvement suggestions
// ---------------------------------------------------------------------------

/**
 * Generate an improvement suggestion for a component.
 *
 * @param component - The wellness component.
 * @param score - The component's score.
 * @param input - The wellness input data.
 * @returns A human-readable improvement suggestion.
 */
export function getSuggestion(
  component: WellnessComponent,
  score: number,
  input: WellnessInput,
): string {
  if (score >= 90) {
    switch (component) {
      case 'emergency-fund':
        return 'Excellent emergency fund. Maintain 6+ months of expenses.';
      case 'debt-to-income':
        return 'Great debt management. Keep debt-to-income ratio below 10%.';
      case 'savings-rate':
        return 'Outstanding savings rate. Consider maximizing tax-advantaged accounts.';
      case 'retirement-progress':
        return 'On track for retirement. Review and rebalance annually.';
      case 'insurance-coverage':
        return 'Insurance coverage is adequate. Review policies annually.';
      case 'estate-planning':
        return 'Estate plan in place. Review after major life events.';
    }
  }

  switch (component) {
    case 'emergency-fund': {
      const monthsCovered =
        input.monthlyExpensesCents > 0
          ? safeDivide(input.emergencyFundCents, input.monthlyExpensesCents)
          : 0;
      const monthsNeeded = Math.max(0, 6 - monthsCovered);
      const amountNeeded = bankersRound(monthsNeeded * input.monthlyExpensesCents);
      return `Build emergency fund to 6 months of expenses. Need ~$${(amountNeeded / 100).toLocaleString()} more (${monthsNeeded.toFixed(1)} months).`;
    }
    case 'debt-to-income': {
      const ratio =
        input.grossMonthlyIncomeCents > 0
          ? safeDivide(input.monthlyDebtPaymentsCents, input.grossMonthlyIncomeCents) * 100
          : 0;
      return `Reduce debt-to-income ratio from ${ratio.toFixed(0)}% toward 20% or less. Focus on highest-interest debt first.`;
    }
    case 'savings-rate': {
      const currentRate =
        input.grossMonthlyIncomeCents > 0
          ? safeDivide(input.monthlySavingsCents, input.grossMonthlyIncomeCents) * 100
          : 0;
      return `Increase savings rate from ${currentRate.toFixed(0)}% toward 20%. Automate savings transfers.`;
    }
    case 'retirement-progress': {
      const percentDone =
        input.targetRetirementCents > 0
          ? safeDivide(input.retirementSavingsCents, input.targetRetirementCents) * 100
          : 0;
      return `Retirement savings at ${percentDone.toFixed(0)}% of target. Increase contributions or catch up.`;
    }
    case 'insurance-coverage':
      return 'Review insurance coverage: health, life, disability, and liability. Ensure adequate protection.';
    case 'estate-planning':
      return 'Create or update your estate plan: will, power of attorney, healthcare directive, beneficiary designations.';
  }
}

// ---------------------------------------------------------------------------
// Composite score calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the composite financial wellness score.
 *
 * Aggregates individual component scores using configurable weights
 * to produce an overall 0-100 score with letter grade.
 *
 * @param input - Financial data for scoring.
 * @param weights - Component weights (defaults provided).
 * @returns Complete wellness score with breakdown and suggestions.
 */
export function calculateWellnessScore(
  input: WellnessInput,
  weights: Readonly<Record<WellnessComponent, number>> = DEFAULT_WEIGHTS,
): WellnessScore {
  const components: WellnessComponent[] = [
    'emergency-fund',
    'debt-to-income',
    'savings-rate',
    'retirement-progress',
    'insurance-coverage',
    'estate-planning',
  ];

  const scored: ComponentScore[] = components.map((component) => {
    let score: number;

    switch (component) {
      case 'emergency-fund':
        score = scoreEmergencyFund(input.emergencyFundCents, input.monthlyExpensesCents);
        break;
      case 'debt-to-income':
        score = scoreDebtToIncome(input.monthlyDebtPaymentsCents, input.grossMonthlyIncomeCents);
        break;
      case 'savings-rate':
        score = scoreSavingsRate(input.monthlySavingsCents, input.grossMonthlyIncomeCents);
        break;
      case 'retirement-progress':
        score = scoreRetirementProgress(input.retirementSavingsCents, input.targetRetirementCents);
        break;
      case 'insurance-coverage':
        score = scoreInsuranceCoverage(input.hasAdequateInsurance);
        break;
      case 'estate-planning':
        score = scoreEstatePlanning(input.hasEstatePlan);
        break;
    }

    return {
      component,
      label: COMPONENT_LABELS[component],
      score,
      grade: scoreToGrade(score),
      weight: weights[component],
      suggestion: getSuggestion(component, score, input),
    };
  });

  // Weighted average
  const overallScore = bankersRound(scored.reduce((sum, c) => sum + c.score * c.weight, 0));

  // Top suggestions: components scoring below 80, sorted by weight (highest impact first)
  const topSuggestions = scored
    .filter((c) => c.score < 80)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((c) => c.suggestion);

  return {
    overallScore: Math.min(100, Math.max(0, overallScore)),
    overallGrade: scoreToGrade(overallScore),
    components: scored,
    topSuggestions,
  };
}
