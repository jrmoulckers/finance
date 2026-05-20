// SPDX-License-Identifier: BUSL-1.1

/**
 * Retirement readiness score, income gap analysis, and Social Security estimator.
 *
 * Computes a 0–100 readiness score factoring in portfolio projections,
 * Social Security estimates, pension income, and the income gap between
 * needed and projected retirement income.
 *
 * All monetary values are integer cents. Uses 2024 Social Security bend
 * points for PIA computation.
 *
 * References: issue #1683
 */

import { bankersRound } from './rebalancing';
import type {
  RetirementIncomeSources,
  RetirementInput,
  RetirementScore,
  SocialSecurityEstimate,
  SocialSecurityInput,
} from './types';

// ---------------------------------------------------------------------------
// Social Security estimator
// ---------------------------------------------------------------------------

/**
 * 2024 Social Security PIA bend points (monthly amounts in cents).
 *
 * PIA formula:
 *   90% of first $1,174 of AIME +
 *   32% of AIME between $1,174 and $7,078 +
 *   15% of AIME above $7,078
 */
const BEND_POINT_1_CENTS = 1174_00;
const BEND_POINT_2_CENTS = 7078_00;

/**
 * Estimate Social Security Primary Insurance Amount (PIA) from AIME.
 *
 * Uses the standard SSA bend-point formula for 2024.
 *
 * @param aimeCents - Average Indexed Monthly Earnings in cents.
 * @returns Monthly PIA in cents.
 */
export function calculatePIA(aimeCents: number): number {
  if (aimeCents <= 0) return 0;

  let pia: number;

  if (aimeCents <= BEND_POINT_1_CENTS) {
    pia = aimeCents * 0.9;
  } else if (aimeCents <= BEND_POINT_2_CENTS) {
    pia = BEND_POINT_1_CENTS * 0.9 + (aimeCents - BEND_POINT_1_CENTS) * 0.32;
  } else {
    pia =
      BEND_POINT_1_CENTS * 0.9 +
      (BEND_POINT_2_CENTS - BEND_POINT_1_CENTS) * 0.32 +
      (aimeCents - BEND_POINT_2_CENTS) * 0.15;
  }

  return bankersRound(pia);
}

/**
 * Calculate the Social Security benefit adjustment factor for claiming age.
 *
 * - Before FRA: reduced by 5/9 of 1% per month for first 36 months early,
 *   then 5/12 of 1% for additional months.
 * - After FRA: increased by 8% per year (2/3 of 1% per month) for delayed
 *   retirement credits, up to age 70.
 *
 * @param claimingAge - Age at which benefits are claimed.
 * @param fullRetirementAge - Full retirement age.
 * @returns Adjustment factor (e.g. 0.7 for early, 1.24 for delayed).
 */
export function calculateSSAdjustmentFactor(
  claimingAge: number,
  fullRetirementAge: number,
): number {
  if (claimingAge === fullRetirementAge) return 1.0;

  const monthsDiff = (claimingAge - fullRetirementAge) * 12;

  if (monthsDiff < 0) {
    // Early claiming
    const monthsEarly = Math.abs(monthsDiff);
    const first36 = Math.min(monthsEarly, 36);
    const beyond36 = Math.max(0, monthsEarly - 36);
    const reduction = first36 * (5 / 900) + beyond36 * (5 / 1200);
    return Math.round((1 - reduction) * 10000) / 10000;
  }

  // Delayed claiming (capped at 36 months = age 70 for FRA 67)
  const monthsDelayed = Math.min(monthsDiff, 36);
  const increase = monthsDelayed * (2 / 300);
  return Math.round((1 + increase) * 10000) / 10000;
}

/**
 * Estimate Social Security benefit based on AIME and claiming age.
 *
 * @param input - Social Security estimation inputs.
 * @returns Social Security benefit estimate.
 */
export function estimateSocialSecurity(input: SocialSecurityInput): SocialSecurityEstimate {
  const piaMonthlyCents = calculatePIA(input.aimeCents);
  const adjustmentFactor = calculateSSAdjustmentFactor(input.claimingAge, input.fullRetirementAge);
  const adjustedMonthlyCents = bankersRound(piaMonthlyCents * adjustmentFactor);
  const annualBenefitCents = adjustedMonthlyCents * 12;

  return {
    piaMonthlyCents,
    adjustedMonthlyCents,
    annualBenefitCents,
    adjustmentFactor,
  };
}

// ---------------------------------------------------------------------------
// Portfolio projection
// ---------------------------------------------------------------------------

/**
 * Project portfolio value at retirement using future value formula.
 *
 * FV = PV × (1 + r)^n + PMT × ((1 + r)^n − 1) / r
 *
 * @param currentValueCents - Current portfolio value in cents.
 * @param annualSavingsCents - Annual contributions in cents.
 * @param returnPercent - Annual return rate (percentage).
 * @param years - Years to retirement.
 * @returns Projected portfolio value at retirement in cents.
 */
