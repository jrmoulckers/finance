// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildDefiPortfolioPresentation } from './defi-position-presentation';

describe('buildDefiPortfolioPresentation', () => {
  it('separates DeFi exposure buckets and applies net-worth inclusion rules', () => {
    const model = buildDefiPortfolioPresentation({
      staleAfterDate: '2025-05-01',
      positions: [
        { id: 'eth', protocol: 'Wallet', assetSymbol: 'ETH', kind: 'SPOT', quantity: 1, valueCents: 300_000, valuationAsOf: '2025-05-10' },
        { id: 'stake', protocol: 'Lido', assetSymbol: 'stETH', kind: 'LOCKED', quantity: 2, valueCents: 600_000, lockUntil: '2025-12-01', valuationAsOf: '2025-04-01' },
        { id: 'reward', protocol: 'Aave', assetSymbol: 'AAVE', kind: 'PENDING_REWARD', quantity: 3, valueCents: 30_000, apyPercent: 4.2, valuationAsOf: '2025-05-10' },
        { id: 'borrow', protocol: 'Aave', assetSymbol: 'USDC', kind: 'BORROW', quantity: 1000, valueCents: 100_000, valuationAsOf: '2025-05-10' },
      ],
    });

    expect(model.spotHoldings).toHaveLength(1);
    expect(model.lockedPositions[0]).toMatchObject({ label: 'Locked contract position', valuationStatus: 'STALE' });
    expect(model.pendingRewards[0].netWorthContributionCents).toBe(0);
    expect(model.borrowExposure[0].netWorthContributionCents).toBe(-100_000);
    expect(model.netWorthContributionCents).toBe(800_000);
    expect(model.inclusionRulesCopy).toContain('pending rewards are excluded');
    expect(model.lockedPositions[0].accessibilityText).toContain('locked until 2025-12-01');
  });
});
