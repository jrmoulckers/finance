// SPDX-License-Identifier: BUSL-1.1

/**
 * HSA and FSA contribution tracking with qualified-expense visibility.
 *
 * Implements:
 * - HSA contribution limits (2024: $4,150 individual, $8,300 family, +$1,000 at 55+)
 * - FSA limits ($3,200 annual election, $640 max rollover)
 * - Qualified expense categorization per IRS Publication 502
 * - Receipt/expense matching and remaining-balance calculation
 * - Triple tax advantage calculator for HSA
 * - FSA deadline and forfeiture alerts
 *
 * All monetary values are in integer cents. Pure functions only.
 *
 * References: IRS Pub 502, Rev. Proc. 2023-34, issue #1657
 */

import {
  HSACoverageType,
  type HSAAccount,
  type FSAAccount,
  type QualifiedExpense,
  type HSAContributionLimits,
  type HSATripleTaxAdvantage,
  type FSADeadlineAlert,
} from './types';

// ---------------------------------------------------------------------------
// 2024 Limits
// ---------------------------------------------------------------------------

/** HSA individual contribution limit for 2024 (cents). */
const HSA_INDIVIDUAL_LIMIT_2024 = 4_150_00;

/** HSA family contribution limit for 2024 (cents). */
const HSA_FAMILY_LIMIT_2024 = 8_300_00;

/** HSA catch-up contribution for age 55+ (cents). */
const HSA_CATCHUP_2024 = 1_000_00;

/** Minimum age for HSA catch-up contributions. */
const HSA_CATCHUP_AGE = 55;

/** FSA annual election limit for 2024 (cents). */
const FSA_ELECTION_LIMIT_2024 = 3_200_00;

/** FSA maximum rollover for 2024 (cents). */
const FSA_ROLLOVER_MAX_2024 = 640_00;

// ---------------------------------------------------------------------------
// Banker's rounding helper
// ---------------------------------------------------------------------------

/**
 * Round a number using banker's rounding (round half to even).
 *
 * @param value - Value to round
 * @returns Rounded integer
 */
function bankersRound(value: number): number {
  const floor = Math.floor(value);
  const decimal = value - floor;

  if (decimal > 0.5) return floor + 1;
  if (decimal < 0.5) return floor;
  // Exactly 0.5 — round to even
  return floor % 2 === 0 ? floor : floor + 1;
}

// ---------------------------------------------------------------------------
// HSA functions
// ---------------------------------------------------------------------------

/**
 * Get the HSA base contribution limit for 2024 by coverage type.
 *
 * @param coverageType - Individual or family coverage
 * @returns Base limit in cents
 */
export function getHSABaseLimit(coverageType: HSACoverageType): number {
  return coverageType === HSACoverageType.INDIVIDUAL
    ? HSA_INDIVIDUAL_LIMIT_2024
    : HSA_FAMILY_LIMIT_2024;
}

/**
 * Calculate HSA contribution limits including catch-up eligibility.
 *
 * @param account - HSA account with coverage and age info
 * @returns Contribution limit breakdown
 *
 * @example
 * ```ts
 * const limits = calculateHSALimits({
 *   coverageType: HSACoverageType.INDIVIDUAL,
 *   holderAge: 57,
 *   ytdContributionsCents: 2_000_00,
 *   employerContributionsCents: 500_00,
 *   // ...other fields
 * });
 * // limits.totalLimitCents === 5_150_00 (4,150 + 1,000 catch-up)
 * // limits.remainingCents === 2_650_00
 * ```
 */
export function calculateHSALimits(account: HSAAccount): HSAContributionLimits {
  const baseLimitCents = getHSABaseLimit(account.coverageType);
  const catchUpCents = account.holderAge >= HSA_CATCHUP_AGE ? HSA_CATCHUP_2024 : 0;
  const totalLimitCents = baseLimitCents + catchUpCents;

  const totalContributed = account.ytdContributionsCents + account.employerContributionsCents;
  const remainingCents = Math.max(0, totalLimitCents - totalContributed);

  return {
    baseLimitCents,
    catchUpCents,
    totalLimitCents,
    employerContributionsCents: account.employerContributionsCents,
    remainingCents,
  };
}

