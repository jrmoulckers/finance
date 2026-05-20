// SPDX-License-Identifier: BUSL-1.1

/**
 * Student loan optimization engine.
 *
 * Implements standard repayment, income-driven repayment (IDR) plans
 * (IBR, PAYE, REPAYE, ICR), and PSLF (Public Service Loan Forgiveness)
 * tracking with tax implications.
 *
 * IDR payment formulas:
 *   IBR:    15% of discretionary income (old borrowers) / 10% (new)
 *   PAYE:   10% of discretionary income
 *   REPAYE: 10% of discretionary income (includes spouse income)
 *   ICR:    20% of discretionary income OR 12-year fixed payment (lesser)
 *
 * Discretionary income = AGI - 150% × federal poverty level
 *
 * All monetary values are integer cents. Interest uses banker's rounding.
 * Pure functions — no side effects.
 *
 * References: issues #1681, #1761
 */

import type {
  IdrInput,
  IdrPlanResult,
  IdrPlanType,
  PslfTracker,
  RepaymentComparison,
  StudentLoan,
} from './debt-types';
import { bankersRound, calculateMonthlyInterestCents } from './debt-payoff-engine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** PSLF requires 120 qualifying monthly payments. */
export const PSLF_REQUIRED_PAYMENTS = 120;

/** Standard repayment term in months. */
const STANDARD_TERM_MONTHS = 120; // 10 years

/** IDR forgiveness term in months. */
const IDR_FORGIVENESS_MONTHS: Record<IdrPlanType, number> = {
  IBR: 300, // 25 years
  PAYE: 240, // 20 years
  REPAYE: 240, // 20 years (undergraduate), using 20 as default
  ICR: 300, // 25 years
};

/** Discretionary income percentages for each IDR plan. */
const IDR_INCOME_PERCENT: Record<IdrPlanType, number> = {
  IBR: 10, // 10% for new borrowers (post-July 2014)
  PAYE: 10,
  REPAYE: 10,
  ICR: 20,
};

/**
 * 2024 Federal Poverty Level guidelines (48 contiguous states + DC).
 * Values in cents. Source: HHS Poverty Guidelines.
 * Index 0 = 1-person household, etc.
 */
export const FEDERAL_POVERTY_LEVELS: readonly number[] = [
  1558000, // 1 person: $15,580
  2108000, // 2 persons: $21,080
  2658000, // 3 persons: $26,580
  3208000, // 4 persons: $32,080
  3758000, // 5 persons: $37,580
  4308000, // 6 persons: $43,080
  4858000, // 7 persons: $48,580
  5408000, // 8 persons: $54,080
];

/** Additional amount per person beyond 8 (in cents). */
const FPL_PER_ADDITIONAL_PERSON = 550000; // $5,500

/** Estimated marginal tax rate for forgiveness taxation. */
const ESTIMATED_TAX_RATE_BPS = 2200; // 22%

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the federal poverty level for a given family size in cents.
 */
function getFederalPovertyLevel(familySize: number): number {
  if (familySize <= 0) return FEDERAL_POVERTY_LEVELS[0];
  if (familySize <= FEDERAL_POVERTY_LEVELS.length) {
    return FEDERAL_POVERTY_LEVELS[familySize - 1];
  }
  // Beyond 8 persons: base for 8 + per-person increment
  const base = FEDERAL_POVERTY_LEVELS[FEDERAL_POVERTY_LEVELS.length - 1];
  return base + (familySize - FEDERAL_POVERTY_LEVELS.length) * FPL_PER_ADDITIONAL_PERSON;
}

/**
 * Calculates discretionary income in cents.
 * Discretionary income = AGI - 150% × FPL
 */
function calculateDiscretionaryIncome(annualIncomeCents: number, familySize: number): number {
  const fpl = getFederalPovertyLevel(familySize);
  // 150% of FPL — use integer math: fpl * 150 / 100
  const threshold = bankersRound((fpl * 150) / 100);
  return Math.max(0, annualIncomeCents - threshold);
}

// ---------------------------------------------------------------------------
// Standard repayment
// ---------------------------------------------------------------------------

