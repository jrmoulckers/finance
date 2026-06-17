// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildSavingsRateDashboardSummary } from './savings-rate-summary';

describe('savings rate dashboard summary', () => {
  it('returns current, prior, and trailing three month savings rates', () => {
    const summary = buildSavingsRateDashboardSummary(
      [
        { month: '2026-01', incomeCents: 5000_00, expenseCents: 3000_00 },
        { month: '2026-02', incomeCents: 5000_00, expenseCents: 4000_00 },
        { month: '2026-03', incomeCents: 6000_00, expenseCents: 3000_00 },
      ],
      '2026-03',
    );

    expect(summary.current?.savingsRatePercent).toBe(50);
    expect(summary.prior?.savingsCents).toBe(1000_00);
    expect(summary.trailingThreeMonth?.incomeCents).toBe(16000_00);
    expect(summary.trailingThreeMonth?.savingsRatePercent).toBe(37.5);
  });
});
