// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { MonthAheadBufferConfig } from '../advanced-types';
import {
  calculateBufferProgress,
  estimateBufferTarget,
  recommendedContribution,
} from '../month-ahead-buffer';

// ---------------------------------------------------------------------------
// calculateBufferProgress
// ---------------------------------------------------------------------------

describe('calculateBufferProgress', () => {
  it('calculates progress toward buffer goal', () => {
    const config: MonthAheadBufferConfig = {
      targetCents: 400_000,
      currentCents: 100_000,
      monthlyContributionCents: 50_000,
    };

    const result = calculateBufferProgress(config, '2025-06-01');

    expect(result.targetCents).toBe(400_000);
    expect(result.currentCents).toBe(100_000);
    expect(result.remainingCents).toBe(300_000);
    expect(result.progressPercent).toBe(25);
    expect(result.isComplete).toBe(false);
    expect(result.estimatedMonthsToCompletion).toBe(6); // 300k / 50k
    expect(result.projectedCompletionDate).toBe('2025-12-01');
  });

  it('reports complete when fully funded', () => {
    const config: MonthAheadBufferConfig = {
      targetCents: 400_000,
      currentCents: 400_000,
      monthlyContributionCents: 50_000,
    };

    const result = calculateBufferProgress(config, '2025-06-01');

    expect(result.isComplete).toBe(true);
    expect(result.remainingCents).toBe(0);
    expect(result.progressPercent).toBe(100);
    expect(result.estimatedMonthsToCompletion).toBeNull();
    expect(result.projectedCompletionDate).toBeNull();
  });

  it('reports complete when over-funded', () => {
    const config: MonthAheadBufferConfig = {
      targetCents: 400_000,
      currentCents: 500_000,
      monthlyContributionCents: 0,
    };

    const result = calculateBufferProgress(config);

    expect(result.isComplete).toBe(true);
    expect(result.remainingCents).toBe(0);
    expect(result.progressPercent).toBe(100);
  });

  it('handles zero target', () => {
    const config: MonthAheadBufferConfig = {
      targetCents: 0,
      currentCents: 0,
      monthlyContributionCents: 0,
    };

    const result = calculateBufferProgress(config, '2025-06-01');

    expect(result.isComplete).toBe(true);
    expect(result.progressPercent).toBe(100);
  });

  it('handles zero contribution (no projected date)', () => {
    const config: MonthAheadBufferConfig = {
      targetCents: 400_000,
      currentCents: 100_000,
      monthlyContributionCents: 0,
    };

    const result = calculateBufferProgress(config, '2025-06-01');

    expect(result.isComplete).toBe(false);
    expect(result.estimatedMonthsToCompletion).toBeNull();
    expect(result.projectedCompletionDate).toBeNull();
  });

  it('handles zero current savings', () => {
    const config: MonthAheadBufferConfig = {
      targetCents: 300_000,
      currentCents: 0,
      monthlyContributionCents: 100_000,
    };

    const result = calculateBufferProgress(config, '2025-01-01');

    expect(result.progressPercent).toBe(0);
    expect(result.estimatedMonthsToCompletion).toBe(3);
    expect(result.projectedCompletionDate).toBe('2025-04-01');
  });
});

// ---------------------------------------------------------------------------
// estimateBufferTarget
// ---------------------------------------------------------------------------

describe('estimateBufferTarget', () => {
  it('averages monthly expenses', () => {
    expect(estimateBufferTarget([300_000, 400_000, 500_000])).toBe(400_000);
  });

  it('returns 0 for empty array', () => {
    expect(estimateBufferTarget([])).toBe(0);
  });

  it('handles single month', () => {
    expect(estimateBufferTarget([250_000])).toBe(250_000);
  });

  it('rounds to nearest cent', () => {
    // (100 + 200 + 300) / 3 = 200 exactly
    expect(estimateBufferTarget([100, 200, 300])).toBe(200);
  });

  it('handles large values', () => {
    expect(estimateBufferTarget([1_000_000_00, 2_000_000_00])).toBe(1_500_000_00);
  });
});

// ---------------------------------------------------------------------------
// recommendedContribution
// ---------------------------------------------------------------------------

describe('recommendedContribution', () => {
  it('divides remaining by target months', () => {
    expect(recommendedContribution(120_000, 6)).toBe(20_000);
  });

  it('returns full remaining when target months is zero', () => {
    expect(recommendedContribution(50_000, 0)).toBe(50_000);
  });

  it('returns full remaining when target months is negative', () => {
    expect(recommendedContribution(50_000, -3)).toBe(50_000);
  });

  it('returns 0 when already funded', () => {
    expect(recommendedContribution(0, 12)).toBe(0);
  });

  it('returns 0 when negative remaining', () => {
    expect(recommendedContribution(-100, 12)).toBe(0);
  });

  it('rounds up to ensure goal is met', () => {
    // 10000 / 3 = 3333.33... → ceil to 3334
    expect(recommendedContribution(10_000, 3)).toBe(3_334);
  });
});
