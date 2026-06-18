// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  buildSinkingFundBudgetListState,
  buildSinkingFundDetailView,
} from '../sinking-fund-budget-view';

describe('sinking fund budget view', () => {
  it('separates sinking fund contributions from normal budget spend limits', () => {
    const state = buildSinkingFundBudgetListState({
      today: '2025-01-01',
      budgets: [
        {
          id: 'budget-food',
          name: 'Food',
          categoryId: 'cat-food',
          amountCents: 60_000,
          spentCents: 20_000,
        },
        {
          id: 'budget-car',
          name: 'Car insurance',
          categoryId: 'cat-car',
          amountCents: 20_000,
          spentCents: 0,
        },
      ],
      funds: [
        {
          id: 'fund-car',
          name: 'Car insurance',
          targetCents: 120_000,
          savedCents: 0,
          dueDate: '2025-07-01',
          linkedCategoryId: 'cat-car',
        },
      ],
    });

    expect(state.normalBudgets.map((budget) => budget.id)).toEqual(['budget-food']);
    expect(state.sinkingFundContributions[0]).toMatchObject({
      fundId: 'fund-car',
      contributionCents: 17_143,
      remainingCents: 120_000,
      status: 'on-track',
    });
  });

  it('builds detail and accessible empty states', () => {
    const detail = buildSinkingFundDetailView(
      {
        id: 'fund-car',
        name: 'Car insurance',
        targetCents: 120_000,
        savedCents: 60_000,
        dueDate: '2025-07-01',
        linkedCategoryId: 'cat-car',
      },
      '2025-01-01',
    );
    const empty = buildSinkingFundBudgetListState({ budgets: [], funds: [], today: '2025-01-01' });

    expect(detail.savedToDateCents).toBe(60_000);
    expect(detail.monthsRemaining).toBe(7);
    expect(empty.emptyMessage).toContain('No budgets or sinking funds yet');
  });
});
