// SPDX-License-Identifier: BUSL-1.1

import {
  EMPTY_FIRST_BUDGET_DRAFT,
  buildFirstBudgetReview,
  getNextFirstBudgetStep,
  normalizeFirstBudgetDraft,
  type FirstBudgetDraft,
  type FirstBudgetTutorialStepId,
} from '../onboarding/first-budget-tutorial';

export const FIRST_BUDGET_DRAFT_STORAGE_KEY = 'finance:first-budget-tutorial-draft:v1';

export type FirstBudgetEntrySurface = 'onboarding' | 'dashboard';

export interface FirstBudgetTutorialEntryState {
  readonly surface: FirstBudgetEntrySurface;
  readonly route: string;
  readonly ctaLabel: string;
  readonly resumeStepId: FirstBudgetTutorialStepId;
  readonly hasSavedDraft: boolean;
  readonly isReadyToSave: boolean;
  readonly studentStarterTemplateAvailable: boolean;
}

export function serializeFirstBudgetTutorialDraft(draft: FirstBudgetDraft): string {
  return JSON.stringify(normalizeFirstBudgetDraft(draft));
}

export function deserializeFirstBudgetTutorialDraft(serialized: string | null): FirstBudgetDraft {
  if (!serialized) return EMPTY_FIRST_BUDGET_DRAFT;
  try {
    return normalizeFirstBudgetDraft(JSON.parse(serialized) as Partial<FirstBudgetDraft>);
  } catch {
    return EMPTY_FIRST_BUDGET_DRAFT;
  }
}

export function buildFirstBudgetTutorialEntryState(input: {
  readonly draft?: FirstBudgetDraft;
  readonly surface: FirstBudgetEntrySurface;
  readonly studentStarterTemplateAvailable?: boolean;
}): FirstBudgetTutorialEntryState {
  const draft = normalizeFirstBudgetDraft(input.draft ?? EMPTY_FIRST_BUDGET_DRAFT);
  const review = buildFirstBudgetReview(draft);
  const nextStep = getNextFirstBudgetStep(draft);
  const hasSavedDraft =
    draft.estimates.length > 0 ||
    draft.completedStepIds.length > 0 ||
    draft.pausedAtStepId !== undefined;

  return {
    surface: input.surface,
    route: input.surface === 'onboarding' ? '/onboarding/first-budget' : '/budgets/first-budget',
    ctaLabel: hasSavedDraft ? 'Resume first budget' : 'Start first budget',
    resumeStepId: nextStep.id,
    hasSavedDraft,
    isReadyToSave: review.canSave,
    studentStarterTemplateAvailable: input.studentStarterTemplateAvailable === true,
  };
}
