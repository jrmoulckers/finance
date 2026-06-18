// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { resolveCryptoProvenance } from './provenance-resolver';

const map = [
  { canonicalAsset: 'ETH', chain: 'ethereum', symbol: 'ETH' },
  { canonicalAsset: 'ETH', chain: 'ethereum', symbol: 'WETH' },
  { canonicalAsset: 'ETH', chain: 'arbitrum', symbol: 'ETH' },
];

describe('resolveCryptoProvenance', () => {
  it('distinguishes self-transfer, wrap, bridge, and taxable leftovers', () => {
    const resolutions = resolveCryptoProvenance(
      [
        {
          id: 'out-self',
          walletOwnerId: 'me',
          chain: 'ethereum',
          asset: 'ETH',
          quantity: 1,
          direction: 'out',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'in-self',
          walletOwnerId: 'me',
          chain: 'ethereum',
          asset: 'ETH',
          quantity: 1,
          direction: 'in',
          timestamp: '2026-01-01T00:10:00.000Z',
        },
        {
          id: 'out-wrap',
          walletOwnerId: 'me',
          chain: 'ethereum',
          asset: 'ETH',
          quantity: 2,
          direction: 'out',
          timestamp: '2026-01-02T00:00:00.000Z',
        },
        {
          id: 'in-wrap',
          walletOwnerId: 'me',
          chain: 'ethereum',
          asset: 'WETH',
          quantity: 2,
          direction: 'in',
          timestamp: '2026-01-02T00:10:00.000Z',
        },
        {
          id: 'out-bridge',
          walletOwnerId: 'me',
          chain: 'ethereum',
          asset: 'ETH',
          quantity: 3,
          direction: 'out',
          timestamp: '2026-01-03T00:00:00.000Z',
        },
        {
          id: 'in-bridge',
          walletOwnerId: 'me',
          chain: 'arbitrum',
          asset: 'ETH',
          quantity: 2.99,
          direction: 'in',
          timestamp: '2026-01-03T00:10:00.000Z',
        },
        {
          id: 'swap',
          walletOwnerId: 'me',
          chain: 'ethereum',
          asset: 'ETH',
          quantity: 1,
          direction: 'out',
          timestamp: '2026-01-04T00:00:00.000Z',
        },
      ],
      map,
    );

    expect(resolutions.map((resolution) => resolution.classification)).toEqual([
      'self-transfer',
      'wrap',
      'bridge',
      'taxable-swap',
    ]);
    expect(
      resolutions.find((resolution) => resolution.classification === 'bridge')?.requiresReview,
    ).toBe(true);
    expect(
      resolutions.find((resolution) => resolution.classification === 'taxable-swap')?.taxable,
    ).toBe(true);
  });
});