export function projectPortfolioAtRetirement(
  currentValueCents: number,
  annualSavingsCents: number,
  returnPercent: number,
  years: number,
): number {
  if (years <= 0) return currentValueCents;

  const r = returnPercent / 100;
  if (r === 0) {
    return currentValueCents + annualSavingsCents * years;
  }

  const growthFactor = Math.pow(1 + r, years);
  const fvPV = currentValueCents * growthFactor;
  const fvAnnuity = annualSavingsCents * ((growthFactor - 1) / r);

  return bankersRound(fvPV + fvAnnuity);
}

/**
 * Calculate the required portfolio at retirement to fund expenses.
 *
 * Uses present value of an annuity formula for retirement spending period.
 * PV = PMT × ((1 − (1 + r)^(−n)) / r)
 *
 * @param annualExpensesCents - Annual retirement expenses in cents.
 * @param returnPercent - Expected return during retirement (percentage).
 * @param inflationPercent - Inflation rate (percentage).
 * @param retirementYears - Number of years in retirement.
 * @param otherIncomeCents - Annual income from SS + pension in cents.
 * @returns Required portfolio in cents.
 */
export function calculateRequiredPortfolio(
  annualExpensesCents: number,
  returnPercent: number,
  inflationPercent: number,
  retirementYears: number,
  otherIncomeCents: number,
): number {
  const netExpenses = Math.max(0, annualExpensesCents - otherIncomeCents);
  if (netExpenses === 0 || retirementYears <= 0) return 0;

  const realReturn = (1 + returnPercent / 100) / (1 + inflationPercent / 100) - 1;
  if (Math.abs(realReturn) < 0.0001) {
    return bankersRound(netExpenses * retirementYears);
  }

  const pvFactor = (1 - Math.pow(1 + realReturn, -retirementYears)) / realReturn;
  return bankersRound(netExpenses * pvFactor);
}

// ---------------------------------------------------------------------------
// Readiness score
// ---------------------------------------------------------------------------

/**
 * Categorize a readiness score into a descriptive category.
 *
 * @param score - Score 0–100.
 * @returns Score category.
 */
function categorizeScore(score: number): RetirementScore['category'] {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 75) return 'STRONG';
  if (score >= 50) return 'ON_TRACK';
  if (score >= 25) return 'NEEDS_WORK';
  return 'CRITICAL';
}

/**
 * Calculate comprehensive retirement readiness score.
 *
 * Factors:
 * - Portfolio adequacy (projected vs required)
 * - Income coverage (all sources vs expenses)
 * - Years until retirement (time to course-correct)
 *
 * @param input - Retirement assessment inputs.
 * @returns Retirement readiness score and analysis.
 */
export function calculateRetirementScore(input: RetirementInput): RetirementScore {
  const yearsToRetirement = Math.max(0, input.retirementAge - input.currentAge);
  const retirementYears = Math.max(0, input.lifeExpectancy - input.retirementAge);

  // Project portfolio at retirement
  const projectedPortfolio = projectPortfolioAtRetirement(
    input.currentPortfolioCents,
    input.annualSavingsCents,
    input.preRetirementReturnPercent,
    yearsToRetirement,
  );

  // Other income sources
  const otherIncome = input.socialSecurityAnnualCents + input.pensionAnnualCents;

  // Required portfolio
  const requiredPortfolio = calculateRequiredPortfolio(
    input.annualExpensesCents,
    input.expectedReturnPercent,
    input.inflationRatePercent,
    retirementYears,
    otherIncome,
  );

  // Portfolio-based withdrawal
  const realReturn =
    (1 + input.expectedReturnPercent / 100) / (1 + input.inflationRatePercent / 100) - 1;
  const portfolioWithdrawalCents =
    retirementYears > 0 && realReturn > 0.0001
      ? bankersRound(
          projectedPortfolio * (realReturn / (1 - Math.pow(1 + realReturn, -retirementYears))),
        )
      : retirementYears > 0
        ? bankersRound(projectedPortfolio / retirementYears)
        : 0;

  const totalAnnualIncome = portfolioWithdrawalCents + otherIncome;

  // Income gap (positive = shortfall)
  const incomeGapCents = Math.max(0, input.annualExpensesCents - totalAnnualIncome);

  // Portfolio gap
  const portfolioGapCents = projectedPortfolio - requiredPortfolio;

  // Score computation (0–100)
  // Ratio-based: projected / required portfolio
  const fundingRatio = requiredPortfolio > 0 ? projectedPortfolio / requiredPortfolio : 1;

  // Base score from funding ratio (0–80 points)
  let score = Math.min(80, Math.round(fundingRatio * 80));

  // Income coverage bonus (0–20 points)
  const incomeCoverageRatio =
    input.annualExpensesCents > 0 ? totalAnnualIncome / input.annualExpensesCents : 1;
  score += Math.min(20, Math.round(incomeCoverageRatio * 20));

  // Clamp to 0–100
  score = Math.max(0, Math.min(100, score));

  const incomeSources: RetirementIncomeSources = {
    portfolioWithdrawalCents,
    socialSecurityCents: input.socialSecurityAnnualCents,
    pensionCents: input.pensionAnnualCents,
    totalAnnualIncomeCents: totalAnnualIncome,
  };

  return {
    score,
    category: categorizeScore(score),
    incomeGapCents,
    projectedPortfolioAtRetirementCents: projectedPortfolio,
    requiredPortfolioCents: requiredPortfolio,
    portfolioGapCents,
    incomeSources,
  };
}
