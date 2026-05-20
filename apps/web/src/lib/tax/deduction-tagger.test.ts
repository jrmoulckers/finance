// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import { FilingStatus } from './types';
import {
  DeductionCategory,
  filterByYear,
  filterByCategory,
  calculateTotal,
  summarizeCategory,
  compareDeductions,
  generateYearEndSummary,
  type DeductibleTransaction,
} from './deduction-tagger';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const TRANSACTIONS: DeductibleTransaction[] = [
  {
    transactionId: 'txn-1',
    category: DeductionCategory.CHARITABLE,
    amount: 5_000_00,
    date: '2024-03-15',
    description: 'Donation to Red Cross',
    payee: 'American Red Cross',
  },
  {
    transactionId: 'txn-2',
    category: DeductionCategory.CHARITABLE,
    amount: 2_000_00,
    date: '2024-11-20',
    description: 'Church tithe',
  },
  {
    transactionId: 'txn-3',
    category: DeductionCategory.MEDICAL,
    amount: 8_000_00,
    date: '2024-04-10',
    description: 'Surgery copay',
    payee: 'General Hospital',
  },
  {
    transactionId: 'txn-4',
    category: DeductionCategory.MEDICAL,
    amount: 3_000_00,
    date: '2024-06-15',
    description: 'Dental work',
  },
  {
    transactionId: 'txn-5',
    category: DeductionCategory.STATE_LOCAL_TAX,
    amount: 12_000_00,
    date: '2024-04-15',
    description: 'State income tax',
  },
  {
    transactionId: 'txn-6',
    category: DeductionCategory.BUSINESS,
    amount: 1_500_00,
    date: '2024-07-01',
    description: 'Office supplies',
  },
  {
    transactionId: 'txn-7',
    category: DeductionCategory.EDUCATION,
    amount: 2_500_00,
    date: '2024-08-15',
    description: 'Certification course',
  },
  {
    transactionId: 'txn-8',
    category: DeductionCategory.CHARITABLE,
    amount: 1_000_00,
    date: '2023-12-20',
    description: 'Prior year donation',
  },
];

