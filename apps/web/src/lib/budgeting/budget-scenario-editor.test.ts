// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  createScenarioEditorState,
  createScenarioFromCurrentBudget,
  duplicateScenarioDraft,
  editScenarioCategoryAmount,
  editScenarioIncome,
  editScenarioSinkingFundContribution,
  getScenarioEntryPointDecision,
  summarizeScenarioComparison,
} from './budget-scenario-editor';

const baseline = {
  id: 'baseline-1',
  incomeCents: 500_000,
  startingBalanceCents: 25_000,
  budgets: [
    { id: 'budget-rent', categoryId: 'rent', name: 'Rent', amountCents: 200_000 },
    { id: 'budget-food', categoryId: 'food', name: 'Food', amountCents: 75_000 },
  ],
};

describe('budget scenario editor helpers', () => {
  it('creates a scenario from current budgets and summarizes assigned cash flow', () => {
    const scenario = createScenarioFromCurrentBudget(baseline, {
      id: 'scenario-1',
      name: 'Try less food spend',
      createdAt: '2025-03-02T00:00:00Z',
    });
    const edited = editScenarioCategoryAmount(
      editScenarioIncome(scenario, 525_000),
      'budget-food',
      60_000,
    );
    const comparison = summarizeScenarioComparison(baseline, edited);

    expect(comparison).toMatchObject({
      scenarioAssignedCents: 260_000,
      scenarioRemainingCashFlowCents: 265_000,
      scenarioProjectedMonthEndBalanceCents: 290_000,
      assignedDeltaCents: -15_000,
      remainingCashFlowDeltaCents: 40_000,
      projectedMonthEndDeltaCents: 40_000,
    });
  });

  it('tracks category, income, and sinking fund editor changes', () => {
    const scenario = createScenarioFromCurrentBudget(baseline, {
      id: 'scenario-1',
      name: 'Try less food spend',
      createdAt: '2025-03-02T00:00:00Z',
    });
    const edited = editScenarioSinkingFundContribution(
      editScenarioCategoryAmount(editScenarioIncome(scenario, 525_000), 'budget-food', 60_000),
      { id: 'fund-1', name: 'Car repair', linkedCategoryId: 'auto', contributionCents: 10_000 },
    );
    const state = createScenarioEditorState(baseline, edited);

    expect(state.dirtyBudgetIds).toEqual(['budget-food']);
    expect(state.hasIncomeChange).toBe(true);
    expect(state.hasSinkingFundChanges).toBe(true);
    expect(getScenarioEntryPointDecision('discard', state)).toMatchObject({
      requiresConfirmation: true,
      destructive: true,
    });
    expect(getScenarioEntryPointDecision('apply', state).message).toContain(
      'Apply 3 scenario changes',
    );
  });

  it('duplicates drafts without mutating the original scenario', () => {
    const scenario = createScenarioFromCurrentBudget(baseline, {
      id: 'scenario-1',
      name: 'Original',
      createdAt: '2025-03-02T00:00:00Z',
    });

    const duplicate = duplicateScenarioDraft(scenario, {
      id: 'scenario-2',
      name: 'Copy',
      createdAt: '2025-03-03T00:00:00Z',
    });

    expect(duplicate).toMatchObject({ id: 'scenario-2', name: 'Copy' });
    expect(scenario).toMatchObject({ id: 'scenario-1', name: 'Original' });
    expect(duplicate.budgets).not.toBe(scenario.budgets);
  });
});
