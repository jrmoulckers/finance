// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { processCryptoTaxEvents, type CryptoTaxEvent } from './crypto-tax-events';
import {
  buildDefiTaxAuditTrail,
  exportDefiForm8949Rows,
  getDefiTaxExportRequirements,
  summarizeDefiOrdinaryIncome,
} from './defi-tax-audit-trail';

const events: CryptoTaxEvent[] = [
  {
    id: 'buy',
    type: 'buy',
    timestamp: '2025-01-01T00:00:00Z',
    asset: 'ETH',
    quantity: 1,
    totalValueCents: 100_000_00,
    chain: 'ethereum',
    walletAddress: '0xabc',
    txHash: '0x1',
  },
  {
    id: 'stake',
    type: 'staking_reward',
    timestamp: '2025-01-10T00:00:00Z',
    asset: 'ETH',
    quantity: 0.1,
    totalValueCents: 12_000_00,
    chain: 'ethereum',
    walletAddress: '0xabc',
    txHash: '0x2',
  },
  {
    id: 'swap',
    type: 'swap',
    timestamp: '2025-02-01T00:00:00Z',
    asset: 'ETH',
    quantity: 0.5,
    totalValueCents: 80_000_00,
    toAsset: 'USDC',
    toQuantity: 80_000,
    chain: 'ethereum',
    walletAddress: '0xabc',
    txHash: '0x3',
  },
  {
    id: 'bridge',
    type: 'bridge',
    timestamp: '2025-02-02T00:00:00Z',
    asset: 'USDC',
    quantity: 80_000,
    chain: 'base',
    walletAddress: '0xabc',
    txHash: '0x4',
  },
  {
    id: 'airdrop',
    type: 'airdrop',
    timestamp: '2025-03-01T00:00:00Z',
    asset: 'ARB',
    quantity: 100,
    totalValueCents: 150_00,
    chain: 'arbitrum',
    walletAddress: '0xabc',
    txHash: '0x5',
  },
];

describe('defi-tax-audit-trail', () => {
  it('preserves source, normalized event, lot match, override, and price source details', () => {
    const result = processCryptoTaxEvents({ events });
    const audit = buildDefiTaxAuditTrail({
      sourceEvents: events,
      result,
      userOverrides: [
        {
          eventId: 'swap',
          field: 'totalValueCents',
          oldValue: 79_000_00,
          newValue: 80_000_00,
          reason: 'CoinGecko close price',
        },
      ],
      priceSources: [
        {
          eventId: 'swap',
          sourceName: 'CoinGecko',
          observedAt: '2025-02-01T00:00:00Z',
          priceCents: 80_000_00,
        },
      ],
    });

    const swap = audit.find((entry) => entry.eventId === 'swap');
    expect(swap?.sourceEvent.txHash).toBe('0x3');
    expect(swap?.normalizedEvent.asset).toBe('ETH');
    expect(swap?.lotMatches[0].lotId).toBe('buy:lot');
    expect(swap?.userOverrides[0].reason).toContain('CoinGecko');
    expect(swap?.priceSource?.sourceName).toBe('CoinGecko');
  });

  it('exports Form 8949-style rows and ordinary income summaries', () => {
    const result = processCryptoTaxEvents({ events });
    const rows = exportDefiForm8949Rows(result, events);
    const income = summarizeDefiOrdinaryIncome(events);

    expect(rows[0]).toMatchObject({ asset: 'ETH', dateSold: '2025-02-01', sourceEventId: 'swap' });
    expect(rows[0].lotIds).toBe('buy:lot');
    expect(income).toEqual(
      expect.arrayContaining([
        { incomeType: 'staking_reward', amountCents: 12_000_00, eventCount: 1 },
        { incomeType: 'airdrop', amountCents: 150_00, eventCount: 1 },
      ]),
    );
  });

  it('declares required export files, columns, fixtures, and disclaimer', () => {
    const requirements = getDefiTaxExportRequirements();

    expect(requirements.requiredFiles).toContain('audit-log.json');
    expect(requirements.form8949Columns).toContain('gainLossCents');
    expect(requirements.requiredFixtureTypes).toEqual(
      expect.arrayContaining(['airdrop', 'staking_reward', 'bridge', 'swap']),
    );
    expect(requirements.disclaimer).toContain('not official IRS forms');
  });
});
