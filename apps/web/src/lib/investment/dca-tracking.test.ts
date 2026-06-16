// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { analyzeDCAPlan, analyzeDCAPlans } from './dca-tracking';

const plan = {
  id: 'vti-monthly',
  symbol: 'VTI',
  cadence: 'MONTHLY' as const,
  targetAmountCents: 500_00,
  startDate: '2025-01-01',
};

const lots = [
  { symbol: 'VTI', purchaseDate: '2025-01-03', shares: 2, totalCostCents: 400_00 },
  { symbol: 'VTI', purchaseDate: '2025-01-20', shares: 0.5, totalCostCents: 100_00 },
  { symbol: 'VTI', purchaseDate: '2025-03-02', shares: 2, totalCostCents: 600_00 },
  { symbol: 'VXUS', purchaseDate: '2025-01-03', shares: 3, totalCostCents: 300_00 },
];

describe('analyzeDCAPlan', () => {
  it('matches monthly lots and computes completed, missed, and partial progress', () => {
    const analysis = analyzeDCAPlan(plan, lots, '2025-03-15', 300_00);

    expect(analysis.periods[0]).toMatchObject({
      periodStart: '2025-01-01',
      contributedCents: 500_00,
      status: 'COMPLETED',
    });
    expect(analysis.periods[1]?.status).toBe('MISSED');
    expect(analysis.periods[2]?.status).toBe('COMPLETED');
    expect(analysis.totalContributedCents).toBe(1_100_00);
    expect(analysis.totalShares).toBe(4.5);
    expect(analysis.averagePurchasePriceCents).toBe(24_444);
    expect(analysis.currentValueCents).toBe(1_350_00);
    expect(analysis.gainLossCents).toBe(250_00);
  });

  it('supports target amount changes and paused plans', () => {
    const analysis = analyzeDCAPlan(
      {
        ...plan,
        pausedDate: '2025-03-01',
        amountOverrides: [{ effectiveDate: '2025-02-01', targetAmountCents: 750_00 }],
      },
      lots,
      '2025-03-15',
    );

    expect(analysis.periods[1]?.targetAmountCents).toBe(750_00);
    expect(analysis.periods[2]?.status).toBe('PAUSED');
    expect(analysis.nextContributionDate).toBe(null);
  });

  it('creates upcoming reminders without brokerage connectivity', () => {
    const analysis = analyzeDCAPlan(plan, [], '2025-01-15');

    expect(analysis.periods.at(-1)?.status).toBe('UPCOMING');
    expect(analysis.nextContributionDate).toBe('2025-02-01');
  });
});

describe('analyzeDCAPlans', () => {
  it('uses symbol-keyed current prices', () => {
    const [analysis] = analyzeDCAPlans([plan], lots, '2025-01-15', new Map([['VTI', 250_00]]));

    expect(analysis.currentValueCents).toBe(500_00);
  });
});
