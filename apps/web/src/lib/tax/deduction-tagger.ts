// SPDX-License-Identifier: BUSL-1.1

/**
 * Tax-deductible transaction tagger and year-end summary generator.
 *
 * Tags transactions by deduction category (charitable, medical, business,
 * education) and generates year-end summaries with standard vs itemized
 * deduction comparison.
 *
 * All monetary values are in cents (integers) to avoid floating-point errors.
 *
 * References: IRC §170 (charitable), §213 (medical), §162 (business),
 *             IRC §63 (standard deduction), issue #1695
 */

import { FilingStatus } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tax deduction categories. */
export enum DeductionCategory {
  CHARITABLE = 'CHARITABLE',
  MEDICAL = 'MEDICAL',
  BUSINESS = 'BUSINESS',
  EDUCATION = 'EDUCATION',
  STATE_LOCAL_TAX = 'STATE_LOCAL_TAX',
  MORTGAGE_INTEREST = 'MORTGAGE_INTEREST',
  HOME_OFFICE = 'HOME_OFFICE',
  OTHER = 'OTHER',
}

/** A transaction tagged as tax-deductible. */
export interface DeductibleTransaction {
  /** Unique transaction identifier. */
  readonly transactionId: string;
  /** Deduction category. */
  readonly category: DeductionCategory;
  /** Transaction amount in cents (positive = deductible expense). */
  readonly amount: number;
  /** Transaction date (ISO 8601). */
  readonly date: string;
  /** Description/memo for the transaction. */
  readonly description: string;
  /** Optional: payee or organization name. */
  readonly payee?: string;
}

/** Summary for a single deduction category. */
export interface CategorySummary {
  /** Deduction category. */
  readonly category: DeductionCategory;
  /** Total deductible amount in cents. */
  readonly totalAmount: number;
  /** Number of transactions. */
  readonly transactionCount: number;
  /** Applicable limit (cents), if any. null means no limit. */
  readonly applicableLimit: number | null;
  /** Amount that exceeds the limit and cannot be deducted (cents). */
  readonly excessAmount: number;
  /** Net deductible amount after limits (cents). */
  readonly netDeductible: number;
}

/** Comparison between standard and itemized deductions. */
export interface DeductionComparison {
  /** Standard deduction for the filing status (cents). */
  readonly standardDeduction: number;
  /** Total itemized deductions (cents). */
  readonly totalItemized: number;
  /** Which method is more advantageous. */
  readonly recommendation: 'STANDARD' | 'ITEMIZED';
  /** Dollar benefit of the recommended method over the other (cents). */
  readonly benefit: number;
}

/** Year-end deduction summary. */
export interface YearEndDeductionSummary {
  /** Tax year. */
  readonly year: number;
  /** Filing status. */
  readonly filingStatus: FilingStatus;
  /** Summaries by category. */
  readonly categories: readonly CategorySummary[];
  /** Total itemized deductions before limits (cents). */
  readonly totalBeforeLimits: number;
  /** Total itemized deductions after limits (cents). */
  readonly totalAfterLimits: number;
  /** Standard vs itemized comparison. */
  readonly comparison: DeductionComparison;
}

// ---------------------------------------------------------------------------
// Constants (2024 IRS Limits)
// ---------------------------------------------------------------------------

/**
 * 2024 standard deductions by filing status (cents).
 * Must match federal-brackets.ts values.
 */
const STANDARD_DEDUCTIONS_2024: Record<FilingStatus, number> = {
  [FilingStatus.SINGLE]: 14_600_00,
  [FilingStatus.MARRIED_FILING_JOINTLY]: 29_200_00,
  [FilingStatus.MARRIED_FILING_SEPARATELY]: 14_600_00,
  [FilingStatus.HEAD_OF_HOUSEHOLD]: 21_900_00,
};

/**
 * SALT deduction cap (State and Local Tax, cents).
 * $10,000 cap per IRC §164(b)(6).
 */
const SALT_CAP = 10_000_00;

/**
 * Medical expense AGI floor percentage.
 * Only expenses exceeding 7.5% of AGI are deductible (IRC §213).
 */
