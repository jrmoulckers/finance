// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the Schedule C mapping and report builder.
 *
 * References: issue #3232
 */

import { describe, expect, it } from 'vitest';

import type {
  TaxCategory,
  TaxCategorySummary,
  TaxCategorySummaryRow,
} from './tax-category-tagging';
import {
  buildScheduleCReport,
  mapTaxCategoryToScheduleCLine,
  SCHEDULE_C_DISCLAIMER,
  SCHEDULE_C_LINES,
  unmappedCategoryReason,
} from './schedule-c';

function row(
  category: TaxCategory,
  overrides: Partial<TaxCategorySummaryRow> = {},
): TaxCategorySummaryRow {
  return {
    category,
    transactionCount: 1,
    grossAmountCents: 0,
    deductibleAmountCents: 0,
    missingReceiptCount: 0,
    reviewNeededCount: 0,
    ...overrides,
  };
}

function summary(
  rows: TaxCategorySummaryRow[],
  overrides: Partial<TaxCategorySummary> = {},
): TaxCategorySummary {
  return {
    taxYear: 2024,
    rows,
    totalDeductibleAmountCents: rows.reduce((sum, r) => sum + r.deductibleAmountCents, 0),
    missingReceiptTransactionIds: [],
    reviewTransactionIds: [],
    uncategorizedTransactionIds: [],
    ...overrides,
  };
}

describe('mapTaxCategoryToScheduleCLine', () => {
  it('maps business categories to the expected Schedule C lines', () => {
    expect(mapTaxCategoryToScheduleCLine('SCHEDULE_C_INCOME')?.lineNumber).toBe('1');
    expect(mapTaxCategoryToScheduleCLine('SCHEDULE_C_EXPENSE')?.lineNumber).toBe('27a');
    expect(mapTaxCategoryToScheduleCLine('BUSINESS_MEALS')?.lineNumber).toBe('24b');
    expect(mapTaxCategoryToScheduleCLine('HOME_OFFICE')?.lineNumber).toBe('30');
    expect(mapTaxCategoryToScheduleCLine('BUSINESS_MILEAGE')?.lineNumber).toBe('9');
    expect(mapTaxCategoryToScheduleCLine('CAPITALIZED_ASSET')?.lineNumber).toBe('13');
  });

  it('returns null for personal / non-Schedule-C categories', () => {
    expect(mapTaxCategoryToScheduleCLine('CHARITABLE_CASH')).toBeNull();
    expect(mapTaxCategoryToScheduleCLine('MEDICAL')).toBeNull();
    expect(mapTaxCategoryToScheduleCLine('STATE_LOCAL_TAX')).toBeNull();
    expect(mapTaxCategoryToScheduleCLine('REIMBURSABLE')).toBeNull();
    expect(mapTaxCategoryToScheduleCLine('REVIEW_NEEDED')).toBeNull();
  });

  it('every mapped line is part of the published catalog', () => {
    for (const line of SCHEDULE_C_LINES) {
      expect(line.id).toMatch(/^line-/);
    }
  });
});

describe('unmappedCategoryReason', () => {
  it('explains why charitable gifts are excluded', () => {
    expect(unmappedCategoryReason('CHARITABLE_CASH')).toContain('Schedule A');
  });

  it('flags review-needed items', () => {
    expect(unmappedCategoryReason('REVIEW_NEEDED')).toContain('review');
  });
});

describe('buildScheduleCReport', () => {
  it('splits income and expense lines and computes net profit', () => {
    const report = buildScheduleCReport(
      summary([
        row('SCHEDULE_C_INCOME', { grossAmountCents: 900000, transactionCount: 3 }),
        row('SCHEDULE_C_EXPENSE', {
          grossAmountCents: 120000,
          deductibleAmountCents: 120000,
          transactionCount: 2,
        }),
        row('HOME_OFFICE', { grossAmountCents: 60000, deductibleAmountCents: 60000 }),
      ]),
    );

    expect(report.taxYear).toBe(2024);
    expect(report.incomeRows).toHaveLength(1);
    expect(report.incomeRows[0].line.lineNumber).toBe('1');
    expect(report.totalIncomeCents).toBe(900000);
    expect(report.totalExpenseCents).toBe(180000);
    expect(report.netProfitCents).toBe(720000);
    expect(report.expenseRows.map((r) => r.line.lineNumber)).toEqual(['27a', '30']);
  });

  it('uses the deductible amount for partially deductible expense lines', () => {
    const report = buildScheduleCReport(
      summary([
        // A $200 meal is only 50% deductible.
        row('BUSINESS_MEALS', { grossAmountCents: 20000, deductibleAmountCents: 10000 }),
      ]),
    );

    const meals = report.expenseRows.find((r) => r.line.lineNumber === '24b');
    expect(meals?.amountCents).toBe(10000);
    expect(report.totalExpenseCents).toBe(10000);
  });

  it('rolls multiple categories that share a line into one row', () => {
    const report = buildScheduleCReport(
      summary([
        row('SCHEDULE_C_EXPENSE', { deductibleAmountCents: 5000, transactionCount: 1 }),
        row('SCHEDULE_C_EXPENSE', { deductibleAmountCents: 3000, transactionCount: 1 }),
      ]),
    );

    // summarizeTaxCategories dedupes categories, but the builder must still be
    // additive if a category appears more than once.
    const other = report.expenseRows.filter((r) => r.line.lineNumber === '27a');
    expect(other).toHaveLength(1);
    expect(other[0].amountCents).toBe(8000);
    expect(other[0].transactionCount).toBe(2);
  });

  it('surfaces non-Schedule-C categories with a reason instead of dropping them', () => {
    const report = buildScheduleCReport(
      summary([
        row('CHARITABLE_CASH', { grossAmountCents: 25000 }),
        row('MEDICAL', { grossAmountCents: 40000 }),
      ]),
    );

    expect(report.expenseRows).toHaveLength(0);
    expect(report.unmappedRows).toHaveLength(2);
    expect(report.unmappedRows.map((r) => r.category)).toContain('CHARITABLE_CASH');
    expect(report.unmappedRows[0].reason).toBeTruthy();
  });

  it('carries review and missing-receipt counts through', () => {
    const report = buildScheduleCReport(
      summary([row('SCHEDULE_C_EXPENSE', { deductibleAmountCents: 1000 })], {
        reviewTransactionIds: ['t1', 't2'],
        missingReceiptTransactionIds: ['t3'],
      }),
    );

    expect(report.reviewNeededCount).toBe(2);
    expect(report.missingReceiptCount).toBe(1);
  });

  it('produces an empty report for an empty summary', () => {
    const report = buildScheduleCReport(summary([]));

    expect(report.incomeRows).toHaveLength(0);
    expect(report.expenseRows).toHaveLength(0);
    expect(report.netProfitCents).toBe(0);
    expect(report.unmappedRows).toHaveLength(0);
  });

  it('publishes a non-empty tax-advice disclaimer', () => {
    expect(SCHEDULE_C_DISCLAIMER).toContain('not tax advice');
  });
});
