// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { calculateSharedFirePlan, calculateSharedFiNumber, calculateSharedYearsToFi } from './shared-fire';

describe('shared FIRE logic', () => {
  it('calculates FI target, coast FI, savings rate, and years to FI using cents', () => {
    const plan = calculateSharedFirePlan({
      currentPortfolioCents: 250000_00,
      annualExpensesCents: 40000_00,
      annualSavingsCents: 50000_00,
      annualIncomeCents: 100000_00,
      expectedReturnPercent: 7,
      currentAge: 35,
      targetRetirementAge: 55,
      withdrawalRatePercent: 4,
    });

    expect(plan.fiNumberCents).toBe(1000000_00);
    expect(plan.fiProgressPercent).toBe(25);
    expect(plan.savingsRatePercent).toBe(50);
    expect(plan.coastFiCents).toBeLessThan(300000_00);
    expect(plan.yearsToFi).toBeGreaterThan(5);
    expect(plan.swrSensitivity).toHaveLength(3);
  });

  it('returns max years and warnings when FI is unreachable without savings', () => {
    expect(calculateSharedYearsToFi(0, 0, 0, 1000000_00)).toBe(100);
    expect(
      calculateSharedFirePlan({
        currentPortfolioCents: 0,
        annualExpensesCents: 40000_00,
        annualSavingsCents: 0,
        annualIncomeCents: 0,
        expectedReturnPercent: 0,
        currentAge: 40,
        targetRetirementAge: 65,
        withdrawalRatePercent: 6,
      }).warnings,
    ).toEqual(['high-withdrawal-rate', 'no-positive-savings']);
  });

  it('uses withdrawal-rate math without floating cents leakage', () => {
    expect(calculateSharedFiNumber(40000_00, 3.5)).toBe(114285714);
  });
});
