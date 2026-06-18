// SPDX-License-Identifier: BUSL-1.1

/**
 * Home-office deduction estimates for tax beta issue #2276.
 *
 * The simplified method uses the IRS $5 per square foot rate, capped at
 * 300 square feet and prorated for active months. Actual-expense entries use
 * the business-use percentage. Amounts are integer cents.
 */

export type HomeOfficeMethod = 'SIMPLIFIED' | 'ACTUAL_EXPENSE';

export interface HomeOfficeEntry {
  readonly id: string;
  readonly taxYear: number;
  readonly method: HomeOfficeMethod;
  readonly businessSquareFeet: number;
  readonly totalHomeSquareFeet: number;
  readonly activeMonths: number;
  readonly actualHomeExpenseCents?: number;
  readonly receiptReference?: string;
  readonly notes?: string;
}

export interface HomeOfficeDeductionResult {
  readonly entryId: string;
  readonly method: HomeOfficeMethod;
  readonly businessUsePercent: number;
  readonly deductibleSquareFeet: number;
  readonly deductionCents: number;
  readonly activeMonths: number;
  readonly warnings: readonly string[];
}

export interface HomeOfficeSummary {
  readonly taxYear: number;
  readonly totalDeductionCents: number;
  readonly resultCount: number;
  readonly missingSupportCount: number;
  readonly results: readonly HomeOfficeDeductionResult[];
}

export const SIMPLIFIED_HOME_OFFICE_RATE_CENTS_PER_SQFT = 500;
export const SIMPLIFIED_HOME_OFFICE_MAX_SQFT = 300;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function calculateHomeOfficeDeduction(entry: HomeOfficeEntry): HomeOfficeDeductionResult {
  const warnings: string[] = [];
  const activeMonths = Math.round(clamp(entry.activeMonths, 0, 12));
  const deductibleSquareFeet = clamp(entry.businessSquareFeet, 0, SIMPLIFIED_HOME_OFFICE_MAX_SQFT);
  const businessUsePercent =
    entry.totalHomeSquareFeet > 0
      ? Math.round(
          (clamp(entry.businessSquareFeet, 0, entry.totalHomeSquareFeet) /
            entry.totalHomeSquareFeet) *
            10_000,
        ) / 100
      : 0;

  if (entry.businessSquareFeet <= 0) {
    warnings.push('Business square footage is required.');
  }
  if (entry.totalHomeSquareFeet <= 0) {
    warnings.push('Total home square footage is required.');
  }
  if (entry.businessSquareFeet > entry.totalHomeSquareFeet && entry.totalHomeSquareFeet > 0) {
    warnings.push('Business square footage exceeds total home square footage.');
  }
  if (entry.receiptReference === undefined || entry.receiptReference.trim().length === 0) {
    warnings.push('Add supporting notes or receipt references for tax-prep review.');
  }

  const deductionCents =
    entry.method === 'SIMPLIFIED'
      ? Math.round(
          deductibleSquareFeet * SIMPLIFIED_HOME_OFFICE_RATE_CENTS_PER_SQFT * (activeMonths / 12),
        )
      : Math.round(
          Math.max(0, entry.actualHomeExpenseCents ?? 0) *
            (businessUsePercent / 100) *
            (activeMonths / 12),
        );

  return {
    entryId: entry.id,
    method: entry.method,
    businessUsePercent,
    deductibleSquareFeet,
    deductionCents,
    activeMonths,
    warnings,
  };
}

export function summarizeHomeOfficeDeductions(
  entries: readonly HomeOfficeEntry[],
  taxYear: number,
): HomeOfficeSummary {
  const results = entries
    .filter((entry) => entry.taxYear === taxYear)
    .map((entry) => calculateHomeOfficeDeduction(entry));

  return {
    taxYear,
    totalDeductionCents: results.reduce((sum, result) => sum + result.deductionCents, 0),
    resultCount: results.length,
    missingSupportCount: results.filter((result) => result.warnings.length > 0).length,
    results,
  };
}
