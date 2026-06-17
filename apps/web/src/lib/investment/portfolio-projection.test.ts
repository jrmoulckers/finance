// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { projectCompoundPortfolio, summarizeEtfRollups } from './portfolio-projection';

describe('compound portfolio projection shared logic', () => {
  it('separates contribution and market return in each projection point', () => {
    const points = projectCompoundPortfolio(10000_00, 500_00, 12, 2);
    expect(points[0]).toEqual({
      month: 1,
      endingValueCents: 10600_00,
      cumulativeContributionCents: 500_00,
      cumulativeGrowthCents: 100_00,
    });
    expect(points[1].cumulativeContributionCents).toBe(1000_00);
    expect(points[1].cumulativeGrowthCents).toBeGreaterThan(200_00);
  });

  it('rolls ETF holdings into uppercase allocation summaries', () => {
    expect(
      summarizeEtfRollups([
        { symbol: 'vti', marketValueCents: 7500_00, contributionCents: 7000_00 },
        { symbol: 'vxus', marketValueCents: 2500_00, contributionCents: 2600_00 },
      ]),
    ).toEqual([
      { symbol: 'VTI', marketValueCents: 7500_00, contributionCents: 7000_00, gainCents: 500_00, allocationPercent: 75 },
      { symbol: 'VXUS', marketValueCents: 2500_00, contributionCents: 2600_00, gainCents: -100_00, allocationPercent: 25 },
    ]);
  });
});
