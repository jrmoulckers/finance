// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  calculateActiveCadenceRange,
  calculateRolloverLedger,
  forecastMonthEndBalance,
  generateVarianceInsights,
  normalizeBudgetAmountCents,
  summarizeCadenceIncome,
  summarizeEnvelopePlan,
} from './budgeting-beta';

describe('budgeting beta utilities', () => {
  it('calculates balanced, under-assigned, and over-assigned zero-based envelope plans', () => {
    const budgets = [
      {
        id: 'rent',
        categoryId: 'rent',
        name: 'Rent',
        amountCents: 150_000,
        spentCents: 100_000,
        period: 'MONTHLY' as const,
        isRollover: false,
      },
      {
        id: 'food',
        categoryId: 'food',
        name: 'Food',
        amountCents: 50_000,
        spentCents: 20_000,
        period: 'MONTHLY' as const,
        isRollover: true,
      },
    ];

    expect(summarizeEnvelopePlan(200_000, budgets).status).toBe('fully-allocated');
    expect(summarizeEnvelopePlan(250_000, budgets).readyToAssignCents).toBe(50_000);
    expect(summarizeEnvelopePlan(175_000, budgets).status).toBe('over-allocated');
    expect(summarizeEnvelopePlan(200_000, budgets).envelopes[1].envelopeBalanceCents).toBe(30_000);
  });

  it('normalizes weekly, biweekly, and monthly cadence amounts', () => {
    expect(normalizeBudgetAmountCents(10_000, 'WEEKLY', 'MONTHLY')).toBe(43_333);
    expect(normalizeBudgetAmountCents(100_000, 'MONTHLY', 'WEEKLY')).toBe(23_077);
    expect(
      summarizeCadenceIncome(
        [{ id: 'p1', source: 'Paycheck', amountCents: 80_000, date: '2025-03-07' }],
        'WEEKLY',
      ),
    ).toEqual({
      cadenceIncomeCents: 80_000,
      projectedMonthlyIncomeCents: 346_667,
      eventCount: 1,
    });
  });

  it('returns weekly and monthly active date ranges', () => {
    expect(calculateActiveCadenceRange('WEEKLY', new Date('2025-03-05T12:00:00Z'))).toEqual({
      startDate: '2025-03-03',
      endDate: '2025-03-09',
    });
    expect(calculateActiveCadenceRange('MONTHLY', new Date('2025-02-12T12:00:00Z'))).toEqual({
      startDate: '2025-02-01',
      endDate: '2025-02-28',
    });
  });

  it('carries positive and negative rollover balances across three periods', () => {
    const ledger = calculateRolloverLedger([
      { label: 'Jan', allocationCents: 50_000, spentCents: 40_000 },
      { label: 'Feb', allocationCents: 50_000, spentCents: 70_000 },
      { label: 'Mar', allocationCents: 50_000, spentCents: 45_000 },
    ]);

    expect(ledger.map((period) => period.beginningCarryoverCents)).toEqual([0, 10_000, -10_000]);
    expect(ledger.map((period) => period.endingBalanceCents)).toEqual([10_000, -10_000, -5_000]);
  });

  it('generates deterministic variance coaching for over, under, and no-prior cases', () => {
    const insights = generateVarianceInsights([
      {
        categoryId: 'food',
        name: 'Food',
        budgetedCents: 50_000,
        actualCents: 65_000,
        priorActualCents: 60_000,
      },
      {
        categoryId: 'fun',
        name: 'Fun',
        budgetedCents: 40_000,
        actualCents: 10_000,
        priorActualCents: null,
      },
      {
        categoryId: 'gas',
        name: 'Gas',
        budgetedCents: 30_000,
        actualCents: 28_000,
        priorActualCents: 31_000,
      },
    ]);

    expect(insights).toHaveLength(2);
    expect(insights[0]).toMatchObject({
      categoryId: 'fun',
      kind: 'under',
      trend: 'no-prior-period',
    });
    expect(insights[1]).toMatchObject({
      categoryId: 'food',
      kind: 'over',
      trend: 'recurring-trend',
      variancePercent: 30,
    });
  });

  it('forecasts month-end balance with positive, shortfall, missing-income, and overdrawn cases', () => {
    const positive = forecastMonthEndBalance({
      currentBalanceCents: 100_000,
      today: '2025-03-10',
      monthEnd: '2025-03-31',
      expectedIncome: [{ id: 'pay', label: 'Paycheck', date: '2025-03-15', amountCents: 200_000 }],
      scheduledOutflows: [{ id: 'rent', label: 'Rent', date: '2025-03-20', amountCents: 100_000 }],
      remainingBudgetedSpendCents: 50_000,
    });
    expect(positive.projectedEndBalanceCents).toBe(150_000);
    expect(positive.hasShortfall).toBe(false);

    const shortfall = forecastMonthEndBalance({
      currentBalanceCents: 40_000,
      today: '2025-03-10',
      monthEnd: '2025-03-31',
      expectedIncome: [],
      scheduledOutflows: [{ id: 'rent', label: 'Rent', date: '2025-03-20', amountCents: 75_000 }],
      remainingBudgetedSpendCents: 0,
    });
    expect(shortfall.hasShortfall).toBe(true);
    expect(shortfall.lowestBalanceDate).toBe('2025-03-20');
    expect(shortfall.confidence).toBe('medium');

    const missingIncome = forecastMonthEndBalance({
      currentBalanceCents: 10_000,
      today: '2025-03-10',
      monthEnd: '2025-03-31',
      expectedIncome: [],
      scheduledOutflows: [],
      remainingBudgetedSpendCents: 0,
    });
    expect(missingIncome.confidence).toBe('low');
    expect(missingIncome.assumptions[1]).toMatch(/No expected income/);

    const overdrawn = forecastMonthEndBalance({
      currentBalanceCents: -5_000,
      today: '2025-03-10',
      monthEnd: '2025-03-31',
      expectedIncome: [],
      scheduledOutflows: [],
      remainingBudgetedSpendCents: 0,
    });
    expect(overdrawn.hasShortfall).toBe(true);
  });
});