/**
 * Calculate the HSA triple tax advantage estimate.
 *
 * The three tax benefits:
 * 1. Tax-deductible contributions (income tax savings)
 * 2. Tax-free investment growth
 * 3. Tax-free withdrawals for qualified medical expenses
 *
 * @param contributionCents - Annual contribution amount (cents)
 * @param marginalRate - Marginal income tax rate as decimal (0.22 = 22%)
 * @param estimatedGrowthRate - Estimated annual growth rate as decimal (0.07 = 7%)
 * @param qualifiedExpensesCents - Qualified expenses to withdraw tax-free (cents)
 * @returns Triple tax advantage breakdown
 */
export function calculateHSATripleTaxAdvantage(
  contributionCents: number,
  marginalRate: number,
  estimatedGrowthRate: number,
  qualifiedExpensesCents: number,
): HSATripleTaxAdvantage {
  // Guard against invalid rates
  const safeRate = Math.max(0, Math.min(1, marginalRate));
  const safeGrowth = Math.max(0, estimatedGrowthRate);

  // 1. Tax savings from deductible contributions
  const contributionTaxSavingsCents = bankersRound(contributionCents * safeRate);

  // 2. Tax-free growth (estimated one-year growth taxed at marginal rate)
  const estimatedGrowth = bankersRound(contributionCents * safeGrowth);
  const taxFreeGrowthCents = bankersRound(estimatedGrowth * safeRate);

  // 3. Tax-free withdrawals for qualified expenses
  const taxFreeWithdrawalCents = bankersRound(qualifiedExpensesCents * safeRate);

  const totalAdvantageCents =
    contributionTaxSavingsCents + taxFreeGrowthCents + taxFreeWithdrawalCents;

  return {
    contributionTaxSavingsCents,
    taxFreeGrowthCents,
    taxFreeWithdrawalCents,
    totalAdvantageCents,
  };
}

/**
 * Calculate the remaining HSA balance available for expenses.
 *
 * @param account - HSA account
 * @param expenses - Qualified expenses (both reimbursed and pending)
 * @returns Available balance in cents
 */
export function getHSAAvailableBalance(
  account: HSAAccount,
  expenses: readonly QualifiedExpense[],
): number {
  const pendingReimbursements = expenses
    .filter((e) => e.accountId === account.id && !e.reimbursed)
    .reduce((sum, e) => sum + e.amountCents, 0);

  return Math.max(0, account.balanceCents - pendingReimbursements);
}

// ---------------------------------------------------------------------------
// FSA functions
// ---------------------------------------------------------------------------

/**
 * Get the 2024 FSA annual election limit (cents).
 *
 * @returns FSA election limit in cents
 */
export function getFSAElectionLimit(): number {
  return FSA_ELECTION_LIMIT_2024;
}

/**
 * Get the 2024 FSA maximum rollover amount (cents).
 *
 * @returns FSA rollover max in cents
 */
export function getFSARolloverMax(): number {
  return FSA_ROLLOVER_MAX_2024;
}

/**
 * Calculate the remaining FSA balance available for reimbursement.
 *
 * @param account - FSA account
 * @returns Available balance in cents (election + rollover - reimbursements)
 */
export function getFSAAvailableBalance(account: FSAAccount): number {
  const totalAvailable = account.electionCents + account.rolloverAmountCents;
  return Math.max(0, totalAvailable - account.ytdReimbursementsCents);
}

/**
 * Calculate the FSA rollover amount (capped at $640 max).
 *
 * @param unusedCents - Unused FSA funds at year end (cents)
 * @param rolloverEnabled - Whether the plan supports rollover
 * @returns Rollover amount in cents (0 if rollover not enabled)
 */
