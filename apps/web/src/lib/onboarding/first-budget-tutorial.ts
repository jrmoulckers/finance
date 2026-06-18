// SPDX-License-Identifier: BUSL-1.1

/**
 * Guided first-budget tutorial model.
 *
 * Keeps the education-first flow separate from starter templates so the UI can
 * let users estimate, revise, pause, resume, and explicitly confirm before any
 * budget records are created.
 *
 * References: issue #2284
 */

export type FirstBudgetTutorialStepId =
  | 'income'
  | 'fixed-expenses'
  | 'flexible-spending'
  | 'savings'
  | 'review';

export type FirstBudgetCategoryKind = 'income' | 'fixed' | 'flexible' | 'savings';

export interface FirstBudgetTutorialStep {
  readonly id: FirstBudgetTutorialStepId;
  readonly title: string;
  readonly plainLanguageGoal: string;
  readonly example: string;
  readonly categoryKind: FirstBudgetCategoryKind | 'review';
  readonly allowsRoughEstimate: boolean;
}

export interface FirstBudgetEstimate {
  readonly id: string;
  readonly label: string;
  readonly kind: FirstBudgetCategoryKind;
  readonly amountCents: number;
  readonly isRoughEstimate: boolean;
}

export interface FirstBudgetDraft {
  readonly estimates: readonly FirstBudgetEstimate[];
  readonly completedStepIds: readonly FirstBudgetTutorialStepId[];
  readonly pausedAtStepId?: FirstBudgetTutorialStepId;
  readonly confirmedForSave: boolean;
}

export interface FirstBudgetReview {
  readonly totalIncomeCents: number;
  readonly totalPlannedOutflowCents: number;
  readonly remainingCents: number;
  readonly roughEstimateCount: number;
  readonly canSave: boolean;
  readonly summary: string;
  readonly warnings: readonly string[];
}

export const FIRST_BUDGET_TUTORIAL_STEPS: readonly FirstBudgetTutorialStep[] = [
  {
    id: 'income',
    title: 'Start with money coming in',
    plainLanguageGoal:
      'Add paychecks, benefits, or other money you expect this month. A close estimate is enough to begin.',
    example: 'Example: two paychecks of $1,200 each becomes $2,400 of monthly income.',
    categoryKind: 'income',
    allowsRoughEstimate: true,
  },
  {
    id: 'fixed-expenses',
    title: 'List bills that are hard to change',
    plainLanguageGoal:
      'Capture rent, utilities, subscriptions, minimum debt payments, and other regular commitments.',
    example: 'Example: rent $950, phone $45, transit pass $80.',
    categoryKind: 'fixed',
    allowsRoughEstimate: true,
  },
  {
    id: 'flexible-spending',
    title: 'Estimate flexible spending',
    plainLanguageGoal:
      'Plan categories you can adjust during the month, like groceries, restaurants, fun, or household supplies.',
    example: 'Example: groceries $320, eating out $120, fun $60.',
    categoryKind: 'flexible',
    allowsRoughEstimate: true,
  },
  {
    id: 'savings',
    title: 'Choose a savings target',
    plainLanguageGoal:
      'Set aside money for a buffer or goal if there is room. Small amounts still count.',
    example: 'Example: $50 toward an emergency buffer.',
    categoryKind: 'savings',
    allowsRoughEstimate: true,
  },
  {
    id: 'review',
    title: 'Review before saving',
    plainLanguageGoal:
      'Check what will be created, revise any number, then save only when you explicitly confirm.',
    example:
      'Example: if planned spending is higher than income, lower a flexible category before saving.',
    categoryKind: 'review',
    allowsRoughEstimate: false,
  },
];

const STEP_IDS = new Set(FIRST_BUDGET_TUTORIAL_STEPS.map((step) => step.id));
const CATEGORY_KINDS = new Set<FirstBudgetCategoryKind>(['income', 'fixed', 'flexible', 'savings']);

export const EMPTY_FIRST_BUDGET_DRAFT: FirstBudgetDraft = {
  estimates: [],
  completedStepIds: [],
  confirmedForSave: false,
};

export function normalizeAmountCents(amountCents: number): number {
  if (!Number.isFinite(amountCents)) return 0;
  return Math.max(0, Math.round(amountCents));
}

export function normalizeFirstBudgetDraft(draft: Partial<FirstBudgetDraft> = {}): FirstBudgetDraft {
  const estimates = (draft.estimates ?? [])
    .filter((estimate) => CATEGORY_KINDS.has(estimate.kind))
    .map((estimate) => ({
      id: estimate.id.trim(),
      label: estimate.label.trim(),
      kind: estimate.kind,
      amountCents: normalizeAmountCents(estimate.amountCents),
      isRoughEstimate: estimate.isRoughEstimate,
    }))
    .filter((estimate) => estimate.id.length > 0 && estimate.label.length > 0);

  const completedStepIds = [...new Set(draft.completedStepIds ?? [])].filter((id) =>
    STEP_IDS.has(id),
  );

  const pausedAtStepId =
    draft.pausedAtStepId && STEP_IDS.has(draft.pausedAtStepId) ? draft.pausedAtStepId : undefined;

  return {
    estimates,
    completedStepIds,
    pausedAtStepId,
    confirmedForSave: draft.confirmedForSave === true,
  };
}

