// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for adaptive starter budget calculations.
 *
 * References: issue #1567
 */

import { describe, expect, it } from 'vitest';
import type { MonthlyCategorySpending } from './budgeting-types';
import {
  acceptAllSuggestions,
  analyseSpendingHistory,
  applyAdjustments,
} from './budgeting-adaptive-starter';

// ---------------------------------------------------------------------------
// analyseSpendingHistory
// ---------------------------------------------------------------------------

describe('analyseSpendingHistory', () => {
  it('returns empty result for no spending data', () => {
    const result = analyseSpendingHistory([], 3);
    expect(result.suggestions).toHaveLength(0);
    expect(result.totalSuggestedCents).toBe(0);
    expect(result.monthsAnalysed).toBe(0);
  });

  it('returns empty result for zero months', () => {
    const spending: MonthlyCategorySpending[] = [
      { categoryId: '1', name: 'Food', month: '2024-01', amountCents: 50_000 },
    ];
    const result = analyseSpendingHistory(spending, 0);
    expect(result.suggestions).toHaveLength(0);
  });

  it('computes average for single category across months', () => {
    const spending: MonthlyCategorySpending[] = [
      { categoryId: '1', name: 'Food', month: '2024-01', amountCents: 40_000 },
      { categoryId: '1', name: 'Food', month: '2024-02', amountCents: 50_000 },
      { categoryId: '1', name: 'Food', month: '2024-03', amountCents: 60_000 },
    ];
    const result = analyseSpendingHistory(spending, 3);

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].suggestedCents).toBe(50_000);
    expect(result.suggestions[0].minCents).toBe(40_000);
    expect(result.suggestions[0].maxCents).toBe(60_000);
    expect(result.suggestions[0].monthsWithData).toBe(3);
    expect(result.monthsAnalysed).toBe(3);
  });

  it('groups multiple categories correctly', () => {
    const spending: MonthlyCategorySpending[] = [
      { categoryId: '1', name: 'Food', month: '2024-01', amountCents: 50_000 },
      { categoryId: '2', name: 'Transport', month: '2024-01', amountCents: 15_000 },
      { categoryId: '1', name: 'Food', month: '2024-02', amountCents: 60_000 },
      { categoryId: '2', name: 'Transport', month: '2024-02', amountCents: 12_000 },
    ];
    const result = analyseSpendingHistory(spending, 3);

    expect(result.suggestions).toHaveLength(2);
    // Sorted by suggested descending: Food first
    expect(result.suggestions[0].name).toBe('Food');
    expect(result.suggestions[0].suggestedCents).toBe(55_000);
    expect(result.suggestions[1].name).toBe('Transport');
    expect(result.suggestions[1].suggestedCents).toBe(13_500);
  });

  it('takes only the most recent N months', () => {
    const spending: MonthlyCategorySpending[] = [
      { categoryId: '1', name: 'Food', month: '2024-01', amountCents: 10_000 },
      { categoryId: '1', name: 'Food', month: '2024-02', amountCents: 20_000 },
      { categoryId: '1', name: 'Food', month: '2024-03', amountCents: 30_000 },
      { categoryId: '1', name: 'Food', month: '2024-04', amountCents: 40_000 },
    ];
    // Only take most recent 2 months
    const result = analyseSpendingHistory(spending, 2);

    expect(result.monthsAnalysed).toBe(2);
    // Recent 2 = 2024-04 (40k) and 2024-03 (30k)
    expect(result.suggestions[0].suggestedCents).toBe(35_000);
  });

  it('sets adjustedCents equal to suggestedCents by default', () => {
    const spending: MonthlyCategorySpending[] = [
      { categoryId: '1', name: 'Food', month: '2024-01', amountCents: 50_000 },
    ];
    const result = analyseSpendingHistory(spending, 3);

    expect(result.suggestions[0].adjustedCents).toBe(result.suggestions[0].suggestedCents);
    expect(result.totalAdjustedCents).toBe(result.totalSuggestedCents);
  });

  it('computes total suggested correctly', () => {
    const spending: MonthlyCategorySpending[] = [
      { categoryId: '1', name: 'Food', month: '2024-01', amountCents: 50_000 },
      { categoryId: '2', name: 'Transport', month: '2024-01', amountCents: 20_000 },
      { categoryId: '3', name: 'Rent', month: '2024-01', amountCents: 150_000 },
    ];
    const result = analyseSpendingHistory(spending, 3);

    expect(result.totalSuggestedCents).toBe(220_000);
  });

  it('handles category with single month of data among many months', () => {
    const spending: MonthlyCategorySpending[] = [
      { categoryId: '1', name: 'Food', month: '2024-01', amountCents: 50_000 },
      { categoryId: '1', name: 'Food', month: '2024-02', amountCents: 60_000 },
      { categoryId: '1', name: 'Food', month: '2024-03', amountCents: 55_000 },
      { categoryId: '2', name: 'One-time', month: '2024-03', amountCents: 200_000 },
    ];
    const result = analyseSpendingHistory(spending, 3);

    const oneTime = result.suggestions.find((s) => s.categoryId === '2');
    expect(oneTime?.monthsWithData).toBe(1);
    expect(oneTime?.suggestedCents).toBe(200_000);
  });
});