/**
 * Calculates the standard 10-year fixed monthly payment.
 *
 * Uses the standard amortization formula:
 *   P = L × [r(1+r)^n] / [(1+r)^n - 1]
 * where L = loan balance, r = monthly rate, n = number of months.
 *
 * @param totalBalanceCents - Combined loan balance in cents.
 * @param weightedAnnualRateBps - Weighted average annual rate in basis points.
 * @returns Monthly payment in cents.
 */
export function calculateStandardPayment(
  totalBalanceCents: number,
  weightedAnnualRateBps: number,
): number {
  if (totalBalanceCents <= 0) return 0;
  if (weightedAnnualRateBps <= 0) {
    // 0% interest: just divide evenly
    return bankersRound(totalBalanceCents / STANDARD_TERM_MONTHS);
  }

  const monthlyRate = weightedAnnualRateBps / (100 * 100 * 12);
  const n = STANDARD_TERM_MONTHS;
  const factor = Math.pow(1 + monthlyRate, n);
  const payment = totalBalanceCents * ((monthlyRate * factor) / (factor - 1));
  return bankersRound(payment);
}

// ---------------------------------------------------------------------------
// IDR payment calculation
// ---------------------------------------------------------------------------

/**
 * Calculates the monthly payment under an IDR plan.
 *
 * @param planType - The IDR plan type.
 * @param input - Income and family information.
 * @param totalBalanceCents - Total federal loan balance.
 * @param weightedAnnualRateBps - Weighted average annual rate in bps.
 * @returns Monthly payment in cents.
 */
export function calculateIdrPayment(
  planType: IdrPlanType,
  input: IdrInput,
  totalBalanceCents: number,
  weightedAnnualRateBps: number,
): number {
  if (totalBalanceCents <= 0) return 0;

  let effectiveIncome = input.annualIncomeCents;

  // REPAYE always includes spouse income regardless of filing status
  if (planType === 'REPAYE' && input.spouseIncomeCents) {
    effectiveIncome += input.spouseIncomeCents;
  }
  // IBR/PAYE: include spouse income only if filing jointly
  else if (
    (planType === 'IBR' || planType === 'PAYE') &&
    input.filingStatus === 'married_filing_jointly' &&
    input.spouseIncomeCents
  ) {
    effectiveIncome += input.spouseIncomeCents;
  }

  const discretionary = calculateDiscretionaryIncome(effectiveIncome, input.familySize);
  const percent = IDR_INCOME_PERCENT[planType];
  const annualPayment = bankersRound((discretionary * percent) / 100);
  const monthlyPayment = bankersRound(annualPayment / 12);

  // IDR payment is capped at the standard 10-year payment
  const standardPayment = calculateStandardPayment(totalBalanceCents, weightedAnnualRateBps);

  // ICR also considers a 12-year fixed payment
  if (planType === 'ICR') {
    const payment12yr = calculateFixedPayment(totalBalanceCents, weightedAnnualRateBps, 144);
    return Math.min(monthlyPayment, payment12yr, standardPayment);
  }

  return Math.min(monthlyPayment, standardPayment);
}

/**
 * Calculates a fixed monthly payment for a given term.
 */
function calculateFixedPayment(
  balanceCents: number,
  annualRateBps: number,
  termMonths: number,
): number {
  if (balanceCents <= 0 || termMonths <= 0) return 0;
  if (annualRateBps <= 0) {
    return bankersRound(balanceCents / termMonths);
  }
  const monthlyRate = annualRateBps / (100 * 100 * 12);
  const factor = Math.pow(1 + monthlyRate, termMonths);
  return bankersRound(balanceCents * ((monthlyRate * factor) / (factor - 1)));
}

// ---------------------------------------------------------------------------
// IDR plan result simulation
// ---------------------------------------------------------------------------

/**
 * Simulates an IDR or standard plan through its full term.
 *
 * @param planType - Plan type (IDR type or 'STANDARD').
 * @param monthlyPaymentCents - Monthly payment amount.
 * @param totalBalanceCents - Starting balance.
 * @param weightedAnnualRateBps - Weighted average rate.
 * @param forgivenessMonths - Months until forgiveness (for IDR).
 * @param isTaxFree - Whether forgiveness is tax-free (PSLF).
 * @returns Full plan result.
 */
