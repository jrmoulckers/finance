// SPDX-License-Identifier: BUSL-1.1

/**
 * Guaranteed income integration for Social Security, pensions, and annuities.
 *
 * Provides Social Security benefit estimation by claiming age, pension
 * present value calculation, annuity payment stream modeling, and
 * gap analysis comparing guaranteed income to desired retirement spending.
 *
 * All monetary values are integer cents. Uses banker's rounding.
 *
 * References: #1736
 */

import type {
  GuaranteedIncomeStream,
  IncomeGapAnalysis,
  PensionPresentValue,
  SocialSecurityClaimAge,
  SocialSecurityEstimate,
} from './types';
import { bankersRound, safeDivide } from './withdrawal-optimizer';

// ---------------------------------------------------------------------------
// Social Security estimation
// ---------------------------------------------------------------------------

/** Full Retirement Age (FRA) for most current retirees. */
export const FULL_RETIREMENT_AGE = 67;

/**
 * Social Security adjustment factors by claiming age.
 *
 * Before FRA: reduced by 5/9 of 1% per month for first 36 months early,
 * then 5/12 of 1% per additional month.
 * After FRA: increased by 8% per year (2/3 of 1% per month) delayed credits.
 */
function getSSAdjustmentFactor(claimAge: SocialSecurityClaimAge): number {
  const monthsFromFRA = (claimAge - FULL_RETIREMENT_AGE) * 12;

  if (monthsFromFRA === 0) return 1.0;

  if (monthsFromFRA < 0) {
    // Early claiming — reduction
    const monthsEarly = Math.abs(monthsFromFRA);
    const first36 = Math.min(monthsEarly, 36);
    const beyond36 = Math.max(0, monthsEarly - 36);
    const reduction = first36 * (5 / 900) + beyond36 * (5 / 1200);
    return Math.max(0, 1.0 - reduction);
  }

  // Delayed claiming — bonus (8% per year = 2/3% per month)
  const monthsDelayed = monthsFromFRA;
  const bonus = monthsDelayed * (2 / 300);
  return 1.0 + bonus;
}

/**
 * Estimate Social Security benefits at a given claiming age.
 *
 * @param monthlyBenefitAtFRACents - Primary Insurance Amount (PIA) at full retirement age, in cents.
 * @param claimAge - Age at which benefits will be claimed.
 * @returns Estimated benefit details.
 */
export function estimateSocialSecurityBenefit(
  monthlyBenefitAtFRACents: number,
  claimAge: SocialSecurityClaimAge,
): SocialSecurityEstimate {
  const adjustmentFactor = getSSAdjustmentFactor(claimAge);
  const monthlyBenefitCents = bankersRound(monthlyBenefitAtFRACents * adjustmentFactor);
  const annualBenefitCents = monthlyBenefitCents * 12;

  // Break-even vs claiming at 62
  const breakEvenAge = calculateBreakEvenAge(monthlyBenefitAtFRACents, claimAge);

  return {
    claimAge,
    monthlyBenefitCents,
    annualBenefitCents,
    adjustmentFactor: Math.round(adjustmentFactor * 10000) / 10000,
    breakEvenAge,
  };
}

/**
 * Calculate break-even age for claiming at a given age vs claiming at 62.
 *
 * @param piaCents - PIA at FRA in cents.
 * @param claimAge - Age being evaluated.
 * @returns Age at which total lifetime benefits surpass claiming at 62.
 */
function calculateBreakEvenAge(piaCents: number, claimAge: SocialSecurityClaimAge): number {
  if (claimAge === 62) return 62;

  const benefit62 = bankersRound(piaCents * getSSAdjustmentFactor(62));
  const benefitClaim = bankersRound(piaCents * getSSAdjustmentFactor(claimAge));

  if (benefitClaim <= benefit62) return claimAge;

  // Total at age X from claiming at 62: benefit62 * 12 * (X - 62)
  // Total at age X from claiming at claimAge: benefitClaim * 12 * (X - claimAge)
  // Break even: benefit62 * (X - 62) = benefitClaim * (X - claimAge)
  // X * (benefitClaim - benefit62) = benefitClaim * claimAge - benefit62 * 62
  const denominator = benefitClaim - benefit62;
  if (denominator <= 0) return 100; // Never breaks even

  const breakEvenExact = safeDivide(benefitClaim * claimAge - benefit62 * 62, denominator);
  return Math.ceil(breakEvenExact);
}

/**
 * Generate Social Security estimates for all standard claiming ages.
 *
 * @param monthlyBenefitAtFRACents - PIA at full retirement age in cents.
 * @returns Array of estimates for ages 62-70.
 */
