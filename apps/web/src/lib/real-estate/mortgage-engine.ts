// SPDX-License-Identifier: BUSL-1.1

/**
 * Full mortgage amortization engine with PMI removal alerts.
 *
 * Generates monthly P&I breakdown, calculates total interest,
 * remaining balance at any point, PMI eligibility, extra payment
 * impact, and refinance comparison.
 *
 * All monetary values are integer cents. Interest rates are in
 * basis points (1 bp = 0.01%).
 *
 * References: issue #1691
 */

import { bankersRound } from './home-equity';
import type {
  AmortizationEntry,
  AmortizationSchedule,
  ExtraPaymentImpact,
  PMIStatus,
  RefinanceComparison,
} from './types';

// ---------------------------------------------------------------------------
// Monthly payment calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the fixed monthly payment for a fully amortizing loan.
 *
 * Uses the standard amortization formula:
 *   M = P × [r(1+r)^n] / [(1+r)^n - 1]
 *
 * @param loanAmountCents - Loan principal in cents.
 * @param annualRateBps - Annual interest rate in basis points.
 * @param termMonths - Loan term in months.
 * @returns Monthly payment in cents.
 */
export function calculateMonthlyPayment(
  loanAmountCents: number,
  annualRateBps: number,
  termMonths: number,
): number {
  if (loanAmountCents <= 0 || termMonths <= 0) {
    return 0;
  }

  // Zero-interest loan
  if (annualRateBps === 0) {
    return bankersRound(loanAmountCents / termMonths);
  }

  const monthlyRate = annualRateBps / 10000 / 12;
  const factor = Math.pow(1 + monthlyRate, termMonths);
  const payment = (loanAmountCents * (monthlyRate * factor)) / (factor - 1);

  return bankersRound(payment);
}

// ---------------------------------------------------------------------------
// Full amortization schedule
// ---------------------------------------------------------------------------

/**
 * Generate a full amortization schedule for a mortgage.
 *
 * @param loanAmountCents - Original loan principal in cents.
 * @param annualRateBps - Annual interest rate in basis points.
 * @param termMonths - Loan term in months.
 * @returns Complete amortization schedule with all monthly entries.
 */
export function generateAmortizationSchedule(
  loanAmountCents: number,
  annualRateBps: number,
  termMonths: number,
): AmortizationSchedule {
  const monthlyPaymentCents = calculateMonthlyPayment(loanAmountCents, annualRateBps, termMonths);

  if (monthlyPaymentCents === 0) {
    return {
      entries: [],
      totalInterestCents: 0,
      totalPaidCents: 0,
      loanAmountCents,
      monthlyPaymentCents: 0,
    };
  }

  const monthlyRate = annualRateBps / 10000 / 12;
  const entries: AmortizationEntry[] = [];
  let balance = loanAmountCents;
  let cumulativeInterest = 0;
  let cumulativePrincipal = 0;

  for (let i = 1; i <= termMonths; i++) {
    const interestCents = bankersRound(balance * monthlyRate);

    // Last payment: pay off remaining balance exactly
    const isLastPayment = i === termMonths || balance <= monthlyPaymentCents - interestCents;
    const principalCents = isLastPayment ? balance : monthlyPaymentCents - interestCents;
    const paymentCents = principalCents + interestCents;

    balance = Math.max(0, balance - principalCents);
    cumulativeInterest += interestCents;
    cumulativePrincipal += principalCents;

    entries.push({
      paymentNumber: i,
      paymentCents,
      principalCents,
      interestCents,
      remainingBalanceCents: balance,
      cumulativeInterestCents: cumulativeInterest,
      cumulativePrincipalCents: cumulativePrincipal,
    });

    if (balance === 0) break;
  }

  return {
    entries,
    totalInterestCents: cumulativeInterest,
    totalPaidCents: cumulativeInterest + loanAmountCents,
    loanAmountCents,
    monthlyPaymentCents,
  };
}

// ---------------------------------------------------------------------------
// Remaining balance at a point
// ---------------------------------------------------------------------------

/**
 * Calculate the remaining mortgage balance after a given number of payments.
 *
 * @param loanAmountCents - Original loan principal in cents.
 * @param annualRateBps - Annual interest rate in basis points.
 * @param termMonths - Original loan term in months.
 * @param paymentsMade - Number of payments already made.
 * @returns Remaining balance in cents.
 */
