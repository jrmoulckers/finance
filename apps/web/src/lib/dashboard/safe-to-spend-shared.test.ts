// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { calculateSharedSafeToSpend } from './safe-to-spend-shared';

describe('shared safe to spend policy', () => {
  it('reserves critical bills and pinned categories through payday', () => {
    expect(
      calculateSharedSafeToSpend({
        expectedIncomeCents: 3000_00,
        plannedSavingsCents: 500_00,
        discretionarySpentCents: 200_00,
        today: '2026-04-10',
        periodEnd: '2026-04-30',
        nextPayday: '2026-04-14',
        lastUpdatedAt: '2026-04-10T09:00:00Z',
        bills: [
          { id: 'rent', amountCents: 1200_00, dueDate: '2026-04-20', paid: false, critical: true },
          { id: 'streaming', amountCents: 20_00, dueDate: '2026-04-20', paid: false, critical: false },
        ],
        pinnedCategories: [{ id: 'groceries', budgetCents: 400_00, spentCents: 125_00, pinned: true }],
      }),
    ).toEqual({
      safeToSpendCents: 825_00,
      remainingCriticalBillsCents: 1200_00,
      pinnedCategoryReserveCents: 275_00,
      dailyAllowanceUntilPaydayCents: 165_00,
      staleData: false,
      warnings: [],
    });
  });

  it('flags stale data and overspending', () => {
    expect(
      calculateSharedSafeToSpend({
        expectedIncomeCents: 100_00,
        plannedSavingsCents: 200_00,
        discretionarySpentCents: 0,
        today: '2026-04-10',
        periodEnd: '2026-04-30',
        nextPayday: '2026-04-10',
        lastUpdatedAt: '2026-04-01T00:00:00Z',
        bills: [],
        pinnedCategories: [],
      }).warnings,
    ).toEqual(['overspent', 'stale-data']);
  });
});
