// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildCryptoDashboardState } from './dashboard-state';

describe('buildCryptoDashboardState', () => {
  it('builds mixed-source crypto rows with 24h/7d moves and source failures', () => {
    const state = buildCryptoDashboardState({
      holdings: [
        {
          sourceId: 'wallet',
          accountId: 'w',
          asset: 'BTC',
          quantity: 0.5,
          costBasisCents: 1000000,
        },
        {
          sourceId: 'exchange',
          accountId: 'e',
          asset: 'BTC',
          quantity: 0.25,
          costBasisCents: 500000,
        },
        { sourceId: 'manual', accountId: 'm', asset: 'ETH', quantity: 2 },
      ],
      quotes: [
        {
          asset: 'BTC',
          priceCents: 40000_00,
          currency: 'USD',
          asOf: '2026-01-02T00:00:00.000Z',
          move24hBps: 250,
          move7dBps: -500,
          sourceId: 'manual',
        },
      ],
      sourceStatuses: [
        { sourceId: 'exchange', state: 'failed', message: 'CSV import needs refresh' },
      ],
      now: '2026-01-02T00:01:00.000Z',
      staleAfterMs: 120000,
      currency: 'USD',
    });

    expect(state.totalValueCents).toBe(3000000);
    expect(state.rows[0]).toMatchObject({
      asset: 'BTC',
      quantity: 0.75,
      unrealizedPnlCents: 1500000,
    });
    expect(state.rows.find((row) => row.asset === 'ETH')?.warnings).toEqual(['missing quote']);
    expect(state.warnings).toContain('exchange: CSV import needs refresh');
  });

  it('flags stale quotes', () => {
    const state = buildCryptoDashboardState({
      holdings: [{ sourceId: 'wallet', accountId: 'w', asset: 'SOL', quantity: 10 }],
      quotes: [
        {
          asset: 'SOL',
          priceCents: 100_00,
          currency: 'USD',
          asOf: '2026-01-01T00:00:00.000Z',
          sourceId: 'manual',
        },
      ],
      now: '2026-01-02T00:00:00.000Z',
      staleAfterMs: 60000,
      currency: 'USD',
    });

    expect(state.warnings).toEqual(['SOL: stale quote']);
  });
});