export function calculateIdrPlanResult(
  planType: IdrPlanType | 'STANDARD',
  monthlyPaymentCents: number,
  totalBalanceCents: number,
  weightedAnnualRateBps: number,
  forgivenessMonths: number = planType === 'STANDARD'
    ? STANDARD_TERM_MONTHS
    : IDR_FORGIVENESS_MONTHS[planType as IdrPlanType],
  isTaxFree: boolean = false,
): IdrPlanResult {
  if (totalBalanceCents <= 0) {
    return {
      planType,
      monthlyPaymentCents: 0,
      totalPaidCents: 0,
      totalInterestCents: 0,
      monthsToForgiveness: 0,
      forgivenAmountCents: 0,
      isForgivenessTaxable: false,
      estimatedTaxOnForgivenessCents: 0,
    };
  }

  let balance = totalBalanceCents;
  let totalPaid = 0;
  let totalInterest = 0;
  let month = 0;

  while (balance > 0 && month < forgivenessMonths) {
    month++;
    const interest = calculateMonthlyInterestCents(balance, weightedAnnualRateBps);
    const payment = Math.min(monthlyPaymentCents, balance + interest);
    const principal = Math.max(0, payment - interest);
    balance = Math.max(0, balance - principal);

    // For IDR plans, if payment < interest, balance grows (negative amortization)
    if (payment < interest) {
      balance += interest - payment;
      totalPaid += payment;
      totalInterest += interest;
      continue;
    }

    totalPaid += payment;
    totalInterest += interest;
  }

  // Handle final balance rounding: if balance is very small (within rounding error),
  // treat it as 0 (especially important for standard plans that should pay off exactly)
  const forgivenAmount = Math.max(0, balance <= 50 ? 0 : balance);
  const isForgivenessTaxable = !isTaxFree && forgivenAmount > 0;
  const estimatedTax = isForgivenessTaxable
    ? bankersRound((forgivenAmount * ESTIMATED_TAX_RATE_BPS) / 10000)
    : 0;

  return {
    planType,
    monthlyPaymentCents,
    totalPaidCents: totalPaid,
    totalInterestCents: totalInterest,
    monthsToForgiveness: month,
    forgivenAmountCents: forgivenAmount,
    isForgivenessTaxable,
    estimatedTaxOnForgivenessCents: estimatedTax,
  };
}

// ---------------------------------------------------------------------------
// PSLF tracker
// ---------------------------------------------------------------------------

/**
 * Calculates PSLF progress and projected forgiveness.
 *
 * PSLF forgives remaining balance after 120 qualifying payments.
 * PSLF forgiveness is tax-free (unlike IDR forgiveness).
 *
 * @param loans - Federal student loans eligible for PSLF.
 * @param qualifyingPaymentsMade - Total qualifying payments already made.
 * @param todayIso - Today's date as ISO string (YYYY-MM-DD).
 * @param monthlyPaymentCents - Current monthly IDR payment.
 * @param weightedAnnualRateBps - Weighted average annual rate.
 * @returns PSLF tracking result.
 */
export function calculatePslfTracker(
  loans: readonly StudentLoan[],
  qualifyingPaymentsMade: number,
  todayIso: string,
  monthlyPaymentCents: number,
  weightedAnnualRateBps: number,
): PslfTracker {
  const paymentsRemaining = Math.max(0, PSLF_REQUIRED_PAYMENTS - qualifyingPaymentsMade);
  const progressPercent =
    PSLF_REQUIRED_PAYMENTS > 0
      ? Math.min(100, Math.round((qualifyingPaymentsMade * 100) / PSLF_REQUIRED_PAYMENTS))
      : 0;

  // Calculate estimated forgiveness date
  const today = new Date(todayIso);
  const forgivenessDate = new Date(today);
  forgivenessDate.setMonth(forgivenessDate.getMonth() + paymentsRemaining);
  const estimatedForgivenessDate = forgivenessDate.toISOString().slice(0, 10);

  // Project remaining balance at forgiveness
  let totalBalance = 0;
  for (const loan of loans) {
    if (loan.isPslfEligible) {
      totalBalance += loan.balanceCents;
    }
  }

  // Simulate payments through remaining months
  let balance = totalBalance;
  for (let i = 0; i < paymentsRemaining; i++) {
    const interest = calculateMonthlyInterestCents(balance, weightedAnnualRateBps);
    const payment = Math.min(monthlyPaymentCents, balance + interest);
    const principal = Math.max(0, payment - interest);
    balance = Math.max(0, balance - principal);
    if (payment < interest) {
      balance += interest - payment;
    }
  }

  return {
    qualifyingPayments: qualifyingPaymentsMade,
    paymentsRemaining,
    estimatedForgivenessDate,
    projectedForgivenAmountCents: Math.max(0, balance),
    isTaxFree: true, // PSLF forgiveness is always tax-free
    progressPercent,
  };
}

