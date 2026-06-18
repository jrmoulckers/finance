// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { calculateDeFiTotals, upsertManualDeFiPosition } from './defi-positions';
import type { DeFiPosition } from './defi-positions';

const base: DeFiPosition = {
  id: 'stake',
  type: 'staking',
  chain: 'ethereum',
  protocol: 'Lido',
  label: 'stETH',
  principalValueCents: 100000,
  currency: 'USD',
  lockStatus: 'liquid',
  apyBps: 320,
  rewardTokens: [],
  valuationAsOf: '2026-01-01T00:00:00.000Z',
};

describe('DeFi manual positions', () => {
  it('models staking, LP, lending/borrow, vaults, farms, rewards, and locked totals', () => {
    const totals = calculateDeFiTotals(
      [
        base,
        {
          ...base,
          id: 'lp',
          type: 'liquidity-pool',
          protocol: 'Uniswap',
          principalValueCents: 200000,
          lockStatus: 'locked',
          rewardTokens: [{ token: 'UNI', quantity: 1, valueCents: 700 }],
        },
        {
          ...base,
          id: 'lend',
          type: 'lending',
          protocol: 'Aave',
          principalValueCents: 50000,
          lockStatus: 'unbonding',
        },
        {
          ...base,
          id: 'vault',
          type: 'vault',
          protocol: 'Yearn',
          principalValueCents: 25000,
          lockStatus: 'liquid',
        },
        {
          ...base,
          id: 'farm',
          type: 'farm',
          protocol: 'Curve',
          principalValueCents: 30000,
          lockStatus: 'withdrawal-pending',
        },
      ],
      { excludeLocked: true, excludeUnbonding: true },
    );

    expect(totals.totalValueCents).toBe(405700);
    expect(totals.availableValueCents).toBe(125000);
    expect(totals.lockedValueCents).toBe(280700);
    expect(totals.rewardsValueCents).toBe(700);
  });

  it('upserts manual updates deterministically', () => {
    const positions = upsertManualDeFiPosition([base], { ...base, principalValueCents: 110000 });

    expect(positions).toHaveLength(1);
    expect(positions[0]?.principalValueCents).toBe(110000);
  });
});