// ---------------------------------------------------------------------------
// applyAdjustments
// ---------------------------------------------------------------------------

describe('applyAdjustments', () => {
  it('overrides adjusted amounts for specified categories', () => {
    const original = analyseSpendingHistory(
      [
        { categoryId: '1', name: 'Food', month: '2024-01', amountCents: 50_000 },
        { categoryId: '2', name: 'Transport', month: '2024-01', amountCents: 20_000 },
      ],
      3,
    );

    const adjustments = new Map([['1', 45_000]]);
    const result = applyAdjustments(original, adjustments);

    expect(result.suggestions[0].adjustedCents).toBe(45_000);
    expect(result.suggestions[0].suggestedCents).toBe(50_000); // unchanged
    expect(result.suggestions[1].adjustedCents).toBe(20_000); // unchanged
    expect(result.totalAdjustedCents).toBe(65_000);
  });

  it('does not modify the original result', () => {
    const original = analyseSpendingHistory(
      [{ categoryId: '1', name: 'Food', month: '2024-01', amountCents: 50_000 }],
      3,
    );

    const adjustments = new Map([['1', 30_000]]);
    applyAdjustments(original, adjustments);

    // Original should be unchanged
    expect(original.suggestions[0].adjustedCents).toBe(50_000);
  });

  it('handles empty adjustments map', () => {
    const original = analyseSpendingHistory(
      [{ categoryId: '1', name: 'Food', month: '2024-01', amountCents: 50_000 }],
      3,
    );

    const result = applyAdjustments(original, new Map());
    expect(result.totalAdjustedCents).toBe(original.totalSuggestedCents);
  });
});

// ---------------------------------------------------------------------------
// acceptAllSuggestions
// ---------------------------------------------------------------------------

describe('acceptAllSuggestions', () => {
  it('resets all adjusted amounts to suggested', () => {
    const original = analyseSpendingHistory(
      [
        { categoryId: '1', name: 'Food', month: '2024-01', amountCents: 50_000 },
        { categoryId: '2', name: 'Transport', month: '2024-01', amountCents: 20_000 },
      ],
      3,
    );

    // First, adjust
    const adjusted = applyAdjustments(original, new Map([['1', 30_000]]));
    expect(adjusted.suggestions[0].adjustedCents).toBe(30_000);

    // Then accept all
    const accepted = acceptAllSuggestions(adjusted);
    expect(accepted.suggestions[0].adjustedCents).toBe(50_000);
    expect(accepted.suggestions[1].adjustedCents).toBe(20_000);
    expect(accepted.totalAdjustedCents).toBe(accepted.totalSuggestedCents);
  });
});
