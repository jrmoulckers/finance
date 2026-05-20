// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import { HSACoverageType, QualifiedExpenseCategory } from './types';
import type { HSAAccount, FSAAccount, QualifiedExpense } from './types';
import {
  getHSABaseLimit,
  calculateHSALimits,
  calculateHSATripleTaxAdvantage,
  getHSAAvailableBalance,
  getFSAElectionLimit,
  getFSARolloverMax,
  getFSAAvailableBalance,
  calculateFSARollover,
  calculateFSADeadlineAlert,
  getExpensesForAccount,
  getUnreimbursedTotal,
  summarizeExpensesByCategory,
  getExpensesMissingReceipts,
} from './hsa-fsa-tracker';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeHSA(overrides: Partial<HSAAccount> = {}): HSAAccount {
  return {
    id: 'hsa-1',
    name: 'My HSA',
    coverageType: HSACoverageType.INDIVIDUAL,
    balanceCents: 5_000_00,
    ytdContributionsCents: 2_000_00,
    employerContributionsCents: 500_00,
    holderAge: 40,
    taxYear: 2024,
    ...overrides,
  };
}

function makeFSA(overrides: Partial<FSAAccount> = {}): FSAAccount {
  return {
    id: 'fsa-1',
    name: 'My FSA',
    electionCents: 2_500_00,
    ytdContributionsCents: 2_500_00,
    ytdReimbursementsCents: 1_000_00,
    rolloverEnabled: true,
    rolloverAmountCents: 200_00,
    planYearEnd: '2024-12-31',
    gracePeriodEnd: '2025-03-15',
    taxYear: 2024,
    ...overrides,
  };
}

