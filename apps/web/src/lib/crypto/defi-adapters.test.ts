// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { FixtureDeFiProtocolProvider, evaluateProviderState } from './defi-adapters';
import type { ProtocolPositionFixture } from './defi-adapters';

const fixture: ProtocolPositionFixture = {
  position: {
    id: 'uni',
    type: 'liquidity-pool',
    chain: 'ethereum',
    protocol: 'Uniswap',
    label: 'ETH/USDC',
    principalValueCents: 100000,
    currency: 'USD',
    lockStatus: 'liquid',
    rewardTokens: [{ token: 'UNI', quantity: 2, valueCents: 1400 }],
    valuationAsOf: '2026-01-01T00:00:00.000Z',
  },
  valuation: { source: 'fixture', asOf: '2026-01-01T00:00:00.000Z', state: 'fresh' },
};

describe('DeFi protocol adapters', () => {
  it('provides fixtures for Uniswap-like, Aave-like, and staking adapters', async () => {
    const provider = new FixtureDeFiProtocolProvider([
      fixture,
      {
        ...fixture,
        position: { ...fixture.position, id: 'aave', type: 'lending', protocol: 'Aave' },
      },
      {
        ...fixture,
        position: { ...fixture.position, id: 'stake', type: 'staking', protocol: 'Lido' },
      },
    ]);

    await expect(provider.listPositions('wallet')).resolves.toHaveLength(3);
    await expect(provider.getRewardBalances('uni')).resolves.toEqual([
      expect.objectContaining({ token: 'UNI' }),
    ]);
    expect(provider.supportedProtocols).toEqual(['Aave', 'Lido', 'Uniswap']);
  });

  it('evaluates stale and failure semantics', () => {
    expect(
      evaluateProviderState(
        { source: 'x', asOf: '2026-01-01T00:00:00.000Z', state: 'fresh' },
        '2026-01-01T00:01:00.000Z',
        120000,
      ),
    ).toBe('fresh');
    expect(
      evaluateProviderState(
        { source: 'x', asOf: '2026-01-01T00:00:00.000Z', state: 'fresh' },
        '2026-01-01T00:10:00.000Z',
        120000,
      ),
    ).toBe('stale');
    expect(
      evaluateProviderState(
        { source: 'x', asOf: '2026-01-01T00:00:00.000Z', state: 'failed' },
        '2026-01-01T00:10:00.000Z',
        120000,
      ),
    ).toBe('failed');
  });
});
