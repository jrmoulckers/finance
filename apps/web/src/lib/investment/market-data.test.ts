// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { ManualMarketDataProvider, evaluateQuoteFreshness } from './market-data';
import type { QuoteSnapshot } from './market-data';

const now = '2026-01-02T15:00:00.000Z';

function quote(overrides: Partial<QuoteSnapshot>): QuoteSnapshot {
  return { symbol: 'VTI', assetKind: 'equity', priceCents: 250_00, currency: 'USD', asOf: '2026-01-02T14:59:30.000Z', source: 'manual', marketSession: 'open', ...overrides };
}

describe('market data freshness', () => {
  it('marks open equity quotes fresh, delayed, or stale', () => {
    expect(evaluateQuoteFreshness(quote({}), now).freshness).toBe('fresh');
    expect(evaluateQuoteFreshness(quote({ asOf: '2026-01-02T14:50:00.000Z' }), now).freshness).toBe('delayed');
    expect(evaluateQuoteFreshness(quote({ asOf: '2026-01-02T14:00:00.000Z' }), now).freshness).toBe('stale');
  });

  it('uses 24x7 crypto freshness independently from market sessions', () => {
    const evaluated = evaluateQuoteFreshness(quote({ symbol: 'BTC', assetKind: 'crypto', marketSession: '24x7', asOf: '2026-01-02T14:58:30.000Z' }), now);
    expect(evaluated.freshness).toBe('fresh');
  });

  it('keeps closed-market snapshots usable within grace window and surfaces failures', () => {
    expect(evaluateQuoteFreshness(quote({ marketSession: 'closed', asOf: '2026-01-01T20:59:00.000Z' }), now).freshness).toBe('delayed');
    expect(evaluateQuoteFreshness(quote({ error: 'provider timeout' }), now).freshness).toBe('failed');
    expect(evaluateQuoteFreshness(undefined, now).freshness).toBe('missing');
  });

  it('returns deterministic manual snapshots', async () => {
    const provider = new ManualMarketDataProvider([quote({ symbol: 'AAPL' })]);
    await expect(provider.getSnapshots([{ symbol: 'aapl', assetKind: 'equity' }, { symbol: 'MSFT', assetKind: 'equity' }])).resolves.toHaveLength(1);
  });
});
