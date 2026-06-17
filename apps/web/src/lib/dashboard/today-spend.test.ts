// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { calculateTodaySpendSummary } from './today-spend';

describe('today spend shared widget math', () => {
  it('reserves bills, savings, pinned categories, and spend before fun money', () => {
    expect(
      calculateTodaySpendSummary({
        expectedIncomeCents: 4000_00,
        spentTodayCents: 25_00,
        remainingBillsCents: 1200_00,
        plannedSavingsCents: 800_00,
        pinnedCategoryBudgetsCents: [450_00, 125_00],
      }),
    ).toEqual({
      todaySpendCents: 25_00,
      reservedCents: 2575_00,
      funMoneyCents: 1400_00,
      canSpendToday: true,
    });
  });

  it('normalizes invalid inputs without increasing safe spending', () => {
    expect(
      calculateTodaySpendSummary({
        expectedIncomeCents: Number.NaN,
        spentTodayCents: -5,
        remainingBillsCents: 100_00,
        plannedSavingsCents: 0,
        pinnedCategoryBudgetsCents: [-1],
      }).funMoneyCents,
    ).toBe(-100_00);
  });
});