// ---------------------------------------------------------------------------
// Repayment plan comparison
// ---------------------------------------------------------------------------

/**
 * Compares all repayment plan options for a set of student loans.
 *
 * @param loans - All student loans.
 * @param input - Income/family information for IDR calculations.
 * @param todayIso - Today's date (ISO string).
 * @returns Full comparison across all plan types.
 */
export function compareRepaymentPlans(
  loans: readonly StudentLoan[],
  input: IdrInput,
  todayIso: string,
): RepaymentComparison {
  // Calculate combined balance and weighted average rate
  let totalBalanceCents = 0;
  let rateWeightedSum = 0;
  let pslfEligibleCount = 0;
  let totalPslfPayments = 0;

  for (const loan of loans) {
    totalBalanceCents += loan.balanceCents;
    rateWeightedSum += loan.balanceCents * loan.annualRateBps;
    if (loan.isPslfEligible) {
      pslfEligibleCount++;
      totalPslfPayments = Math.max(totalPslfPayments, loan.pslfPaymentsMade);
    }
  }

  const weightedRateBps =
    totalBalanceCents > 0 ? bankersRound(rateWeightedSum / totalBalanceCents) : 0;

  // Standard repayment
  const standardPayment = calculateStandardPayment(totalBalanceCents, weightedRateBps);
  const standard = calculateIdrPlanResult(
    'STANDARD',
    standardPayment,
    totalBalanceCents,
    weightedRateBps,
    STANDARD_TERM_MONTHS,
    false,
  );

  // IDR plans
  const planTypes: IdrPlanType[] = ['IBR', 'PAYE', 'REPAYE', 'ICR'];
  const idrPlans = planTypes.map((planType) => {
    const payment = calculateIdrPayment(planType, input, totalBalanceCents, weightedRateBps);
    return calculateIdrPlanResult(
      planType,
      payment,
      totalBalanceCents,
      weightedRateBps,
      IDR_FORGIVENESS_MONTHS[planType],
      false,
    );
  });

  // PSLF (if eligible)
  let pslf: PslfTracker | null = null;
  if (pslfEligibleCount > 0) {
    // Use REPAYE payment for PSLF (typically best combo)
    const pslfPayment = calculateIdrPayment('REPAYE', input, totalBalanceCents, weightedRateBps);
    pslf = calculatePslfTracker(loans, totalPslfPayments, todayIso, pslfPayment, weightedRateBps);
  }

  // Find cheapest option
  // Total cost = total paid + tax on forgiveness
  const standardCost = standard.totalPaidCents + standard.estimatedTaxOnForgivenessCents;
  let bestPlan: IdrPlanType | 'STANDARD' | 'PSLF' = 'STANDARD';
  let bestCost = standardCost;

  for (const plan of idrPlans) {
    const cost = plan.totalPaidCents + plan.estimatedTaxOnForgivenessCents;
    if (cost < bestCost) {
      bestCost = cost;
      bestPlan = plan.planType as IdrPlanType;
    }
  }

  // PSLF cost = payments only (forgiveness is tax-free)
  if (pslf) {
    // Estimate PSLF total paid
    const pslfPayment = calculateIdrPayment('REPAYE', input, totalBalanceCents, weightedRateBps);
    const pslfTotalPaid = pslfPayment * PSLF_REQUIRED_PAYMENTS;
    if (pslfTotalPaid < bestCost) {
      bestCost = pslfTotalPaid;
      bestPlan = 'PSLF';
    }
  }

  const savingsVsStandard = standardCost - bestCost;

  return {
    standard,
    idrPlans,
    pslf,
    recommendedPlan: bestPlan,
    savingsVsStandardCents: Math.max(0, savingsVsStandard),
  };
}