export function remainingBalance(
  loanAmountCents: number,
  annualRateBps: number,
  termMonths: number,
  paymentsMade: number,
): number {
  if (loanAmountCents <= 0 || paymentsMade >= termMonths) {
    return 0;
  }

  if (annualRateBps === 0) {
    const monthlyPayment = bankersRound(loanAmountCents / termMonths);
    return Math.max(0, loanAmountCents - monthlyPayment * paymentsMade);
  }

  const monthlyRate = annualRateBps / 10000 / 12;
  const factor = Math.pow(1 + monthlyRate, termMonths);
  const paidFactor = Math.pow(1 + monthlyRate, paymentsMade);

  // B(n) = P × [(1+r)^N - (1+r)^n] / [(1+r)^N - 1]
  const balance = (loanAmountCents * (factor - paidFactor)) / (factor - 1);

  return Math.max(0, bankersRound(balance));
}

// ---------------------------------------------------------------------------
// PMI status and removal
// ---------------------------------------------------------------------------

/** Default LTV threshold for PMI removal. */
const PMI_REMOVAL_LTV = 80;

/**
 * Determine PMI status and estimated removal timeline.
 *
 * PMI is required when LTV exceeds 80%. This function calculates
 * when the LTV will drop below 80% based on the amortization schedule.
 *
 * @param propertyValueCents - Current property value in cents.
 * @param loanAmountCents - Original loan principal in cents.
 * @param currentBalanceCents - Current mortgage balance in cents.
 * @param annualRateBps - Annual interest rate in basis points.
 * @param termMonths - Original loan term in months.
 * @param paymentsMade - Number of payments already made.
 * @returns PMI status with estimated removal timeline.
 */
export function calculatePMIStatus(
  propertyValueCents: number,
  loanAmountCents: number,
  currentBalanceCents: number,
  annualRateBps: number,
  termMonths: number,
  paymentsMade: number,
): PMIStatus {
  if (propertyValueCents <= 0) {
    return {
      isRequired: false,
      currentLTV: 0,
      removalThresholdLTV: PMI_REMOVAL_LTV,
      estimatedRemovalMonth: null,
      paymentsUntilRemoval: null,
    };
  }

  const currentLTV = Math.round((currentBalanceCents / propertyValueCents) * 10000) / 100;

  if (currentLTV <= PMI_REMOVAL_LTV) {
    return {
      isRequired: false,
      currentLTV,
      removalThresholdLTV: PMI_REMOVAL_LTV,
      estimatedRemovalMonth: null,
      paymentsUntilRemoval: null,
    };
  }

  // Find the month when LTV drops below 80%
  const targetBalance = bankersRound(propertyValueCents * (PMI_REMOVAL_LTV / 100));
  const monthlyPaymentCents = calculateMonthlyPayment(loanAmountCents, annualRateBps, termMonths);
  const monthlyRate = annualRateBps / 10000 / 12;

  let balance = currentBalanceCents;
  let monthsUntilRemoval = 0;

  const remainingMonths = termMonths - paymentsMade;
  for (let i = 0; i < remainingMonths; i++) {
    if (balance <= targetBalance) break;

    const interest = bankersRound(balance * monthlyRate);
    const principal = Math.min(monthlyPaymentCents - interest, balance);
    balance = Math.max(0, balance - principal);
    monthsUntilRemoval++;
  }

  const estimatedRemovalMonth = paymentsMade + monthsUntilRemoval;

  return {
    isRequired: true,
    currentLTV,
    removalThresholdLTV: PMI_REMOVAL_LTV,
    estimatedRemovalMonth,
    paymentsUntilRemoval: monthsUntilRemoval,
  };
}

// ---------------------------------------------------------------------------
// Extra payment impact
// ---------------------------------------------------------------------------

/**
 * Calculate the impact of making extra monthly payments on a mortgage.
 *
 * @param loanAmountCents - Original loan principal in cents.
 * @param annualRateBps - Annual interest rate in basis points.
 * @param termMonths - Original loan term in months.
 * @param extraMonthlyPaymentCents - Additional monthly payment in cents.
 * @param paymentsMade - Payments already made (schedule starts from current balance).
 * @returns Impact analysis comparing original and accelerated payoff.
 */
