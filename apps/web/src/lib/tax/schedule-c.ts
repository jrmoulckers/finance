// SPDX-License-Identifier: BUSL-1.1

/**
 * Schedule C (Form 1040) line mapping and report builder for sole proprietors.
 *
 * Maps the app's {@link TaxCategory} taxonomy onto US IRS Schedule C lines so a
 * freelancer can read a Schedule-C-style summary instead of hand-translating
 * generic P&L buckets at tax time. This module is intentionally pure and
 * consumes the output of {@link summarizeTaxCategories}, so UI, export, and
 * future platforms can share one mapping.
 *
 * These mappings are automated estimates, NOT tax advice. Only business
 * categories map to Schedule C; personal deductions (charitable, medical,
 * state/local tax) belong on other schedules and are surfaced separately so
 * nothing is silently dropped.
 *
 * References: IRS Form 1040 Schedule C (2023); issue #3232.
 */

import type { TaxCategory, TaxCategorySummary } from './tax-category-tagging';

export const SCHEDULE_C_DISCLAIMER =
  'Schedule C mappings are automated estimates, not tax advice. Only business ' +
  'expenses map to Schedule C — review every line (and any unmapped or ' +
  'review-needed items) with a tax professional before filing.';

/** Which Schedule C part a line belongs to. */
export type ScheduleCPart = 'income' | 'expenses' | 'home';

/** A single Schedule C line the app can map transactions onto. */
export interface ScheduleCLine {
  /** Stable identifier for React keys and lookups. */
  readonly id: string;
  /** IRS line number as printed on the form (e.g. '1', '24b', '27a', '30'). */
  readonly lineNumber: string;
  /** Human-readable line label. */
  readonly label: string;
  /** Part of the form this line belongs to. */
  readonly part: ScheduleCPart;
}

const LINE_GROSS_RECEIPTS: ScheduleCLine = {
  id: 'line-1-gross-receipts',
  lineNumber: '1',
  label: 'Gross receipts or sales',
  part: 'income',
};

const LINE_CAR_AND_TRUCK: ScheduleCLine = {
  id: 'line-9-car-and-truck',
  lineNumber: '9',
  label: 'Car and truck expenses',
  part: 'expenses',
};

const LINE_DEPRECIATION: ScheduleCLine = {
  id: 'line-13-depreciation',
  lineNumber: '13',
  label: 'Depreciation and section 179',
  part: 'expenses',
};

const LINE_MEALS: ScheduleCLine = {
  id: 'line-24b-meals',
  lineNumber: '24b',
  label: 'Deductible meals',
  part: 'expenses',
};

const LINE_OTHER_EXPENSES: ScheduleCLine = {
  id: 'line-27a-other-expenses',
  lineNumber: '27a',
  label: 'Other business expenses',
  part: 'expenses',
};

const LINE_HOME_OFFICE: ScheduleCLine = {
  id: 'line-30-home-office',
  lineNumber: '30',
  label: 'Expenses for business use of home',
  part: 'home',
};

/**
 * Ordered catalog of the Schedule C lines this module can populate today.
 *
 * Finer expense lines (advertising, supplies, contract labor, etc.) require the
 * deductible-category detail tracked in issue #3226; until a transaction can
 * carry that detail, general business expenses roll up into line 27a.
 */
export const SCHEDULE_C_LINES: readonly ScheduleCLine[] = [
  LINE_GROSS_RECEIPTS,
  LINE_CAR_AND_TRUCK,
  LINE_DEPRECIATION,
  LINE_MEALS,
  LINE_OTHER_EXPENSES,
  LINE_HOME_OFFICE,
];

const CATEGORY_TO_LINE: Readonly<Partial<Record<TaxCategory, ScheduleCLine>>> = {
  SCHEDULE_C_INCOME: LINE_GROSS_RECEIPTS,
  SCHEDULE_C_EXPENSE: LINE_OTHER_EXPENSES,
  BUSINESS_MEALS: LINE_MEALS,
  HOME_OFFICE: LINE_HOME_OFFICE,
  BUSINESS_MILEAGE: LINE_CAR_AND_TRUCK,
  CAPITALIZED_ASSET: LINE_DEPRECIATION,
};

const UNMAPPED_REASONS: Readonly<Partial<Record<TaxCategory, string>>> = {
  CHARITABLE_CASH: 'Personal charitable gift — Schedule A, not Schedule C.',
  CHARITABLE_NON_CASH: 'Personal charitable gift — Schedule A, not Schedule C.',
  MEDICAL: 'Personal medical expense — Schedule A, not Schedule C.',
  EDUCATION: 'Personal education — reported on another schedule, not Schedule C.',
  STATE_LOCAL_TAX: 'Personal state/local tax — Schedule A, not Schedule C.',
  RETIREMENT_CONTRIBUTION: 'Self-employed retirement contribution — Schedule 1, not Schedule C.',
  INVESTMENT_TAX: 'Investment-related — Schedule D or other, not Schedule C.',
  PERSONAL_NON_DEDUCTIBLE: 'Personal, non-deductible expense.',
  REIMBURSABLE: 'Reimbursable — excluded (not your deduction to take).',
  REVIEW_NEEDED: 'Needs review before it can be mapped to a Schedule C line.',
};

