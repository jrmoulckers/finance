// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  addScenarioSinkingFundContribution,
  buildApplyBudgetScenarioPatch,
  createBudgetScenarioFromBaseline,
  diffBudgetScenario,
  summarizeBudgetScenario,
  updateScenarioBudgetAmount,
  updateScenarioIncome,
  type BudgetScenarioBaseline,
} from '../budget-scenarios';

const baseline: BudgetScenarioBaseline = {
  id: 'baseline-june',
  incomeCents: 500_000,
  startingBalanceCents: 100_000,
  budgets: [
    { id: 'groceries', categoryId: 'cat-groceries', name: 'Groceries', amountCents: 80_000 },
    { id: 'dining', categoryId: 'cat-dining', name: 'Dining', amountCents: 40_000 },
  ],
};

describe('budget scenarios', () => {
  it('clones a baseline without mutating live budget rows', () => {
    const scenario = createBudgetScenarioFromBaseline(baseline, {
      id: 'scenario-cut-dining',
      name: 'Cut dining',
      createdAt: '2025-06-01T00:00:00.000Z',
    });
    const changed = updateScenarioBudgetAmount(scenario, 'dining', 25_000);

    expect(scenario).not.toBe(changed);
    expect(scenario.budgets[1].amountCents).toBe(40_000);
    expect(baseline.budgets[1].amountCents).toBe(40_000);
    expect(changed.budgets[1].amountCents).toBe(25_000);
  });

  it('summarizes assigned, remaining cash flow, and projected balance deltas', () => {
    const scenario = addScenarioSinkingFundContribution(
      updateScenarioIncome(
        updateScenarioBudgetAmount(
          createBudgetScenarioFromBaseline(baseline, {
            id: 'scenario-save-more',
            name: 'Save more',
            createdAt: '2025-06-01T00:00:00.000Z',
          }),
          'dining',
          25_000,
        ),
        520_000,
      ),
      {
        id: 'fund-insurance',
        name: 'Insurance fund',
        linkedCategoryId: 'cat-insurance',
        contributionCents: 30_000,
      },
    );

    const summary = summarizeBudgetScenario(baseline, scenario);

    expect(summary.baselineAssignedCents).toBe(120_000);
    expect(summary.scenarioAssignedCents).toBe(135_000);
    expect(summary.assignedDeltaCents).toBe(15_000);
    expect(summary.scenarioRemainingCashFlowCents).toBe(385_000);
    expect(summary.projectedMonthEndDeltaCents).toBe(5_000);
  });

  it('reports diffs and builds an apply patch for accepted changes', () => {
    const scenario = addScenarioSinkingFundContribution(
      updateScenarioBudgetAmount(
        createBudgetScenarioFromBaseline(baseline, {
          id: 'scenario-apply',
          name: 'Apply me',
          createdAt: '2025-06-01T00:00:00.000Z',
        }),
        'groceries',
        90_000,
      ),
      {
        id: 'fund-holiday',
        name: 'Holiday fund',
        linkedCategoryId: 'cat-holiday',
        contributionCents: 15_000,
      },
    );

    expect(diffBudgetScenario(baseline, scenario)).toEqual([
      {
        budgetId: 'groceries',
        categoryId: 'cat-groceries',
        name: 'Groceries',
        baselineAmountCents: 80_000,
        scenarioAmountCents: 90_000,
        deltaCents: 10_000,
      },
    ]);
    expect(buildApplyBudgetScenarioPatch(baseline, scenario)).toEqual({
      budgetUpdates: [{ budgetId: 'groceries', amountCents: 90_000 }],
      sinkingFundContributionBudgets: [
        { name: 'Holiday fund', categoryId: 'cat-holiday', amountCents: 15_000 },
      ],
      incomeCents: 500_000,
    });
  });
});
