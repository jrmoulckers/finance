// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { generateRecommendations, MIN_DAYS_FOR_SAVINGS_RATE_COPY } from './useInsights';

const flat = { direction: 'flat', changePercent: 0 } as Parameters<
  typeof generateRecommendations
>[1];

const ids = (daysElapsed: number, savingsRate: number) =>
  generateRecommendations([], flat, savingsRate, 1, 20, daysElapsed).map((rec) => rec.id);

describe('generateRecommendations savings-rate copy', () => {
  it('suppresses the high savings-rate message early in the period', () => {
    expect(ids(2, 96)).not.toContain('high-savings-rate');
  });

  it('suppresses the low savings-rate warning early in the period', () => {
    expect(ids(2, 3)).not.toContain('low-savings-rate');
  });

  it('shows the high savings-rate message once enough of the period has elapsed', () => {
    expect(ids(MIN_DAYS_FOR_SAVINGS_RATE_COPY, 96)).toContain('high-savings-rate');
  });

  it('shows the low savings-rate warning once enough of the period has elapsed', () => {
    expect(ids(MIN_DAYS_FOR_SAVINGS_RATE_COPY, 3)).toContain('low-savings-rate');
  });
});