describe('deduction-tagger', () => {
  // -----------------------------------------------------------------------
  // filterByYear
  // -----------------------------------------------------------------------
  describe('filterByYear', () => {
    it('returns only 2024 transactions', () => {
      const result = filterByYear(TRANSACTIONS, 2024);
      expect(result).toHaveLength(7);
    });

    it('returns only 2023 transactions', () => {
      const result = filterByYear(TRANSACTIONS, 2023);
      expect(result).toHaveLength(1);
    });

    it('returns empty for year with no transactions', () => {
      const result = filterByYear(TRANSACTIONS, 2022);
      expect(result).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // filterByCategory
  // -----------------------------------------------------------------------
  describe('filterByCategory', () => {
    it('returns all charitable transactions', () => {
      const result = filterByCategory(TRANSACTIONS, DeductionCategory.CHARITABLE);
      expect(result).toHaveLength(3);
    });

    it('returns all medical transactions', () => {
      const result = filterByCategory(TRANSACTIONS, DeductionCategory.MEDICAL);
      expect(result).toHaveLength(2);
    });

    it('returns empty for category with no transactions', () => {
      const result = filterByCategory(TRANSACTIONS, DeductionCategory.MORTGAGE_INTEREST);
      expect(result).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // calculateTotal
  // -----------------------------------------------------------------------
  describe('calculateTotal', () => {
    it('sums all transaction amounts', () => {
      const total = calculateTotal(TRANSACTIONS);
      // 5000 + 2000 + 8000 + 3000 + 12000 + 1500 + 2500 + 1000 = 35000
      expect(total).toBe(35_000_00);
    });

    it('returns 0 for empty array', () => {
      expect(calculateTotal([])).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // summarizeCategory
  // -----------------------------------------------------------------------
  describe('summarizeCategory', () => {
    it('summarizes charitable with no limit', () => {
      const summary = summarizeCategory(TRANSACTIONS, DeductionCategory.CHARITABLE);

      expect(summary.totalAmount).toBe(8_000_00); // 5000 + 2000 + 1000
      expect(summary.transactionCount).toBe(3);
      expect(summary.applicableLimit).toBeNull();
      expect(summary.netDeductible).toBe(8_000_00);
      expect(summary.excessAmount).toBe(0);
    });

    it('caps SALT at $10,000', () => {
      const summary = summarizeCategory(TRANSACTIONS, DeductionCategory.STATE_LOCAL_TAX);

      expect(summary.totalAmount).toBe(12_000_00);
      expect(summary.applicableLimit).toBe(10_000_00);
      expect(summary.netDeductible).toBe(10_000_00);
      expect(summary.excessAmount).toBe(2_000_00);
    });

    it('applies 7.5% AGI floor to medical expenses', () => {
      // AGI = $100,000; floor = 7.5% = $7,500
      // Medical total = $11,000; deductible = $11,000 - $7,500 = $3,500
      const summary = summarizeCategory(TRANSACTIONS, DeductionCategory.MEDICAL, 100_000_00);

      expect(summary.totalAmount).toBe(11_000_00);
      expect(summary.applicableLimit).toBe(7_500_00); // 7.5% of $100k
      expect(summary.netDeductible).toBe(3_500_00);
    });

    it('medical deduction is zero when below AGI floor', () => {
      // AGI = $200,000; floor = 7.5% = $15,000
      // Medical total = $11,000; below floor -> $0
      const summary = summarizeCategory(TRANSACTIONS, DeductionCategory.MEDICAL, 200_000_00);

      expect(summary.netDeductible).toBe(0);
    });

    it('SALT under cap is fully deductible', () => {
      const txns: DeductibleTransaction[] = [
        {
          transactionId: 'salt-1',
          category: DeductionCategory.STATE_LOCAL_TAX,
          amount: 5_000_00,
          date: '2024-04-15',
          description: 'State tax',
        },
      ];
      const summary = summarizeCategory(txns, DeductionCategory.STATE_LOCAL_TAX);

      expect(summary.netDeductible).toBe(5_000_00);
      expect(summary.excessAmount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // compareDeductions
  // -----------------------------------------------------------------------
  describe('compareDeductions', () => {
    it('recommends standard when itemized is lower', () => {
      const result = compareDeductions(10_000_00, FilingStatus.SINGLE);

      expect(result.standardDeduction).toBe(14_600_00);
      expect(result.recommendation).toBe('STANDARD');
      expect(result.benefit).toBe(4_600_00);
    });

    it('recommends itemized when higher than standard', () => {
      const result = compareDeductions(20_000_00, FilingStatus.SINGLE);

      expect(result.recommendation).toBe('ITEMIZED');
      expect(result.benefit).toBe(5_400_00);
    });

    it('recommends standard when equal (tie goes to standard)', () => {
      const result = compareDeductions(14_600_00, FilingStatus.SINGLE);
      expect(result.recommendation).toBe('STANDARD');
      expect(result.benefit).toBe(0);
    });

    it('uses correct MFJ standard deduction', () => {
      const result = compareDeductions(25_000_00, FilingStatus.MARRIED_FILING_JOINTLY);

      expect(result.standardDeduction).toBe(29_200_00);
      expect(result.recommendation).toBe('STANDARD');
    });
  });

  // -----------------------------------------------------------------------
  // generateYearEndSummary
  // -----------------------------------------------------------------------
  describe('generateYearEndSummary', () => {
    it('generates complete year-end summary', () => {
      const summary = generateYearEndSummary(TRANSACTIONS, 2024, FilingStatus.SINGLE, 100_000_00);

      expect(summary.year).toBe(2024);
      expect(summary.filingStatus).toBe(FilingStatus.SINGLE);
      expect(summary.categories.length).toBeGreaterThan(0);
      expect(summary.totalBeforeLimits).toBeGreaterThan(0);
      expect(summary.totalAfterLimits).toBeLessThanOrEqual(summary.totalBeforeLimits);
      expect(summary.comparison.standardDeduction).toBe(14_600_00);
    });

    it('correctly filters to only 2024 transactions', () => {
      const summary = generateYearEndSummary(TRANSACTIONS, 2024, FilingStatus.SINGLE);

      // The 2023 transaction should not be included in totals
      // 2024 total = 5000 + 2000 + 8000 + 3000 + 12000 + 1500 + 2500 = 34000
      expect(summary.totalBeforeLimits).toBe(34_000_00);
    });

    it('applies SALT cap in year-end summary', () => {
      const summary = generateYearEndSummary(TRANSACTIONS, 2024, FilingStatus.SINGLE);

      const saltCategory = summary.categories.find(
        (c) => c.category === DeductionCategory.STATE_LOCAL_TAX,
      );
      expect(saltCategory?.netDeductible).toBe(10_000_00);
      expect(summary.totalAfterLimits).toBeLessThan(summary.totalBeforeLimits);
    });

    it('makes correct standard vs itemized recommendation', () => {
      // With SALT capped and medical without AGI floor (agi=0),
      // itemized should exceed single standard deduction ($14,600)
      const summary = generateYearEndSummary(TRANSACTIONS, 2024, FilingStatus.SINGLE, 0);

      // totalAfterLimits should be > $14,600 given the test data
      expect(summary.comparison.recommendation).toBe('ITEMIZED');
    });
  });
});