/**
 * Map an app tax category to its Schedule C line, or `null` when the category
 * does not belong on Schedule C (personal deduction, reimbursable, or review).
 */
export function mapTaxCategoryToScheduleCLine(category: TaxCategory): ScheduleCLine | null {
  return CATEGORY_TO_LINE[category] ?? null;
}

/** Explain why a category is not mapped to a Schedule C line. */
export function unmappedCategoryReason(category: TaxCategory): string {
  return UNMAPPED_REASONS[category] ?? 'Not mapped to a Schedule C line.';
}

/** A populated Schedule C line with its rolled-up amount. */
export interface ScheduleCReportRow {
  readonly line: ScheduleCLine;
  readonly transactionCount: number;
  readonly amountCents: number;
}

/** A category that carries value but does not map onto Schedule C. */
export interface ScheduleCUnmappedRow {
  readonly category: TaxCategory;
  readonly transactionCount: number;
  readonly amountCents: number;
  readonly reason: string;
}

/** A Schedule-C-style report for a single tax year. */
export interface ScheduleCReport {
  readonly taxYear: number;
  readonly incomeRows: readonly ScheduleCReportRow[];
  readonly expenseRows: readonly ScheduleCReportRow[];
  readonly totalIncomeCents: number;
  readonly totalExpenseCents: number;
  readonly netProfitCents: number;
  readonly unmappedRows: readonly ScheduleCUnmappedRow[];
  readonly reviewNeededCount: number;
  readonly missingReceiptCount: number;
}

interface MutableLineBucket {
  readonly line: ScheduleCLine;
  transactionCount: number;
  amountCents: number;
}

function lineOrder(row: ScheduleCReportRow): number {
  const index = SCHEDULE_C_LINES.findIndex((line) => line.id === row.line.id);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * Group a {@link TaxCategorySummary} into a Schedule-C-style report.
 *
 * Income lines use gross amounts (gross receipts are reported gross); expense
 * lines use the deductible amount so partially deductible categories (e.g.
 * meals) contribute only their deductible share. Categories that do not map to
 * Schedule C are returned in `unmappedRows` with a reason.
 */
export function buildScheduleCReport(summary: TaxCategorySummary): ScheduleCReport {
  const buckets = new Map<string, MutableLineBucket>();
  const unmappedRows: ScheduleCUnmappedRow[] = [];

  for (const row of summary.rows) {
    const line = mapTaxCategoryToScheduleCLine(row.category);
    if (line === null) {
      if (row.grossAmountCents > 0 || row.transactionCount > 0) {
        unmappedRows.push({
          category: row.category,
          transactionCount: row.transactionCount,
          amountCents: row.grossAmountCents,
          reason: unmappedCategoryReason(row.category),
        });
      }
      continue;
    }

    const amountCents = line.part === 'income' ? row.grossAmountCents : row.deductibleAmountCents;
    const existing = buckets.get(line.id);
    if (existing) {
      existing.transactionCount += row.transactionCount;
      existing.amountCents += amountCents;
    } else {
      buckets.set(line.id, {
        line,
        transactionCount: row.transactionCount,
        amountCents,
      });
    }
  }

  const allRows: ScheduleCReportRow[] = [...buckets.values()].map((bucket) => ({
    line: bucket.line,
    transactionCount: bucket.transactionCount,
    amountCents: bucket.amountCents,
  }));

  const incomeRows = allRows.filter((row) => row.line.part === 'income').sort(byLine);
  const expenseRows = allRows.filter((row) => row.line.part !== 'income').sort(byLine);

  const totalIncomeCents = incomeRows.reduce((sum, row) => sum + row.amountCents, 0);
  const totalExpenseCents = expenseRows.reduce((sum, row) => sum + row.amountCents, 0);

  return {
    taxYear: summary.taxYear,
    incomeRows,
    expenseRows,
    totalIncomeCents,
    totalExpenseCents,
    netProfitCents: totalIncomeCents - totalExpenseCents,
    unmappedRows,
    reviewNeededCount: summary.reviewTransactionIds.length,
    missingReceiptCount: summary.missingReceiptTransactionIds.length,
  };
}

function byLine(a: ScheduleCReportRow, b: ScheduleCReportRow): number {
  return lineOrder(a) - lineOrder(b);
}
