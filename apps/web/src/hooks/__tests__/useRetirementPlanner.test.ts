// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildRetirementIncomeProjection, useRetirementPlanner } from '../useRetirementPlanner';
import type { RetirementParams } from '../../lib/planning';

const { mockUseAccounts } = vi.hoisted(() => ({
  mockUseAccounts: vi.fn(() => ({ accounts: [] })),
}));

vi.mock('../useAccounts', () => ({
  useAccounts: mockUseAccounts,
}));

const baseParams: RetirementParams = {
  currentAge: 65,
  retirementAge: 65,
  planningHorizonAge: 90,
  currentSavingsCents: 100_000_000,
  monthlyContributionCents: 0,
  annualReturnRate: 0,
  annualInflationRate: 0,
  desiredMonthlySpendingCents: 400_000,
  monthlyRetirementIncomeCents: 100_000,
  annualReturnStdDev: 0,
};

describe('buildRetirementIncomeProjection', () => {
  it('projects accumulation with contributions and growth before retirement', () => {
    const projection = buildRetirementIncomeProjection({
      ...baseParams,
      currentAge: 60,
      retirementAge: 62,
      currentSavingsCents: 1_000_000,
      monthlyContributionCents: 100_000,
      annualReturnRate: 0.1,
      desiredMonthlySpendingCents: 0,
      monthlyRetirementIncomeCents: 0,
    });

    expect(projection.points.find((point) => point.age === 61)).toMatchObject({
      phase: 'accumulation',
      contributionCents: 1_200_000,
      growthCents: 100_000,
      endingBalanceCents: 2_300_000,
    });
    expect(projection.points.find((point) => point.age === 62)).toMatchObject({
      phase: 'accumulation',
      endingBalanceCents: 3_730_000,
    });
  });

  it('draws down net retirement spending after Social Security and pension income', () => {
    const projection = buildRetirementIncomeProjection(baseParams);

    expect(projection.points).toHaveLength(26);
    expect(projection.depletionAge).toBeNull();
    expect(projection.lastsThroughHorizon).toBe(true);
    expect(projection.finalBalanceCents).toBe(10_000_000);
    expect(projection.points[1]).toMatchObject({
      phase: 'drawdown',
      targetSpendCents: 4_800_000,
      retirementIncomeCents: 1_200_000,
      withdrawalCents: 3_600_000,
      endingBalanceCents: 96_400_000,
    });
  });

  it('detects the depletion age when withdrawals exhaust savings before age 90', () => {
    const projection = buildRetirementIncomeProjection({
      ...baseParams,
      currentSavingsCents: 5_000_000,
      desiredMonthlySpendingCents: 400_000,
      monthlyRetirementIncomeCents: 0,
    });

    expect(projection.lastsThroughHorizon).toBe(false);
    expect(projection.depletionAge).toBe(67);
    expect(projection.points.find((point) => point.age === 67)).toMatchObject({
      depleted: true,
      endingBalanceCents: 0,
    });
  });

  it('projects through at least age 90 even when the supplied horizon is lower', () => {
    const projection = buildRetirementIncomeProjection({
      ...baseParams,
      planningHorizonAge: 85,
    });

    expect(projection.horizonAge).toBe(90);
    expect(projection.points.at(-1)?.age).toBe(90);
  });
});

describe('useRetirementPlanner', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUseAccounts.mockReturnValue({ accounts: [] });
  });

  it('exposes the income projection and updates Social Security/pension income', () => {
    const { result } = renderHook(() => useRetirementPlanner());

    expect(result.current.incomeProjection.horizonAge).toBe(90);

    act(() => {
      result.current.setRetirementIncome(150_000);
    });

    expect(result.current.params.monthlyRetirementIncomeCents).toBe(150_000);
  });
});