export function upsertFirstBudgetEstimate(
  draft: FirstBudgetDraft,
  estimate: FirstBudgetEstimate,
): FirstBudgetDraft {
  const cleanEstimate = normalizeFirstBudgetDraft({ estimates: [estimate] }).estimates[0];
  if (!cleanEstimate) return normalizeFirstBudgetDraft(draft);

  const current = normalizeFirstBudgetDraft(draft);
  const estimates = current.estimates.some((item) => item.id === cleanEstimate.id)
    ? current.estimates.map((item) => (item.id === cleanEstimate.id ? cleanEstimate : item))
    : [...current.estimates, cleanEstimate];

  return {
    ...current,
    estimates,
    confirmedForSave: false,
  };
}

export function markFirstBudgetStepComplete(
  draft: FirstBudgetDraft,
  stepId: FirstBudgetTutorialStepId,
): FirstBudgetDraft {
  const current = normalizeFirstBudgetDraft(draft);
  if (!STEP_IDS.has(stepId)) return current;

  return {
    ...current,
    completedStepIds: [...new Set([...current.completedStepIds, stepId])],
    pausedAtStepId: undefined,
  };
}

export function pauseFirstBudgetTutorial(
  draft: FirstBudgetDraft,
  stepId: FirstBudgetTutorialStepId,
): FirstBudgetDraft {
  const current = normalizeFirstBudgetDraft(draft);
  return STEP_IDS.has(stepId) ? { ...current, pausedAtStepId: stepId } : current;
}

export function confirmFirstBudgetForSave(draft: FirstBudgetDraft): FirstBudgetDraft {
  return {
    ...normalizeFirstBudgetDraft(draft),
    confirmedForSave: true,
  };
}

export function getNextFirstBudgetStep(draft: FirstBudgetDraft): FirstBudgetTutorialStep {
  const current = normalizeFirstBudgetDraft(draft);
  const pausedStep = FIRST_BUDGET_TUTORIAL_STEPS.find((step) => step.id === current.pausedAtStepId);
  if (pausedStep) return pausedStep;

  return (
    FIRST_BUDGET_TUTORIAL_STEPS.find((step) => !current.completedStepIds.includes(step.id)) ??
    FIRST_BUDGET_TUTORIAL_STEPS[FIRST_BUDGET_TUTORIAL_STEPS.length - 1]
  );
}

export function buildFirstBudgetReview(draft: FirstBudgetDraft): FirstBudgetReview {
  const current = normalizeFirstBudgetDraft(draft);
  const totalIncomeCents = sumByKind(current.estimates, 'income');
  const totalPlannedOutflowCents =
    sumByKind(current.estimates, 'fixed') +
    sumByKind(current.estimates, 'flexible') +
    sumByKind(current.estimates, 'savings');
  const remainingCents = totalIncomeCents - totalPlannedOutflowCents;
  const roughEstimateCount = current.estimates.filter(
    (estimate) => estimate.isRoughEstimate,
  ).length;
  const warnings: string[] = [];

  if (totalIncomeCents === 0) {
    warnings.push('Add at least one income estimate before saving.');
  }

  if (current.estimates.length === 0) {
    warnings.push('Add at least one estimate so the budget is not empty.');
  }

  if (remainingCents < 0) {
    warnings.push(
      'Planned spending is higher than income; revise a flexible category before saving.',
    );
  }

  const canSave = current.confirmedForSave && totalIncomeCents > 0 && remainingCents >= 0;

  return {
    totalIncomeCents,
    totalPlannedOutflowCents,
    remainingCents,
    roughEstimateCount,
    canSave,
    summary: buildReviewSummary(remainingCents, roughEstimateCount),
    warnings,
  };
}

function sumByKind(
  estimates: readonly FirstBudgetEstimate[],
  kind: FirstBudgetCategoryKind,
): number {
  return estimates
    .filter((estimate) => estimate.kind === kind)
    .reduce((total, estimate) => total + estimate.amountCents, 0);
}

function buildReviewSummary(remainingCents: number, roughEstimateCount: number): string {
  const roughCopy =
    roughEstimateCount === 1 ? '1 rough estimate' : `${roughEstimateCount} rough estimates`;

  if (remainingCents > 0) {
    return `Your first budget leaves ${remainingCents} cents unassigned and includes ${roughCopy}.`;
  }

  if (remainingCents === 0) {
    return `Your first budget assigns every cent and includes ${roughCopy}.`;
  }

  return `Your first budget is over income by ${Math.abs(remainingCents)} cents and includes ${roughCopy}.`;
}
