// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  calculateSinkingFundPlan,
  summarizeSinkingFundPortfolio,
  type SinkingFundPlannerInput,
} from '../sinking-fund-planner';

function fund(overrides: Partial<SinkingFundPlannerInput> = {}): SinkingFundPlannerInput {
  return {
    id: 'fund-insurance',
    name: 'Insurance',
    targetCents: 120_000,
    dueDate: '2025-07-01',
    linkedCategoryId: 'cat-insurance',
    savedCents: 0,
    cadence: 'MONTHLY',
    ...overrides,
  };
}

describe('calculateSinkingFundPlan', () => {
  it('calculates recommended monthly contribution without counting it as spending', () => {
    const plan = calculateSinkingFundPlan(fund(), '2025-01-01');

    expect(plan.periodsRemaining).toBe(7);
    expect(plan.monthsRemaining).toBe(7);
    expect(plan.contributionPerPeriodCents).toBe(17_143);
    expect(plan.remainingCents).toBe(120_000);
    expect(plan.status).toBe('on-track');
    expect(plan.allocation).toEqual({
      categoryId: 'cat-insurance',
      amountCents: 17_143,
      kind: 'sinking-fund-contribution',
      spendingImpactCents: 0,
    });
  });

  it('uses saved-to-date to reduce the required contribution', () => {
    const plan = calculateSinkingFundPlan(fund({ savedCents: 60_000 }), '2025-01-01');

    expect(plan.savedToDateCents).toBe(60_000);
    expect(plan.remainingCents).toBe(60_000);
    expect(plan.contributionPerPeriodCents).toBe(8_571);
  });

  it('marks overdue funds due immediately for the remaining balance', () => {
    const plan = calculateSinkingFundPlan(
      fund({ targetCents: 50_000, savedCents: 12_500, dueDate: '2025-01-01' }),
      '2025-02-01',
    );

    expect(plan.status).toBe('overdue');
    expect(plan.periodsRemaining).toBe(0);
    expect(plan.contributionPerPeriodCents).toBe(37_500);
  });

  it('marks fully funded plans and stops recommending contributions', () => {
    const plan = calculateSinkingFundPlan(fund({ savedCents: 120_000 }), '2025-01-01');

    expect(plan.status).toBe('funded');
    expect(plan.remainingCents).toBe(0);
    expect(plan.contributionPerPeriodCents).toBe(0);
    expect(plan.projectedSavedByDueCents).toBe(120_000);
  });

  it('flags catch-up when planned contributions will miss the target', () => {
    const plan = calculateSinkingFundPlan(fund({ plannedContributionCents: 5_000 }), '2025-01-01');

    expect(plan.status).toBe('catch-up');
    expect(plan.fundingGapAtDueCents).toBe(85_000);
  });
});

describe('summarizeSinkingFundPortfolio', () => {
  it('summarizes contributions, remaining balances, and status counts', () => {
    const summary = summarizeSinkingFundPortfolio(
      [fund(), fund({ id: 'fund-holiday', name: 'Holiday', savedCents: 120_000 })],
      '2025-01-01',
    );

    expect(summary.plans).toHaveLength(2);
    expect(summary.totalContributionCents).toBe(17_143);
    expect(summary.totalRemainingCents).toBe(120_000);
    expect(summary.fundedCount).toBe(1);
  });
});
