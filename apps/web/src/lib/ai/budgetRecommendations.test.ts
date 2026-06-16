// SPDX-License-Identifier: BUSL-1.1

import { applyBudgetRecommendationDecision, getBudgetDataNeededMessage, recommendBudgetsFromHistory, type BudgetRecommendationTransaction } from './budgetRecommendations';

const transactions: readonly BudgetRecommendationTransaction[] = [
  { id: 'g1', date: '2026-01-05', amountCents: -40_000, type: 'expense', category: 'Groceries' },
  { id: 'g2', date: '2026-02-05', amountCents: -42_000, type: 'expense', category: 'Groceries' },
  { id: 'g3', date: '2026-03-05', amountCents: -41_000, type: 'expense', category: 'Groceries' },
  { id: 'g4', date: '2026-04-05', amountCents: -120_000, type: 'expense', category: 'Groceries' },
  { id: 'd1', date: '2026-01-10', amountCents: -10_000, type: 'expense', category: 'Dining' },
  { id: 'd2', date: '2026-02-10', amountCents: -9_000, type: 'expense', category: 'Dining' },
  { id: 'd3', date: '2026-03-10', amountCents: -8_000, type: 'expense', category: 'Dining' },
  { id: 'u1', date: '2026-01-15', amountCents: -7_000, type: 'expense' },
  { id: 'u2', date: '2026-02-15', amountCents: -8_000, type: 'expense' },
];

describe('smart budget recommendations', () => {
  it('aggregates categories, trims outliers, and recommends realistic budget changes', () => {
    const recommendations = recommendBudgetsFromHistory(
      transactions,
      [
        { id: 'g', category: 'Groceries', amountCents: 30_000 },
        { id: 'd', category: 'Dining', amountCents: 20_000 },
      ],
      { startDate: '2026-01-01', endDate: '2026-04-30', minimumMonths: 3 },
    );
    const groceries = recommendations.find((item) => item.category === 'Groceries');
    const dining = recommendations.find((item) => item.category === 'Dining');
    expect(groceries).toMatchObject({ action: 'increase' });
    expect(groceries?.averageSpendCents).toBeLessThan(70_000);
    expect(dining).toMatchObject({ action: 'decrease' });
  });

  it('suggests new categories and explains source period, average, variance, and confidence', () => {
    const recommendations = recommendBudgetsFromHistory(transactions, [], { startDate: '2026-01-01', endDate: '2026-04-30', minimumMonths: 2 });
    const uncategorized = recommendations.find((item) => item.category === 'Uncategorized');
    expect(uncategorized).toMatchObject({ action: 'create', status: 'suggested' });
    expect(uncategorized?.explanation).toContain('average monthly spend');
    expect(uncategorized?.confidence).toBeGreaterThan(0.35);
  });

  it('returns a clear data-needed path when history is insufficient', () => {
    const recommendations = recommendBudgetsFromHistory(transactions, [], { startDate: '2026-04-01', endDate: '2026-04-30', minimumMonths: 2 });
    expect(recommendations).toEqual([]);
    expect(getBudgetDataNeededMessage({ startDate: '2026-04-01', endDate: '2026-04-30', minimumMonths: 2 })).toContain('At least 2 months');
  });

  it('requires user-controlled apply, edit, ignore, and snooze flows', () => {
    const [recommendation] = recommendBudgetsFromHistory(transactions, [], { startDate: '2026-01-01', endDate: '2026-04-30', minimumMonths: 2 });
    const applied = applyBudgetRecommendationDecision([recommendation], { recommendationId: recommendation.id, action: 'edit', amountCents: 50_000 });
    expect(applied.change).toMatchObject({ amountCents: 50_000, status: 'applied' });
    expect(applyBudgetRecommendationDecision([recommendation], { recommendationId: recommendation.id, action: 'ignore' }).recommendations[0].status).toBe('ignored');
    expect(applyBudgetRecommendationDecision([recommendation], { recommendationId: recommendation.id, action: 'snooze', snoozeUntil: '2026-05-01' }).recommendations[0].status).toBe('snoozed');
  });
});
