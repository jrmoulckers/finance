// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildNetWorthHistory,
  calculateCurrentNetWorthCents,
  projectNetWorth,
} from './net-worth-projection';

describe('net worth projection shared logic', () => {
  it('aggregates asset and liability balances as current net worth', () => {
    expect(
      calculateCurrentNetWorthCents([
        { id: 'checking', kind: 'asset', balanceCents: 5000_00 },
        { id: 'loan', kind: 'liability', balanceCents: 1200_00 },
      ]),
    ).toBe(3800_00);
  });

  it('builds a sorted monthly history from contribution paced transactions', () => {
    expect(
      buildNetWorthHistory(1000_00, [
        { accountId: 'a', postedDate: '2026-02-14', amountCents: 200_00 },
        { accountId: 'a', postedDate: '2026-01-01', amountCents: 100_00 },
        { accountId: 'a', postedDate: '2026-02-20', amountCents: -50_00 },
      ]),
    ).toEqual([
      { month: '2026-01', netWorthCents: 1100_00 },
      { month: '2026-02', netWorthCents: 1250_00 },
    ]);
  });

  it('forecasts monthly contributions and growth separately for chart renderers', () => {
    const forecast = projectNetWorth(10000_00, 1000_00, 12, 2, '2026-01');
    expect(forecast[0]).toEqual({
      month: '2026-01',
      netWorthCents: 11100_00,
      contributionCents: 1000_00,
      projectedGrowthCents: 100_00,
    });
    expect(forecast[1].netWorthCents).toBeGreaterThan(forecast[0].netWorthCents);
  });
});
