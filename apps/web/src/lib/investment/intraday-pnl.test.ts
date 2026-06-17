// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { computeIntradayPnl } from './intraday-pnl';
import type { IntradayPosition } from './intraday-pnl';
import type { QuoteSnapshot } from './market-data';

const now = '2026-01-02T15:00:00.000Z';

function quote(symbol: string, priceCents: number, asOf = '2026-01-02T14:59:30.000Z'): QuoteSnapshot {
  return { symbol, assetKind: symbol === 'BTC' ? 'crypto' : 'equity', priceCents, currency: 'USD', asOf, source: 'manual', marketSession: symbol === 'BTC' ? '24x7' : 'open' };
}

describe('computeIntradayPnl', () => {
  it('computes cross-broker day, unrealized, realized, cash, and breakdown totals', () => {
    const positions: IntradayPosition[] = [
      { accountId: 'taxable', brokerage: 'A', symbol: 'VTI', assetClass: 'equity', quantity: 10, previousCloseCents: 100_00, costBasisCents: 900_00, currency: 'USD' },
      { accountId: 'crypto', brokerage: 'B', symbol: 'BTC', assetClass: 'crypto', quantity: 0.1, previousCloseCents: 40000_00, costBasisCents: 3500_00, currency: 'USD' },
    ];

    const report = computeIntradayPnl({ positions, quotes: [quote('VTI', 110_00), quote('BTC', 41000_00)], realizedEvents: [{ accountId: 'taxable', brokerage: 'A', symbol: 'AAPL', realizedPnlCents: 50_00, currency: 'USD' }], cashMovements: [{ accountId: 'taxable', brokerage: 'A', kind: 'deposit', amountCents: 100_00, currency: 'USD' }], now, currency: 'USD' });

    expect(report.totalMarketValueCents).toBe(5200_00);
    expect(report.dayPnlCents).toBe(200_00);
    expect(report.unrealizedPnlCents).toBe(800_00);
    expect(report.netWorthDeltaCents).toBe(350_00);
    expect(report.breakdowns.byBrokerage.find((row) => row.key === 'A')?.dayPnlCents).toBe(100_00);
  });

  it('flags stale quotes and missing basis without blocking shorts/options placeholders', () => {
    const report = computeIntradayPnl({
      positions: [{ accountId: 'margin', brokerage: 'A', symbol: 'SPY-PUT', assetClass: 'option', quantity: -1, previousCloseCents: 200_00, currency: 'USD' }],
      quotes: [{ ...quote('SPY-PUT', 150_00, '2026-01-02T14:00:00.000Z'), assetKind: 'option' }],
      now,
      currency: 'USD',
    });

    expect(report.dayPnlCents).toBe(50_00);
    expect(report.staleSymbols).toEqual(['SPY-PUT']);
    expect(report.missingBasisSymbols).toEqual(['SPY-PUT']);
  });
});
