// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  BUSINESS_EXPENSE_TAG,
  buildBusinessExpenseUpdate,
  classifyBusinessExpense,
  getBusinessExpenseDefaults,
} from '../expenseRules';

const baseTransaction = {
  id: 'txn-1',
  date: '2024-06-10',
  payee: 'Downtown Restaurant',
  note: 'Client lunch',
  amountCents: -10_000,
  type: 'EXPENSE' as const,
  tags: [] as string[],
  customFields: null,
  categoryName: 'Restaurants',
};

describe('business expense rules', () => {
  it('infers meals and applies the default 50% deduction rule', () => {
    const defaults = getBusinessExpenseDefaults(baseTransaction);

    expect(defaults.category).toBe('meals');
    expect(defaults.deductiblePercent).toBe(50);
  });

  it('builds transaction updates and classifies deductible expenses', () => {
    const update = buildBusinessExpenseUpdate(baseTransaction, {
      enabled: true,
      category: 'meals',
      businessUsePercent: 80,
      note: 'Lunch with client after onsite workshop',
    });

    expect(update.tags).toContain(BUSINESS_EXPENSE_TAG);

    const classified = classifyBusinessExpense({
      ...baseTransaction,
      tags: update.tags,
      customFields: update.customFields,
    });

    expect(classified).not.toBeNull();
    expect(classified?.category).toBe('meals');
    expect(classified?.deductibleAmountCents).toBe(4_000);
    expect(classified?.note).toContain('onsite workshop');
  });
});
