// SPDX-License-Identifier: BUSL-1.1

/**
 * Tax-efficient withdrawal sequencing and RMD calculator.
 *
 * Implements year-by-year retirement withdrawal planning with tax bracket
 * management, Required Minimum Distribution calculations, and Roth
 * conversion ladder analysis.
 *
 * All monetary values are integer cents. Uses banker's rounding for
 * financial divisions.
 *
 * References: #1688, #1737
 */

import type {
  AccountTaxType,
  RetirementAccount,
  RothConversionYear,
  TaxBracket,
  WithdrawalPlan,
  WithdrawalStrategy,
  WithdrawalYearPlan,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Banker's rounding (round half to even).
 *
 * @param value - The number to round.
 * @returns The rounded integer.
 */
export function bankersRound(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const floored = Math.floor(value);
  const diff = value - floored;
  if (Math.abs(diff - 0.5) < Number.EPSILON) {
    // Round to even
    return floored % 2 === 0 ? floored : floored + 1;
  }
  return Math.round(value);
}

/**
 * Safe division that returns 0 on divide-by-zero.
 *
 * @param numerator - The numerator.
 * @param denominator - The denominator.
 * @returns The quotient, or 0 if denominator is 0.
 */
export function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

// ---------------------------------------------------------------------------
// IRS Uniform Lifetime Table (simplified) for RMD
// ---------------------------------------------------------------------------

/**
 * Simplified IRS Uniform Lifetime Table distribution periods.
 * Maps age to the distribution period (divisor).
 * Under SECURE Act 2.0, RMDs begin at age 73 (born 1951-1959)
 * or 75 (born 1960+). We use 73 as default start.
 */
const UNIFORM_LIFETIME_TABLE: ReadonlyMap<number, number> = new Map([
  [72, 27.4],
  [73, 26.5],
  [74, 25.5],
  [75, 24.6],
  [76, 23.7],
  [77, 22.9],
  [78, 22.0],
  [79, 21.1],
  [80, 20.2],
  [81, 19.4],
  [82, 18.5],
  [83, 17.7],
  [84, 16.8],
  [85, 16.0],
  [86, 15.2],
  [87, 14.4],
  [88, 13.7],
  [89, 12.9],
  [90, 12.2],
  [91, 11.5],
  [92, 10.8],
  [93, 10.1],
  [94, 9.5],
  [95, 8.9],
  [96, 8.4],
  [97, 7.8],
  [98, 7.3],
  [99, 6.8],
  [100, 6.4],
]);

/** Default age at which RMDs begin (SECURE Act 2.0). */
export const RMD_START_AGE = 73;

/**
 * Get the distribution period for a given age from the Uniform Lifetime Table.
 *
 * @param age - Owner's age.
 * @returns Distribution period, or 0 if age is below RMD age.
 */
export function getDistributionPeriod(age: number): number {
  if (age < RMD_START_AGE) return 0;
  const period = UNIFORM_LIFETIME_TABLE.get(age);
  if (period !== undefined) return period;
  // For ages beyond the table, extrapolate conservatively
  if (age > 100) return Math.max(6.4 - (age - 100) * 0.5, 1.0);
  return 0;
}

/**
 * Calculate Required Minimum Distribution for a traditional account.
 *
 * @param balanceCents - Prior year-end balance in cents.
 * @param age - Owner's age in the distribution year.
 * @returns RMD amount in cents.
 */
export function calculateRMD(balanceCents: number, age: number): number {
  const period = getDistributionPeriod(age);
  if (period === 0) return 0;
  return bankersRound(safeDivide(balanceCents, period));
}

// ---------------------------------------------------------------------------
// Tax calculation
// ---------------------------------------------------------------------------

/** 2024 federal tax brackets for single filer (in cents). */
export const FEDERAL_TAX_BRACKETS_2024: readonly TaxBracket[] = [
  { minCents: 0, maxCents: 1160000, rate: 0.1 },
  { minCents: 1160000, maxCents: 4727500, rate: 0.12 },
  { minCents: 4727500, maxCents: 10050000, rate: 0.22 },
  { minCents: 10050000, maxCents: 19190000, rate: 0.24 },
  { minCents: 19190000, maxCents: 24375000, rate: 0.32 },
  { minCents: 24375000, maxCents: 60962500, rate: 0.35 },
  { minCents: 60962500, maxCents: Infinity, rate: 0.37 },
];

/**
 * Calculate federal income tax on taxable income using progressive brackets.
 *
 * @param taxableIncomeCents - Taxable income in cents.
 * @param brackets - Tax brackets to use (defaults to 2024 single filer).
 * @returns Total tax in cents.
 */
export function calculateTax(
  taxableIncomeCents: number,
  brackets: readonly TaxBracket[] = FEDERAL_TAX_BRACKETS_2024,
): number {
  if (taxableIncomeCents <= 0) return 0;

  let totalTax = 0;
  let remaining = taxableIncomeCents;

  for (const bracket of brackets) {
    if (remaining <= 0) break;
    const bracketWidth =
      bracket.maxCents === Infinity ? remaining : bracket.maxCents - bracket.minCents;
    const taxableInBracket = Math.min(remaining, bracketWidth);
    totalTax += taxableInBracket * bracket.rate;
    remaining -= taxableInBracket;
  }

  return bankersRound(totalTax);
}

/**
 * Find remaining space in the current tax bracket.
 *
 * @param taxableIncomeCents - Current taxable income in cents.
 * @param brackets - Tax brackets to use.
 * @returns Remaining cents before moving to the next bracket.
 */
export function findBracketSpace(
  taxableIncomeCents: number,
  brackets: readonly TaxBracket[] = FEDERAL_TAX_BRACKETS_2024,
): number {
  if (taxableIncomeCents < 0) return brackets[0]?.maxCents ?? 0;

  for (const bracket of brackets) {
    if (taxableIncomeCents < bracket.maxCents) {
      if (bracket.maxCents === Infinity) return Infinity;
      return bracket.maxCents - taxableIncomeCents;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Withdrawal optimizer
// ---------------------------------------------------------------------------

/** Input parameters for the withdrawal optimizer. */
export interface WithdrawalOptimizerInput {
  /** Retirement accounts by tax type. */
  readonly accounts: readonly RetirementAccount[];
  /** Desired annual withdrawal in cents. */
  readonly annualNeedCents: number;
  /** Current year. */
  readonly startYear: number;
  /** Owner's current age. */
  readonly currentAge: number;
  /** Planning horizon age (end of plan). */
  readonly endAge: number;
  /** Annual investment return rate as decimal (e.g. 0.05 = 5%). */
  readonly annualReturnRate: number;
  /** Withdrawal strategy. */
  readonly strategy: WithdrawalStrategy;
  /** Tax brackets to use. */
  readonly taxBrackets?: readonly TaxBracket[];
  /** Other taxable income per year in cents (Social Security, pensions). */
  readonly otherIncomeCents?: number;
}

/**
 * Aggregate account balances by tax type.
 *
 * @param accounts - Retirement accounts.
 * @returns Object with total cents per tax type.
 */
function aggregateByTaxType(
  accounts: readonly RetirementAccount[],
): Record<AccountTaxType, number> {
  const result: Record<AccountTaxType, number> = { traditional: 0, roth: 0, taxable: 0 };
  for (const acct of accounts) {
    result[acct.taxType] += acct.balanceCents;
  }
  return result;
}

/**
 * Determine withdrawal ordering based on strategy.
 *
 * @param strategy - The withdrawal strategy.
 * @returns Ordered array of account tax types to withdraw from.
 */
function getWithdrawalOrder(strategy: WithdrawalStrategy): readonly AccountTaxType[] {
  switch (strategy) {
    case 'traditional-first':
      return ['traditional', 'taxable', 'roth'];
    case 'roth-first':
      return ['roth', 'taxable', 'traditional'];
    case 'tax-aware':
      // Tax-aware: taxable first (capital gains rates), then traditional, then Roth
      return ['taxable', 'traditional', 'roth'];
    case 'proportional':
      // Proportional handles differently — order doesn't matter
      return ['traditional', 'roth', 'taxable'];
    default:
      return ['traditional', 'taxable', 'roth'];
  }
}

/**
 * Generate a year-by-year withdrawal plan across retirement accounts.
 *
 * Applies the chosen strategy to sequence withdrawals, calculates RMDs
 * for traditional accounts, and estimates tax impact each year.
 *
 * @param input - Withdrawal optimizer parameters.
 * @returns Complete year-by-year withdrawal plan.
 */
export function generateWithdrawalPlan(input: WithdrawalOptimizerInput): WithdrawalPlan {
  const {
    accounts,
    annualNeedCents,
    startYear,
    currentAge,
    endAge,
    annualReturnRate,
    strategy,
    taxBrackets = FEDERAL_TAX_BRACKETS_2024,
    otherIncomeCents = 0,
  } = input;

  if (endAge <= currentAge) {
    return {
      strategy,
      years: [],
      totalTaxCents: 0,
      totalWithdrawnCents: 0,
      exhaustionAge: null,
    };
  }

  const balances = aggregateByTaxType(accounts);
  const years: WithdrawalYearPlan[] = [];
  let totalTaxCents = 0;
  let totalWithdrawnCents = 0;
  let exhaustionAge: number | null = null;

  for (let yearOffset = 0; yearOffset < endAge - currentAge; yearOffset++) {
    const age = currentAge + yearOffset;
    const year = startYear + yearOffset;

    // Calculate RMD on traditional balance
    const rmdCents = calculateRMD(balances.traditional, age);
    const totalAvailable = balances.traditional + balances.roth + balances.taxable;

    // If all accounts are exhausted, stop
    if (totalAvailable <= 0) {
      if (exhaustionAge === null) exhaustionAge = age;
      break;
    }

    // Determine target withdrawal (at least RMD, at most what's needed)
    const targetWithdrawal = Math.max(annualNeedCents, rmdCents);
    const actualTotal = Math.min(targetWithdrawal, totalAvailable);

    // Allocate withdrawal across account types
    let traditionalW = 0;
    let rothW = 0;
    let taxableW = 0;
    let remaining = actualTotal;

    // Always satisfy RMD from traditional first
    const rmdActual = Math.min(rmdCents, balances.traditional);
    if (rmdActual > 0) {
      traditionalW += rmdActual;
      remaining -= rmdActual;
    }

    if (strategy === 'proportional' && remaining > 0) {
      // Proportional: withdraw from each in proportion to balance
      const totalForProportion =
        Math.max(0, balances.traditional - rmdActual) + balances.roth + balances.taxable;

      if (totalForProportion > 0) {
        const tradPortion = bankersRound(
          safeDivide(Math.max(0, balances.traditional - rmdActual) * remaining, totalForProportion),
        );
        const rothPortion = bankersRound(safeDivide(balances.roth * remaining, totalForProportion));
        const taxPortion = remaining - tradPortion - rothPortion;

        traditionalW += Math.min(tradPortion, Math.max(0, balances.traditional - rmdActual));
        rothW = Math.min(rothPortion, balances.roth);
        taxableW = Math.min(taxPortion, balances.taxable);
      }
    } else if (remaining > 0) {
      // Sequential withdrawal based on strategy order
      const order = getWithdrawalOrder(strategy);
      for (const taxType of order) {
        if (remaining <= 0) break;
        const available =
          taxType === 'traditional'
            ? Math.max(0, balances[taxType] - rmdActual)
            : balances[taxType];
        const withdrawal = Math.min(remaining, available);

        if (taxType === 'traditional') traditionalW += withdrawal;
        else if (taxType === 'roth') rothW = withdrawal;
        else taxableW = withdrawal;

        remaining -= withdrawal;
      }
    }

    const totalCents = traditionalW + rothW + taxableW;

    // Calculate tax: traditional withdrawals + other income are taxable
    // Roth is tax-free, taxable accounts subject to capital gains (simplified as income)
    const taxableIncome = traditionalW + otherIncomeCents + bankersRound(taxableW * 0.5); // simplified: 50% of taxable is gains
    const estimatedTaxCents = calculateTax(taxableIncome, taxBrackets);
    const afterTaxCents = totalCents - estimatedTaxCents;

    // Update balances: subtract withdrawals, apply growth
    balances.traditional = Math.max(
      0,
      bankersRound((balances.traditional - traditionalW) * (1 + annualReturnRate)),
    );
    balances.roth = Math.max(0, bankersRound((balances.roth - rothW) * (1 + annualReturnRate)));
    balances.taxable = Math.max(
      0,
      bankersRound((balances.taxable - taxableW) * (1 + annualReturnRate)),
    );

    years.push({
      year,
      age,
      traditionalCents: traditionalW,
      rothCents: rothW,
      taxableCents: taxableW,
      totalCents,
      rmdCents: rmdActual,
      estimatedTaxCents,
      afterTaxCents,
      remainingTraditionalCents: balances.traditional,
      remainingRothCents: balances.roth,
      remainingTaxableCents: balances.taxable,
    });

    totalTaxCents += estimatedTaxCents;
    totalWithdrawnCents += totalCents;

    // Check exhaustion
    if (balances.traditional + balances.roth + balances.taxable <= 0 && exhaustionAge === null) {
      exhaustionAge = age + 1;
    }
  }

  return {
    strategy,
    years,
    totalTaxCents,
    totalWithdrawnCents,
    exhaustionAge,
  };
}

// ---------------------------------------------------------------------------
// Roth Conversion Ladder
// ---------------------------------------------------------------------------

/**
 * Analyze Roth conversion opportunities to fill lower tax brackets.
 *
 * For each year, calculates the amount that can be converted from traditional
 * to Roth while staying within a target tax bracket.
 *
 * @param traditionalBalanceCents - Current traditional IRA/401(k) balance in cents.
 * @param currentAge - Owner's current age.
 * @param retirementAge - Target retirement age.
 * @param otherIncomeCents - Annual other taxable income in cents.
 * @param targetBracketRate - Maximum tax bracket rate to fill (e.g. 0.22).
 * @param brackets - Tax brackets to use.
 * @returns Year-by-year Roth conversion plan.
 */
export function analyzeRothConversionLadder(
  traditionalBalanceCents: number,
  currentAge: number,
  retirementAge: number,
  otherIncomeCents: number = 0,
  targetBracketRate: number = 0.22,
  brackets: readonly TaxBracket[] = FEDERAL_TAX_BRACKETS_2024,
): readonly RothConversionYear[] {
  if (retirementAge <= currentAge || traditionalBalanceCents <= 0) {
    return [];
  }

  // Find the top of the target bracket
  let targetBracketTop = 0;
  for (const bracket of brackets) {
    if (bracket.rate <= targetBracketRate && bracket.maxCents !== Infinity) {
      targetBracketTop = bracket.maxCents;
    }
  }

  if (targetBracketTop <= 0) return [];

  const result: RothConversionYear[] = [];
  let remainingTraditional = traditionalBalanceCents;
  const currentYear = new Date().getFullYear();

  for (let yearOffset = 0; yearOffset < retirementAge - currentAge; yearOffset++) {
    if (remainingTraditional <= 0) break;

    const bracketSpaceCents = Math.max(0, targetBracketTop - otherIncomeCents);
    const conversionCents = Math.min(bracketSpaceCents, remainingTraditional);

    if (conversionCents <= 0) continue;

    const taxCostCents =
      calculateTax(otherIncomeCents + conversionCents, brackets) -
      calculateTax(otherIncomeCents, brackets);

    result.push({
      year: currentYear + yearOffset,
      conversionCents,
      taxCostCents,
      bracketSpaceCents,
    });

    remainingTraditional -= conversionCents;
  }

  return result;
}
