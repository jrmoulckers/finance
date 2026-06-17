// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { BudgetAmountSuggestion } from './budget-suggestions';
import {
  acceptBudgetSuggestion,
  compareSuggestionToStarterTemplate,
  createBudgetSuggestionFormState,
  editBudgetSuggestion,
  ignoreBudgetSuggestion,
} from './budget-suggestion-actions';
import { getBudgetStarterTemplateById } from './starter-budget-templates';

const suggestion: BudgetAmountSuggestion = {
  categoryId: 'food',
  suggestedAmountCents: 62_500,
  confidence: 'high',
  rule: 'hybrid',
  basis: 'Based on six months of recent spending.',
  monthsAnalyzed: 6,
  monthsWithSpend: 6,
  samples: [],
  outlierMonthKeys: [],
  includesChildren: true,
  fallbackReason: null,
};

describe('budget suggestion form actions', () => {
  it('lets users accept, edit, or ignore a suggestion without losing manual control', () => {
    const initial = createBudgetSuggestionFormState(suggestion, 50_000);

    expect(acceptBudgetSuggestion(initial)).toMatchObject({
      choice: 'accepted',
      selectedAmountCents: 62_500,
    });
    expect(editBudgetSuggestion(initial, 58_250)).toMatchObject({
      choice: 'edited',
      selectedAmountCents: 58_250,
    });
    expect(ignoreBudgetSuggestion(initial)).toMatchObject({
      choice: 'ignored',
      selectedAmountCents: 50_000,
    });
  });

  it('surfaces accessible sparse and empty fallback messages', () => {
    const empty = createBudgetSuggestionFormState({
      ...suggestion,
      suggestedAmountCents: null,
      confidence: 'none',
      basis: 'No recent spending found for this category.',
      monthsWithSpend: 0,
      fallbackReason: 'empty-history',
    });

    expect(empty.choice).toBe('unavailable');
    expect(empty.fallbackMessage).toContain('No recent transactions');
    expect(empty.ariaLiveMessage).toContain('No budget suggestion');

    const sparse = createBudgetSuggestionFormState({
      ...suggestion,
      confidence: 'low',
      monthsWithSpend: 1,
      fallbackReason: 'sparse-history',
    });

    expect(sparse.fallbackMessage).toContain('sparse spending history');
  });

  it('compares high-confidence suggestions against starter templates', () => {
    const template = getBudgetStarterTemplateById('food-meals');
    expect(template).not.toBeNull();

    const comparison = compareSuggestionToStarterTemplate(template!, 'Food & Meals', suggestion);

    expect(comparison).toMatchObject({
      templateName: 'Food & Meals',
      categoryName: 'Food & Meals',
      templateAmountCents: 70_000,
      suggestedAmountCents: 62_500,
      deltaCents: -7_500,
      recommendation: 'use-suggestion',
    });
  });
});
