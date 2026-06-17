// SPDX-License-Identifier: BUSL-1.1

import type { BudgetAmountSuggestion } from './budget-suggestions';
import type { BudgetStarterTemplate } from './starter-budget-templates';

export type BudgetSuggestionChoice = 'pending' | 'accepted' | 'edited' | 'ignored' | 'unavailable';

export interface BudgetSuggestionFormState {
  readonly categoryId: string;
  readonly suggestedAmountCents: number | null;
  readonly manualAmountCents: number | null;
  readonly selectedAmountCents: number | null;
  readonly choice: BudgetSuggestionChoice;
  readonly confidenceLabel: string;
  readonly explanation: string;
  readonly fallbackMessage: string | null;
  readonly ariaLiveMessage: string;
}

export interface TemplateSuggestionComparison {
  readonly templateName: string;
  readonly categoryName: string;
  readonly templateAmountCents: number;
  readonly suggestedAmountCents: number | null;
  readonly deltaCents: number | null;
  readonly recommendation: 'use-suggestion' | 'keep-template' | 'manual-review';
  readonly explanation: string;
}

export function createBudgetSuggestionFormState(
  suggestion: BudgetAmountSuggestion,
  manualAmountCents: number | null = null,
): BudgetSuggestionFormState {
  if (suggestion.suggestedAmountCents === null) {
    return {
      categoryId: suggestion.categoryId,
      suggestedAmountCents: null,
      manualAmountCents,
      selectedAmountCents: manualAmountCents,
      choice: 'unavailable',
      confidenceLabel: 'No confidence yet',
      explanation: suggestion.basis,
      fallbackMessage: accessibleFallbackForSuggestion(suggestion),
      ariaLiveMessage: `No budget suggestion is available for ${suggestion.categoryId}.`,
    };
  }

  return {
    categoryId: suggestion.categoryId,
    suggestedAmountCents: suggestion.suggestedAmountCents,
    manualAmountCents,
    selectedAmountCents: manualAmountCents ?? suggestion.suggestedAmountCents,
    choice: 'pending',
    confidenceLabel: `Confidence: ${suggestion.confidence}`,
    explanation: suggestion.basis,
    fallbackMessage: suggestion.fallbackReason === 'sparse-history'
      ? 'Only sparse spending history is available, so review the amount before accepting it.'
      : null,
    ariaLiveMessage: `Budget suggestion ready for ${suggestion.categoryId} with ${suggestion.confidence} confidence.`,
  };
}

export function acceptBudgetSuggestion(state: BudgetSuggestionFormState): BudgetSuggestionFormState {
  if (state.suggestedAmountCents === null) return state;
  return {
    ...state,
    selectedAmountCents: state.suggestedAmountCents,
    choice: 'accepted',
    ariaLiveMessage: `Accepted suggestion for ${state.categoryId}.`,
  };
}

export function editBudgetSuggestion(
  state: BudgetSuggestionFormState,
  amountCents: number,
): BudgetSuggestionFormState {
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    throw new RangeError('Budget suggestion edits must use a non-negative finite amount.');
  }

  return {
    ...state,
    selectedAmountCents: Math.round(amountCents),
    choice: 'edited',
    ariaLiveMessage: `Edited suggestion for ${state.categoryId}.`,
  };
}

export function ignoreBudgetSuggestion(state: BudgetSuggestionFormState): BudgetSuggestionFormState {
  return {
    ...state,
    selectedAmountCents: state.manualAmountCents,
    choice: 'ignored',
    ariaLiveMessage: `Ignored suggestion for ${state.categoryId}; manual amount is unchanged.`,
  };
}

export function compareSuggestionToStarterTemplate(
  template: BudgetStarterTemplate,
  categoryName: string,
  suggestion: BudgetAmountSuggestion,
): TemplateSuggestionComparison {
  const templateCategory = template.categories.find((category) => category.name === categoryName);
  const templateAmountCents = templateCategory?.amountCents ?? 0;
  const suggestedAmountCents = suggestion.suggestedAmountCents;
  const deltaCents = suggestedAmountCents === null ? null : suggestedAmountCents - templateAmountCents;
  const recommendation = suggestedAmountCents === null || suggestion.confidence === 'low'
    ? 'manual-review'
    : Math.abs(deltaCents ?? 0) >= 5_000
      ? 'use-suggestion'
      : 'keep-template';

  return {
    templateName: template.name,
    categoryName,
    templateAmountCents,
    suggestedAmountCents,
    deltaCents,
    recommendation,
    explanation: buildTemplateComparisonExplanation(recommendation, suggestion),
  };
}

function accessibleFallbackForSuggestion(suggestion: BudgetAmountSuggestion): string {
  if (suggestion.fallbackReason === 'empty-history') {
    return 'No recent transactions were found. Enter an amount manually or use a starter template.';
  }

  return 'A suggestion cannot be calculated yet. Enter an amount manually.';
}

function buildTemplateComparisonExplanation(
  recommendation: TemplateSuggestionComparison['recommendation'],
  suggestion: BudgetAmountSuggestion,
): string {
  if (recommendation === 'use-suggestion') {
    return `Recent history is stronger than the starter template because confidence is ${suggestion.confidence}.`;
  }
  if (recommendation === 'keep-template') {
    return 'The starter template is close to recent spending, so it is safe to keep as a starting point.';
  }
  return 'Review manually because the suggestion is missing or has low confidence.';
}
