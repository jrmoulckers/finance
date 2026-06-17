// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { processCryptoTaxEvents, type CryptoTaxEvent } from './crypto-tax-events';

const baseEvents: CryptoTaxEvent[] = [
  { id: 'buy-old', type: 'buy', timestamp: '2025-01-01T00:00:00Z', asset: 'ETH', quantity: 1, totalValueCents: 100_000_00 },
  { id: 'buy-new', type: 'buy', timestamp: '2025-02-01T00:00:00Z', asset: 'ETH', quantity: 1, totalValueCents: 150_000_00 },
];

describe('crypto-tax-events', () => {
  it('matches partial disposals using FIFO', () => {
    const result = processCryptoTaxEvents({
      events: [
        ...baseEvents,
        { id: 'sell-half', type: 'sell', timestamp: '2025-03-01T00:00:00Z', asset: 'ETH', quantity: 0.5, totalValueCents: 90_000_00 },
      ],
      matchingMethod: 'FIFO',
    });

    expect(result.dispositions[0]).toMatchObject({
      eventId: 'sell-half',
      disposedQuantity: 0.5,
      proceedsCents: 90_000_00,
      costBasisCents: 50_000_00,
      gainLossCents: 40_000_00,
    });
    expect(result.openLots.find((lot) => lot.id === 'buy-old:lot')?.quantity).toBe(0.5);
  });

  it('matches disposals using HIFO when selected', () => {
    const result = processCryptoTaxEvents({
      events: [
        ...baseEvents,
        { id: 'sell-one', type: 'sell', timestamp: '2025-03-01T00:00:00Z', asset: 'ETH', quantity: 1, totalValueCents: 120_000_00 },
      ],
      matchingMethod: 'HIFO',
    });

    expect(result.dispositions[0].lotMatches[0]).toMatchObject({ lotId: 'buy-new:lot', costBasisCents: 150_000_00 });
    expect(result.dispositions[0].gainLossCents).toBe(-30_000_00);
  });

  it('treats rewards and income receipts as ordinary income and new lots', () => {
    const result = processCryptoTaxEvents({
      events: [
        { id: 'stake', type: 'staking_reward', timestamp: '2025-04-01T00:00:00Z', asset: 'SOL', quantity: 2, fairMarketValueCents: 2_500_00 },
        { id: 'airdrop', type: 'airdrop', timestamp: '2025-04-02T00:00:00Z', asset: 'ARB', quantity: 10, totalValueCents: 300_00 },
      ],
    });

    expect(result.ordinaryIncomeCents).toBe(5_300_00);
    expect(result.openLots.map((lot) => lot.id)).toEqual(['stake:lot', 'airdrop:lot']);
  });

  it('applies gas fee capitalization or expense policy', () => {
    const capitalized = processCryptoTaxEvents({
      events: [{ id: 'buy', type: 'buy', timestamp: '2025-01-01T00:00:00Z', asset: 'BTC', quantity: 1, totalValueCents: 10_000_00, feeCents: 100_00 }],
      gasFeePolicy: 'CAPITALIZE',
    });
    const expensed = processCryptoTaxEvents({
      events: [{ id: 'buy', type: 'buy', timestamp: '2025-01-01T00:00:00Z', asset: 'BTC', quantity: 1, totalValueCents: 10_000_00, feeCents: 100_00 }],
      gasFeePolicy: 'EXPENSE',
    });

    expect(capitalized.openLots[0].costBasisCents).toBe(10_100_00);
    expect(expensed.deductibleGasExpenseCents).toBe(100_00);
  });

  it('warns on missing fair-market value without fabricating tax rows', () => {
    const result = processCryptoTaxEvents({
      events: [{ id: 'reward-missing', type: 'mining', timestamp: '2025-05-01T00:00:00Z', asset: 'DOGE', quantity: 100 }],
    });

    expect(result.missingFairMarketValueEventIds).toEqual(['reward-missing']);
    expect(result.openLots).toEqual([]);
    expect(result.warnings[0]).toContain('Missing fair-market value');
  });
});
