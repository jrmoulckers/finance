// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { confirmFirstBudgetForSave, upsertFirstBudgetEstimate } from '../../onboarding/first-budget-tutorial';
import { buildFirstBudgetRollbackPlan, previewFirstBudgetRecords } from '../first-budget-draft-records';

function confirmedDraft() {
  const empty = { estimates: [], completedStepIds: [], confirmedForSave: false };
  return confirmFirstBudgetForSave(
    upsertFirstBudgetEstimate(
      upsertFirstBudgetEstimate(
        upsertFirstBudgetEstimate(empty, {
          id: 'income',
          label: 'Paycheck',
          kind: 'income',
          amountCents: 300_000,
          isRoughEstimate: false,
        }),
        { id: 'rent', label: 'Rent', kind: 'fixed', amountCents: 120_000, isRoughEstimate: false },
      ),
      { id: 'groceries', label: 'Groceries', kind: 'flexible', amountCents: 60_000, isRoughEstimate: true },
    ),
  );
}

describe('previewFirstBudgetRecords', () => {
  it('maps confirmed tutorial estimates to category and budget records', () => {
    const preview = previewFirstBudgetRecords(confirmedDraft(), {
      householdId: 'household-1',
      startDate: '2025-06-01',
      currency: 'cad',
    });

    expect(preview.canCreate).toBe(true);
    expect(preview.categories).toHaveLength(3);
    expect(preview.categories[0]).toMatchObject({ name: 'Paycheck', isIncome: true });
    expect(preview.budgets.map((budget) => budget.name)).toEqual(['Rent', 'Groceries']);
    expect(preview.budgets[0]).toMatchObject({ amountCents: 120_000, currency: 'CAD' });
  });

  it('prevents duplicates and supplies rollback order', () => {
    const preview = previewFirstBudgetRecords(confirmedDraft(), {
      householdId: 'household-1',
      startDate: '2025-06-01',
      existingCategoryNames: ['rent'],
    });
    const rollback = buildFirstBudgetRollbackPlan(preview);

    expect(preview.canCreate).toBe(false);
    expect(preview.warnings).toContain('Skipping duplicate category: Rent.');
    expect(rollback.budgetClientIds[0]).toBe('first-budget-budget:groceries');
    expect(rollback.categoryClientIds[0]).toBe('first-budget-category:groceries');
  });
});