export function calculateFSARollover(unusedCents: number, rolloverEnabled: boolean): number {
  if (!rolloverEnabled) return 0;
  return Math.min(Math.max(0, unusedCents), FSA_ROLLOVER_MAX_2024);
}

/**
 * Calculate FSA deadline alert for at-risk funds.
 *
 * @param account - FSA account
 * @param currentDate - Current date (ISO 8601 string)
 * @returns Deadline alert with urgency and at-risk amount
 */
export function calculateFSADeadlineAlert(
  account: FSAAccount,
  currentDate: string,
): FSADeadlineAlert {
  const now = new Date(currentDate);
  const planEnd = new Date(account.planYearEnd);
  const graceEnd = account.gracePeriodEnd ? new Date(account.gracePeriodEnd) : null;

  const msPerDay = 86_400_000;
  const daysUntilPlanYearEnd = Math.max(
    0,
    Math.ceil((planEnd.getTime() - now.getTime()) / msPerDay),
  );
  const daysUntilGracePeriodEnd = graceEnd
    ? Math.max(0, Math.ceil((graceEnd.getTime() - now.getTime()) / msPerDay))
    : null;

  const unusedFunds = getFSAAvailableBalance(account);
  const rolloverSafe = account.rolloverEnabled ? Math.min(unusedFunds, FSA_ROLLOVER_MAX_2024) : 0;
  const atRiskCents = Math.max(0, unusedFunds - rolloverSafe);

  // Urgent if effective deadline is within 30 days
  const effectiveDaysLeft = daysUntilGracePeriodEnd ?? daysUntilPlanYearEnd;
  const isUrgent = effectiveDaysLeft <= 30 && atRiskCents > 0;

  return {
    accountId: account.id,
    daysUntilPlanYearEnd,
    daysUntilGracePeriodEnd,
    atRiskCents,
    isUrgent,
  };
}

// ---------------------------------------------------------------------------
// Qualified expense functions
// ---------------------------------------------------------------------------

/**
 * Filter expenses to only those matching a given account.
 *
 * @param expenses - All qualified expenses
 * @param accountId - Account to filter by
 * @returns Expenses for the specified account
 */
export function getExpensesForAccount(
  expenses: readonly QualifiedExpense[],
  accountId: string,
): readonly QualifiedExpense[] {
  return expenses.filter((e) => e.accountId === accountId);
}

/**
 * Calculate total unreimbursed qualified expenses for an account.
 *
 * @param expenses - All qualified expenses
 * @param accountId - Account to filter by
 * @returns Total unreimbursed amount in cents
 */
export function getUnreimbursedTotal(
  expenses: readonly QualifiedExpense[],
  accountId: string,
): number {
  return expenses
    .filter((e) => e.accountId === accountId && !e.reimbursed)
    .reduce((sum, e) => sum + e.amountCents, 0);
}

/**
 * Summarize qualified expenses by category for an account.
 *
 * @param expenses - All qualified expenses
 * @param accountId - Account to filter by
 * @returns Map of category to total amount (cents)
 */
export function summarizeExpensesByCategory(
  expenses: readonly QualifiedExpense[],
  accountId: string,
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();

  for (const e of expenses) {
    if (e.accountId !== accountId) continue;
    const current = result.get(e.category) ?? 0;
    result.set(e.category, current + e.amountCents);
  }

  return result;
}

/**
 * Get expenses missing receipt verification for an account.
 *
 * @param expenses - All qualified expenses
 * @param accountId - Account to filter by
 * @returns Expenses without verified receipts
 */
export function getExpensesMissingReceipts(
  expenses: readonly QualifiedExpense[],
  accountId: string,
): readonly QualifiedExpense[] {
  return expenses.filter((e) => e.accountId === accountId && !e.receiptVerified);
}