const MEDICAL_AGI_FLOOR_PERCENT = 0.075;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Filter transactions by tax year.
 *
 * @param transactions - All tagged transactions
 * @param year - Tax year
 * @returns Transactions within the given year
 */
export function filterByYear(
  transactions: readonly DeductibleTransaction[],
  year: number,
): DeductibleTransaction[] {
  const yearStr = String(year);
  return transactions.filter((t) => t.date.startsWith(yearStr));
}

/**
 * Filter transactions by deduction category.
 *
 * @param transactions - Tagged transactions
 * @param category - Category to filter by
 * @returns Transactions in the given category
 */
export function filterByCategory(
  transactions: readonly DeductibleTransaction[],
  category: DeductionCategory,
): DeductibleTransaction[] {
  return transactions.filter((t) => t.category === category);
}

/**
 * Calculate total deductible amount for a set of transactions.
 *
 * @param transactions - Tagged transactions
 * @returns Total amount in cents
 */
export function calculateTotal(transactions: readonly DeductibleTransaction[]): number {
  return transactions.reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Summarize a single deduction category with applicable limits.
 *
 * @param transactions - Transactions in this category
 * @param category - The deduction category
 * @param agi - Adjusted gross income (cents, needed for medical floor)
 * @returns Category summary with net deductible amount
 */
export function summarizeCategory(
  transactions: readonly DeductibleTransaction[],
  category: DeductionCategory,
  agi: number = 0,
): CategorySummary {
  const categoryTxns = filterByCategory(transactions, category);
  const totalAmount = calculateTotal(categoryTxns);

  let applicableLimit: number | null = null;
  let netDeductible = totalAmount;

  switch (category) {
    case DeductionCategory.STATE_LOCAL_TAX:
      applicableLimit = SALT_CAP;
      netDeductible = Math.min(totalAmount, SALT_CAP);
      break;
    case DeductionCategory.MEDICAL: {
      const floor = Math.round(agi * MEDICAL_AGI_FLOOR_PERCENT);
      applicableLimit = floor;
      netDeductible = Math.max(0, totalAmount - floor);
      break;
    }
    default:
      break;
  }

  const excessAmount = applicableLimit !== null ? Math.max(0, totalAmount - netDeductible) : 0;

  return {
    category,
    totalAmount,
    transactionCount: categoryTxns.length,
    applicableLimit,
    excessAmount,
    netDeductible,
  };
}

/**
 * Compare standard deduction to total itemized deductions.
 *
 * @param itemizedTotal - Total itemized deductions after limits (cents)
 * @param filingStatus - Filing status
 * @returns Comparison with recommendation
 */
export function compareDeductions(
  itemizedTotal: number,
  filingStatus: FilingStatus,
): DeductionComparison {
  const standardDeduction = STANDARD_DEDUCTIONS_2024[filingStatus];
  const recommendation = itemizedTotal > standardDeduction ? 'ITEMIZED' : 'STANDARD';
  const benefit = Math.abs(itemizedTotal - standardDeduction);

  return {
    standardDeduction,
    totalItemized: itemizedTotal,
    recommendation,
    benefit,
  };
}

/**
 * Generate a comprehensive year-end deduction summary.
 *
 * @param transactions - All tagged deductible transactions
 * @param year - Tax year
 * @param filingStatus - Filing status
 * @param agi - Adjusted gross income (cents, needed for medical deduction floor)
 * @returns Complete year-end summary with standard vs itemized comparison
 */
export function generateYearEndSummary(
  transactions: readonly DeductibleTransaction[],
  year: number,
  filingStatus: FilingStatus,
  agi: number = 0,
): YearEndDeductionSummary {
  const yearTxns = filterByYear(transactions, year);

  const allCategories = Object.values(DeductionCategory);
  const categories = allCategories.map((cat) => summarizeCategory(yearTxns, cat, agi));

  const totalBeforeLimits = categories.reduce((sum, c) => sum + c.totalAmount, 0);
  const totalAfterLimits = categories.reduce((sum, c) => sum + c.netDeductible, 0);
  const comparison = compareDeductions(totalAfterLimits, filingStatus);

  return {
    year,
    filingStatus,
    categories,
    totalBeforeLimits,
    totalAfterLimits,
    comparison,
  };
}