export function calculateExtraPaymentImpact(
  loanAmountCents: number,
  annualRateBps: number,
  termMonths: number,
  extraMonthlyPaymentCents: number,
  paymentsMade: number = 0,
): ExtraPaymentImpact {
  const originalSchedule = generateAmortizationSchedule(loanAmountCents, annualRateBps, termMonths);

  const originalPayoffMonths = originalSchedule.entries.length;
  const originalTotalInterestCents = originalSchedule.totalInterestCents;

  // Calculate current balance
  const currentBalance =
    paymentsMade > 0
      ? remainingBalance(loanAmountCents, annualRateBps, termMonths, paymentsMade)
      : loanAmountCents;

  if (currentBalance <= 0 || extraMonthlyPaymentCents <= 0) {
    return {
      originalPayoffMonths,
      newPayoffMonths: originalPayoffMonths,
      monthsSaved: 0,
      originalTotalInterestCents,
      newTotalInterestCents: originalTotalInterestCents,
      interestSavedCents: 0,
    };
  }

  // Simulate accelerated payoff
  const monthlyPaymentCents = calculateMonthlyPayment(loanAmountCents, annualRateBps, termMonths);
  const monthlyRate = annualRateBps / 10000 / 12;
  const totalPayment = monthlyPaymentCents + extraMonthlyPaymentCents;

  let balance = currentBalance;
  let newMonths = 0;
  let newInterest = 0;

  // Add interest already paid from original schedule
  if (paymentsMade > 0) {
    const paidEntries = originalSchedule.entries.slice(0, paymentsMade);
    for (const entry of paidEntries) {
      newInterest += entry.interestCents;
    }
  }

  const maxIterations = termMonths * 2; // Safety limit
  while (balance > 0 && newMonths < maxIterations) {
    const interest = bankersRound(balance * monthlyRate);
    const principal = Math.min(totalPayment - interest, balance);

    if (principal <= 0) {
      // Payment doesn't even cover interest
      break;
    }

    balance = Math.max(0, balance - principal);
    newInterest += interest;
    newMonths++;
  }

  const totalNewPayoffMonths = paymentsMade + newMonths;

  return {
    originalPayoffMonths,
    newPayoffMonths: totalNewPayoffMonths,
    monthsSaved: originalPayoffMonths - totalNewPayoffMonths,
    originalTotalInterestCents,
    newTotalInterestCents: newInterest,
    interestSavedCents: originalTotalInterestCents - newInterest,
  };
}

// ---------------------------------------------------------------------------
// Refinance comparison
// ---------------------------------------------------------------------------

/**
 * Compare current mortgage with a refinanced mortgage.
 *
 * @param currentBalanceCents - Remaining balance on the current mortgage in cents.
 * @param currentRateBps - Current annual interest rate in basis points.
 * @param currentRemainingMonths - Remaining months on current mortgage.
 * @param newRateBps - New annual interest rate in basis points.
 * @param newTermMonths - New loan term in months.
 * @param closingCostsCents - Closing costs for refinancing in cents.
 * @returns Comparison of current vs refinanced mortgage.
 */
export function compareRefinance(
  currentBalanceCents: number,
  currentRateBps: number,
  currentRemainingMonths: number,
  newRateBps: number,
  newTermMonths: number,
  closingCostsCents: number,
): RefinanceComparison {
  const currentSchedule = generateAmortizationSchedule(
    currentBalanceCents,
    currentRateBps,
    currentRemainingMonths,
  );

  const newSchedule = generateAmortizationSchedule(currentBalanceCents, newRateBps, newTermMonths);

  const currentTotalInterestCents = currentSchedule.totalInterestCents;
  const newTotalInterestCents = newSchedule.totalInterestCents;

  const interestSavingsCents = currentTotalInterestCents - newTotalInterestCents;

  const currentMonthlyPaymentCents = currentSchedule.monthlyPaymentCents;
  const newMonthlyPaymentCents = newSchedule.monthlyPaymentCents;
  const monthlySavingsCents = currentMonthlyPaymentCents - newMonthlyPaymentCents;

  // Break-even: months to recoup closing costs via monthly savings
  const breakEvenMonths =
    monthlySavingsCents > 0 ? Math.ceil(closingCostsCents / monthlySavingsCents) : null;

  return {
    currentTotalInterestCents,
    newTotalInterestCents,
    interestSavingsCents,
    currentMonthlyPaymentCents,
    newMonthlyPaymentCents,
    monthlySavingsCents,
    breakEvenMonths,
  };
}