export function estimateAllClaimingAges(
  monthlyBenefitAtFRACents: number,
): readonly SocialSecurityEstimate[] {
  const ages: SocialSecurityClaimAge[] = [62, 63, 64, 65, 66, 67, 68, 69, 70];
  return ages.map((age) => estimateSocialSecurityBenefit(monthlyBenefitAtFRACents, age));
}

// ---------------------------------------------------------------------------
// Pension present value
// ---------------------------------------------------------------------------

/**
 * Calculate the present value of a pension or annuity stream.
 *
 * Uses the present value of an annuity formula:
 * PV = PMT × [(1 - (1 + r)^-n) / r]
 *
 * Adjusts for COLA if provided.
 *
 * @param stream - The guaranteed income stream.
 * @param currentAge - Owner's current age.
 * @param discountRate - Annual discount rate as decimal (e.g. 0.04 = 4%).
 * @param lifeExpectancy - Expected age at death (default 90).
 * @returns Present value calculation result.
 */
export function calculatePensionPresentValue(
  stream: GuaranteedIncomeStream,
  currentAge: number,
  discountRate: number,
  lifeExpectancy: number = 90,
): PensionPresentValue {
  const endAge = stream.endAge ?? lifeExpectancy;
  const startAge = Math.max(stream.startAge, currentAge);
  const paymentYears = Math.max(0, endAge - startAge);

  if (paymentYears <= 0 || discountRate < 0) {
    return {
      streamId: stream.id,
      presentValueCents: 0,
      totalNominalCents: 0,
      discountRate,
      paymentYears: 0,
    };
  }

  const annualPayment = stream.monthlyPaymentCents * 12;
  let presentValue = 0;
  let totalNominal = 0;
  const yearsUntilStart = Math.max(0, startAge - currentAge);

  for (let year = 0; year < paymentYears; year++) {
    // Adjust for COLA
    const adjustedPayment = bankersRound(annualPayment * Math.pow(1 + stream.colaRate, year));
    totalNominal += adjustedPayment;

    // Discount back to present
    const discountYears = yearsUntilStart + year;
    const discountFactor = Math.pow(1 + discountRate, discountYears);
    presentValue += safeDivide(adjustedPayment, discountFactor);
  }

  return {
    streamId: stream.id,
    presentValueCents: bankersRound(presentValue),
    totalNominalCents: totalNominal,
    discountRate,
    paymentYears,
  };
}

// ---------------------------------------------------------------------------
// Combined guaranteed income floor
// ---------------------------------------------------------------------------

/**
 * Calculate total guaranteed monthly income at a given age.
 *
 * Sums all active income streams (started and not ended) at the target age,
 * applying COLA adjustments from each stream's start age.
 *
 * @param streams - All guaranteed income streams.
 * @param targetAge - Age at which to evaluate income.
 * @returns Total guaranteed monthly income in cents.
 */
export function calculateGuaranteedMonthlyIncome(
  streams: readonly GuaranteedIncomeStream[],
  targetAge: number,
): number {
  let total = 0;

  for (const stream of streams) {
    if (targetAge < stream.startAge) continue;
    if (stream.endAge !== null && targetAge >= stream.endAge) continue;

    const yearsActive = targetAge - stream.startAge;
    const adjustedMonthly = bankersRound(
      stream.monthlyPaymentCents * Math.pow(1 + stream.colaRate, yearsActive),
    );
    total += adjustedMonthly;
  }

  return total;
}

// ---------------------------------------------------------------------------
// Gap analysis
// ---------------------------------------------------------------------------

/**
 * Analyze the gap between guaranteed income and desired retirement spending.
 *
 * @param streams - All guaranteed income streams.
 * @param desiredMonthlyCents - Desired monthly spending in cents.
 * @param targetAge - Age at which to evaluate (typically retirement age).
 * @returns Gap analysis result.
 */
export function analyzeIncomeGap(
  streams: readonly GuaranteedIncomeStream[],
  desiredMonthlyCents: number,
  targetAge: number,
): IncomeGapAnalysis {
  const guaranteedMonthlyCents = calculateGuaranteedMonthlyIncome(streams, targetAge);
  const monthlyGapCents = guaranteedMonthlyCents - desiredMonthlyCents;
  const annualGapCents = monthlyGapCents * 12;
  const coveragePercent =
    desiredMonthlyCents > 0
      ? Math.round(safeDivide(guaranteedMonthlyCents * 10000, desiredMonthlyCents)) / 100
      : 0;

  // Filter to active streams at target age
  const activeStreams = streams.filter((s) => {
    if (targetAge < s.startAge) return false;
    if (s.endAge !== null && targetAge >= s.endAge) return false;
    return true;
  });

  return {
    guaranteedMonthlyCents,
    desiredMonthlyCents,
    monthlyGapCents,
    annualGapCents,
    coveragePercent,
    streams: activeStreams,
  };
}
