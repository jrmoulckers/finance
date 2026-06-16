// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { calculateFirePlan, compareFirePlans, getFirePlanningWarnings } from './fire-planning';

const baseInput = {
  currentInvestedAssetsCents: 250_000_00,
  annualExpensesCents: 40_000_00,
  annualContributionsCents: 50_000_00,
  annualIncomeCents: 120_000_00,
  currentAge: 35,
  targetRetirementAge: 60,
  expectedRealReturnPercent: 7,
  withdrawalRatePercent: 4,
};

describe('calculateFirePlan', () => {
  it('calculates standard FIRE and Coast-FIRE targets', () => {
    const result = calculateFirePlan(baseInput);

    expect(result.fiNumberCents).toBe(1_000_000_00);
    expect(result.fiPercent).toBe(25);
    expect(result.coastFITargetCents).toBeLessThan(result.fiNumberCents);
    expect(result.yearsToFI).toBeGreaterThan(0);
    expect(result.canReachFIByTargetAge).toBe(true);
  });

  it('clamps negative invested assets and emits a guardrail warning', () => {
    const result = calculateFirePlan({ ...baseInput, currentInvestedAssetsCents: -5_000_00 });

    expect(result.fiPercent).toBe(0);
    expect(result.warnings).toContain('Current invested assets are negative.');
  });

  it('handles zero expenses without crashing', () => {
    const result = calculateFirePlan({ ...baseInput, annualExpensesCents: 0 });

    expect(result.fiNumberCents).toBe(0);
    expect(result.warnings).toContain('Annual expenses must be above zero.');
  });
});

describe('compareFirePlans', () => {
  it('returns scenario cards with improved savings reducing years to FI', () => {
    const [current, higherSavings] = compareFirePlans(baseInput, [
      { id: 'current', label: 'Current' },
      { id: 'save-more', label: 'Save more', annualContributionsCents: 75_000_00 },
    ]);

    expect(higherSavings.yearsToFI).toBeLessThan(current.yearsToFI);
  });
});

describe('getFirePlanningWarnings', () => {
  it('flags unrealistic assumptions', () => {
    expect(
      getFirePlanningWarnings({
        ...baseInput,
        expectedRealReturnPercent: 25,
        withdrawalRatePercent: 9,
        targetRetirementAge: 30,
      }),
    ).toEqual([
      'Withdrawal rate is unusually high.',
      'Expected real return is outside typical long-term planning bounds.',
      'Target retirement age is before current age.',
    ]);
  });
});