function makeExpense(overrides: Partial<QualifiedExpense> = {}): QualifiedExpense {
  return {
    id: 'exp-1',
    category: QualifiedExpenseCategory.MEDICAL_SERVICES,
    description: 'Doctor visit',
    amountCents: 150_00,
    dateIncurred: '2024-06-15',
    reimbursed: false,
    accountId: 'hsa-1',
    receiptVerified: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// HSA Tests
// ---------------------------------------------------------------------------

describe('hsa-fsa-tracker', () => {
  describe('getHSABaseLimit', () => {
    it('returns $4,150 for individual coverage', () => {
      expect(getHSABaseLimit(HSACoverageType.INDIVIDUAL)).toBe(4_150_00);
    });

    it('returns $8,300 for family coverage', () => {
      expect(getHSABaseLimit(HSACoverageType.FAMILY)).toBe(8_300_00);
    });
  });

  describe('calculateHSALimits', () => {
    it('calculates limits for individual under 55', () => {
      const limits = calculateHSALimits(makeHSA());
      expect(limits.baseLimitCents).toBe(4_150_00);
      expect(limits.catchUpCents).toBe(0);
      expect(limits.totalLimitCents).toBe(4_150_00);
      expect(limits.remainingCents).toBe(4_150_00 - 2_000_00 - 500_00);
    });

    it('includes $1,000 catch-up for age 55+', () => {
      const limits = calculateHSALimits(makeHSA({ holderAge: 57 }));
      expect(limits.catchUpCents).toBe(1_000_00);
      expect(limits.totalLimitCents).toBe(5_150_00);
    });

    it('includes catch-up at exactly age 55', () => {
      const limits = calculateHSALimits(makeHSA({ holderAge: 55 }));
      expect(limits.catchUpCents).toBe(1_000_00);
    });

    it('clamps remaining to zero when over-contributed', () => {
      const limits = calculateHSALimits(
        makeHSA({
          ytdContributionsCents: 4_000_00,
          employerContributionsCents: 1_000_00,
        }),
      );
      expect(limits.remainingCents).toBe(0);
    });

    it('handles family coverage limits', () => {
      const limits = calculateHSALimits(makeHSA({ coverageType: HSACoverageType.FAMILY }));
      expect(limits.baseLimitCents).toBe(8_300_00);
    });
  });

  describe('calculateHSATripleTaxAdvantage', () => {
    it('calculates tax savings for all three benefits', () => {
      const result = calculateHSATripleTaxAdvantage(4_150_00, 0.22, 0.07, 1_000_00);

      expect(result.contributionTaxSavingsCents).toBeGreaterThan(0);
      expect(result.taxFreeGrowthCents).toBeGreaterThan(0);
      expect(result.taxFreeWithdrawalCents).toBeGreaterThan(0);
      expect(result.totalAdvantageCents).toBe(
        result.contributionTaxSavingsCents +
          result.taxFreeGrowthCents +
          result.taxFreeWithdrawalCents,
      );
    });

    it('returns zero for zero contribution', () => {
      const result = calculateHSATripleTaxAdvantage(0, 0.22, 0.07, 0);
      expect(result.totalAdvantageCents).toBe(0);
    });

    it('clamps marginal rate to [0, 1]', () => {
      const result = calculateHSATripleTaxAdvantage(1_000_00, 1.5, 0.07, 500_00);
      // Rate clamped to 1.0
      expect(result.contributionTaxSavingsCents).toBe(1_000_00);
    });

    it('handles zero growth rate', () => {
      const result = calculateHSATripleTaxAdvantage(4_150_00, 0.22, 0, 1_000_00);
      expect(result.taxFreeGrowthCents).toBe(0);
    });
  });

  describe('getHSAAvailableBalance', () => {
    it('subtracts pending reimbursements from balance', () => {
      const expenses = [
        makeExpense({ amountCents: 200_00, reimbursed: false }),
        makeExpense({ id: 'exp-2', amountCents: 100_00, reimbursed: true }),
      ];
      const available = getHSAAvailableBalance(makeHSA(), expenses);
      expect(available).toBe(5_000_00 - 200_00);
    });

    it('ignores expenses for other accounts', () => {
      const expenses = [makeExpense({ accountId: 'other', amountCents: 500_00 })];
      const available = getHSAAvailableBalance(makeHSA(), expenses);
      expect(available).toBe(5_000_00);
    });

    it('clamps to zero if pending exceeds balance', () => {
      const expenses = [makeExpense({ amountCents: 10_000_00 })];
      const available = getHSAAvailableBalance(makeHSA(), expenses);
      expect(available).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // FSA Tests
  // ---------------------------------------------------------------------------

  describe('getFSAElectionLimit', () => {
    it('returns $3,200', () => {
      expect(getFSAElectionLimit()).toBe(3_200_00);
    });
  });

  describe('getFSARolloverMax', () => {
    it('returns $640', () => {
      expect(getFSARolloverMax()).toBe(640_00);
    });
  });

  describe('getFSAAvailableBalance', () => {
    it('calculates available balance correctly', () => {
      const fsa = makeFSA();
      // election(2500) + rollover(200) - reimbursed(1000) = 1700
      expect(getFSAAvailableBalance(fsa)).toBe(1_700_00);
    });

    it('clamps to zero when fully used', () => {
      const fsa = makeFSA({ ytdReimbursementsCents: 5_000_00 });
      expect(getFSAAvailableBalance(fsa)).toBe(0);
    });
  });

  describe('calculateFSARollover', () => {
    it('caps rollover at $640', () => {
      expect(calculateFSARollover(1_000_00, true)).toBe(640_00);
    });

    it('rolls over full amount if under max', () => {
      expect(calculateFSARollover(300_00, true)).toBe(300_00);
    });

    it('returns zero if rollover not enabled', () => {
      expect(calculateFSARollover(500_00, false)).toBe(0);
    });

    it('handles negative unused (returns 0)', () => {
      expect(calculateFSARollover(-100_00, true)).toBe(0);
    });
  });

  describe('calculateFSADeadlineAlert', () => {
    it('calculates days until plan year end', () => {
      const alert = calculateFSADeadlineAlert(makeFSA(), '2024-12-01');
      expect(alert.daysUntilPlanYearEnd).toBe(30);
      expect(alert.daysUntilGracePeriodEnd).toBeGreaterThan(30);
    });

    it('marks urgent when <= 30 days and funds at risk', () => {
      const fsa = makeFSA({
        rolloverEnabled: false,
        gracePeriodEnd: null,
      });
      const alert = calculateFSADeadlineAlert(fsa, '2024-12-15');
      expect(alert.isUrgent).toBe(true);
      expect(alert.atRiskCents).toBeGreaterThan(0);
    });

    it('not urgent when no funds at risk', () => {
      const fsa = makeFSA({ ytdReimbursementsCents: 2_700_00 });
      const alert = calculateFSADeadlineAlert(fsa, '2024-12-15');
      // Available = 2500 + 200 - 2700 = 0, so nothing at risk
      expect(alert.atRiskCents).toBe(0);
      expect(alert.isUrgent).toBe(false);
    });

    it('handles null grace period', () => {
      const fsa = makeFSA({ gracePeriodEnd: null });
      const alert = calculateFSADeadlineAlert(fsa, '2024-10-01');
      expect(alert.daysUntilGracePeriodEnd).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Qualified expense tests
  // ---------------------------------------------------------------------------

  describe('getExpensesForAccount', () => {
    it('filters expenses by account ID', () => {
      const expenses = [
        makeExpense({ id: 'e1', accountId: 'hsa-1' }),
        makeExpense({ id: 'e2', accountId: 'hsa-2' }),
        makeExpense({ id: 'e3', accountId: 'hsa-1' }),
      ];
      const result = getExpensesForAccount(expenses, 'hsa-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('getUnreimbursedTotal', () => {
    it('sums only unreimbursed expenses for account', () => {
      const expenses = [
        makeExpense({ amountCents: 100_00, reimbursed: false }),
        makeExpense({ id: 'e2', amountCents: 200_00, reimbursed: true }),
        makeExpense({ id: 'e3', amountCents: 50_00, reimbursed: false }),
      ];
      expect(getUnreimbursedTotal(expenses, 'hsa-1')).toBe(150_00);
    });

    it('returns zero for no matching expenses', () => {
      expect(getUnreimbursedTotal([], 'hsa-1')).toBe(0);
    });
  });

  describe('summarizeExpensesByCategory', () => {
    it('groups totals by category', () => {
      const expenses = [
        makeExpense({
          id: 'e1',
          category: QualifiedExpenseCategory.DENTAL,
          amountCents: 300_00,
        }),
        makeExpense({
          id: 'e2',
          category: QualifiedExpenseCategory.DENTAL,
          amountCents: 200_00,
        }),
        makeExpense({
          id: 'e3',
          category: QualifiedExpenseCategory.VISION,
          amountCents: 150_00,
        }),
      ];
      const summary = summarizeExpensesByCategory(expenses, 'hsa-1');
      expect(summary.get(QualifiedExpenseCategory.DENTAL)).toBe(500_00);
      expect(summary.get(QualifiedExpenseCategory.VISION)).toBe(150_00);
    });
  });

  describe('getExpensesMissingReceipts', () => {
    it('returns expenses without verified receipts', () => {
      const expenses = [
        makeExpense({ id: 'e1', receiptVerified: true }),
        makeExpense({ id: 'e2', receiptVerified: false }),
        makeExpense({ id: 'e3', receiptVerified: false }),
      ];
      const missing = getExpensesMissingReceipts(expenses, 'hsa-1');
      expect(missing).toHaveLength(2);
    });
  });
});
