// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for guided first-budget tutorial model.
 *
 * References: issue #2284
 */

import { describe, expect, it } from 'vitest';
import {
  buildFirstBudgetReview,
  confirmFirstBudgetForSave,
  EMPTY_FIRST_BUDGET_DRAFT,
  FIRST_BUDGET_TUTORIAL_STEPS,
  getNextFirstBudgetStep,
  markFirstBudgetStepComplete,
  pauseFirstBudgetTutorial,
  upsertFirstBudgetEstimate,
} from './first-budget-tutorial';

describe('first budget tutorial model', () => {
  it('defines the requested tutorial sequence with educational copy', () => {
    expect(FIRST_BUDGET_TUTORIAL_STEPS.map((step) => step.id)).toEqual([
      'income',
      'fixed-expenses',
      'flexible-spending',
      'savings',
      'review',
    ]);
    expect(FIRST_BUDGET_TUTORIAL_STEPS.every((step) => step.plainLanguageGoal.length > 20)).toBe(
      true,
    );
    expect(FIRST_BUDGET_TUTORIAL_STEPS.every((step) => step.example.includes('Example'))).toBe(
      true,
    );
  });

  it('upserts estimates and clears prior save confirmation after revisions', () => {
    const draft = confirmFirstBudgetForSave(
      upsertFirstBudgetEstimate(EMPTY_FIRST_BUDGET_DRAFT, {
        id: 'income-paycheck',
        label: 'Paycheck',
        kind: 'income',
        amountCents: 200_000,
        isRoughEstimate: true,
      }),
    );

    const revised = upsertFirstBudgetEstimate(draft, {
      id: 'income-paycheck',
      label: 'Paycheck',
      kind: 'income',
      amountCents: 220_000,
      isRoughEstimate: false,
    });

    expect(revised.estimates).toHaveLength(1);
    expect(revised.estimates[0].amountCents).toBe(220_000);
    expect(revised.confirmedForSave).toBe(false);
  });

  it('resumes paused step before moving to the next incomplete step', () => {
    const completedIncome = markFirstBudgetStepComplete(EMPTY_FIRST_BUDGET_DRAFT, 'income');
    const paused = pauseFirstBudgetTutorial(completedIncome, 'savings');

    expect(getNextFirstBudgetStep(paused).id).toBe('savings');
    expect(getNextFirstBudgetStep(completedIncome).id).toBe('fixed-expenses');
  });

  it('requires explicit confirmation and non-negative remaining balance before save', () => {
    const draft = [
      { id: 'income', label: 'Income', kind: 'income' as const, amountCents: 250_000 },
      { id: 'rent', label: 'Rent', kind: 'fixed' as const, amountCents: 120_000 },
      { id: 'food', label: 'Food', kind: 'flexible' as const, amountCents: 45_000 },
      { id: 'buffer', label: 'Buffer', kind: 'savings' as const, amountCents: 20_000 },
    ].reduce(
      (current, estimate) =>
        upsertFirstBudgetEstimate(current, {
          ...estimate,
          isRoughEstimate: estimate.kind !== 'income',
        }),
      EMPTY_FIRST_BUDGET_DRAFT,
    );

    expect(buildFirstBudgetReview(draft).canSave).toBe(false);

    const confirmedReview = buildFirstBudgetReview(confirmFirstBudgetForSave(draft));
    expect(confirmedReview.canSave).toBe(true);
    expect(confirmedReview.remainingCents).toBe(65_000);
    expect(confirmedReview.roughEstimateCount).toBe(3);
  });

  it('warns when planned spending is higher than income', () => {
    const draft = confirmFirstBudgetForSave(
      upsertFirstBudgetEstimate(
        upsertFirstBudgetEstimate(EMPTY_FIRST_BUDGET_DRAFT, {
          id: 'income',
          label: 'Income',
          kind: 'income',
          amountCents: 100_000,
          isRoughEstimate: false,
        }),
        {
          id: 'rent',
          label: 'Rent',
          kind: 'fixed',
          amountCents: 120_000,
          isRoughEstimate: true,
        },
      ),
    );

    const review = buildFirstBudgetReview(draft);
    expect(review.canSave).toBe(false);
    expect(review.warnings).toContain(
      'Planned spending is higher than income; revise a flexible category before saving.',
    );
  });
});
