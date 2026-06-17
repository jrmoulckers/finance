// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { calculateHealthScore } from './healthScore';

describe('calculateHealthScore', () => {
  it('applies the requested composite formula', () => {
    const result = calculateHealthScore({
      savingsRate: 22,
      onTrackBudgetRatio: 0.8,
      monthlyExpenses: 50_000,
      emergencyFundBalance: 200_000,
      debtBalance: 18_000,
      annualizedIncome: 120_000,
    });

    expect(result.breakdown).toEqual({
      savingsRate: 25,
      budgetAdherence: 20,
      emergencyFund: 20,
      debtToIncome: 25,
    });
    expect(result.metrics.monthsOfExpensesSaved).toBe(4);
    expect(result.metrics.debtToIncomeRatio).toBe(15);
    expect(result.score).toBe(90);
    expect(result.label).toBe('Excellent');
  });

  it('drops score when savings and debt metrics are weak', () => {
    const result = calculateHealthScore({
      savingsRate: -5,
      onTrackBudgetRatio: 0.2,
      monthlyExpenses: 60_000,
      emergencyFundBalance: 30_000,
      debtBalance: 90_000,
      annualizedIncome: 100_000,
    });

    expect(result.breakdown.savingsRate).toBe(0);
    expect(result.breakdown.budgetAdherence).toBe(5);
    expect(result.breakdown.emergencyFund).toBe(2.5);
    expect(result.breakdown.debtToIncome).toBe(0);
    expect(result.label).toBe('Needs attention');
  });
});
