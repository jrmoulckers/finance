// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildLivePnlView, formatRelativeAge, pnlIndicator } from './live-pnl';
import type { BaseAccountBalance } from './live-pnl';
import type { IntradayPosition } from './intraday-pnl';
import type { QuoteSnapshot } from './market-data';

const NOW = '2026-01-02T15:00:00.000Z';

function quote(
  symbol: string,
  priceCents: number,
  asOf = '2026-01-02T14:59:40.000Z',
  assetKind: QuoteSnapshot['assetKind'] = 'equity',
  marketSession: QuoteSnapshot['marketSession'] = 'open',
): QuoteSnapshot {
  return { symbol, assetKind, priceCents, currency: 'USD', asOf, source: 'manual', marketSession };
}

const positions: IntradayPosition[] = [
  {
    accountId: 'acct-a',
    brokerage: 'Alpha',
    symbol: 'VTI',
    assetClass: 'equity',
    quantity: 10,
    previousCloseCents: 100_00, // prev close $100
    costBasisCents: 900_00, // basis $900
    currency: 'USD',
  },
  {
    accountId: 'acct-b',
    brokerage: 'Beta',
    symbol: 'BTC',
    assetClass: 'crypto',
    quantity: 0.1,
    previousCloseCents: 40000_00,
    costBasisCents: 3500_00,
    currency: 'USD',
  },
];

const quotes: QuoteSnapshot[] = [
  quote('VTI', 110_00), // +$10/share → +$100 day, value $1100
  quote('BTC', 41000_00, '2026-01-02T14:59:50.000Z', 'crypto', '24x7'), // +$1000/coin → +$100 day, value $4100
];

const baseAccounts: BaseAccountBalance[] = [
  {
    accountId: 'cash-1',
    label: 'Checking',
    assetClass: 'cash',
    balanceCents: 2000_00,
    currency: 'USD',
  },
  {
    accountId: 'loan-1',
    label: 'Margin loan',
    assetClass: 'other',
    balanceCents: -500_00,
    currency: 'USD',
  },
];

describe('pnlIndicator', () => {
  it('encodes direction with redundant non-colour cues', () => {
    expect(pnlIndicator(150)).toEqual({ direction: 'gain', sign: '+', arrow: '▲', label: 'gain' });
    expect(pnlIndicator(-150)).toEqual({ direction: 'loss', sign: '−', arrow: '▼', label: 'loss' });
    expect(pnlIndicator(0)).toEqual({ direction: 'flat', sign: '', arrow: '◆', label: 'flat' });
  });
});

describe('formatRelativeAge', () => {
  it('formats common buckets', () => {
    expect(formatRelativeAge(2_000)).toBe('just now');
    expect(formatRelativeAge(45_000)).toBe('45s ago');
    expect(formatRelativeAge(3 * 60_000)).toBe('3m ago');
    expect(formatRelativeAge(2 * 60 * 60_000)).toBe('2h ago');
    expect(formatRelativeAge(-1)).toBe('unknown');
  });
});

describe('buildLivePnlView', () => {
  it('aggregates market value, day/unrealized P&L and total net worth', () => {
    const view = buildLivePnlView({ positions, quotes, baseAccounts, now: NOW, currency: 'USD' });

    expect(view.investedValueCents).toBe(5200_00); // 1100 + 4100
    expect(view.dayPnlCents).toBe(200_00); // 100 + 100
    // unrealized: (1100-900) + (4100-3500) = 200 + 600
    expect(view.unrealizedPnlCents).toBe(800_00);
    // base net worth: 2000 - 500 = 1500
    expect(view.baseNetWorthCents).toBe(1500_00);
    // total: 5200 + 1500 = 6700
    expect(view.totalNetWorthCents).toBe(6700_00);
    // previous = total - dayPnl = 6700 - 200 = 6500
    expect(view.previousNetWorthCents).toBe(6500_00);
    expect(view.dayPnlPercent).toBeCloseTo((200_00 / 6500_00) * 100, 1);
    expect(view.indicators.day.direction).toBe('gain');
  });

  it('classifies staleness as live when all quotes are fresh', () => {
    const view = buildLivePnlView({ positions, quotes, baseAccounts, now: NOW, currency: 'USD' });
    expect(view.staleness.tone).toBe('live');
    expect(view.staleness.evaluatedCount).toBe(2);
    expect(view.staleness.freshCount).toBe(2);
    expect(view.staleness.staleSymbols).toEqual([]);
  });

  it('flags missing quotes as critical and lists the symbol', () => {
    const view = buildLivePnlView({
      positions,
      quotes: [quote('VTI', 110_00)], // BTC quote missing
      baseAccounts,
      now: NOW,
      currency: 'USD',
    });
    expect(view.staleness.tone).toBe('critical');
    expect(view.staleness.missingCount).toBe(1);
    expect(view.staleness.missingSymbols).toEqual(['BTC']);
    expect(view.staleness.worst).toBe('missing');
  });

  it('marks stale tone when a quote exceeds the freshness policy', () => {
    const view = buildLivePnlView({
      positions: [positions[0]],
      quotes: [quote('VTI', 110_00, '2026-01-02T13:00:00.000Z')], // 2h old, open market → stale
      now: NOW,
      currency: 'USD',
    });
    expect(view.staleness.tone).toBe('stale');
    expect(view.staleness.staleSymbols).toEqual(['VTI']);
  });

  it('carries lastUpdated through and reports empty tone with no positions', () => {
    const view = buildLivePnlView({
      positions: [],
      quotes: [],
      baseAccounts,
      now: NOW,
      currency: 'USD',
      lastUpdated: NOW,
    });
    expect(view.lastUpdated).toBe(NOW);
    expect(view.staleness.tone).toBe('empty');
    expect(view.totalNetWorthCents).toBe(1500_00);
  });

  it('includes realized P&L in the report and indicators', () => {
    const view = buildLivePnlView({
      positions,
      quotes,
      baseAccounts,
      realizedEvents: [
        {
          accountId: 'acct-a',
          brokerage: 'Alpha',
          symbol: 'AAPL',
          realizedPnlCents: -75_00,
          currency: 'USD',
        },
      ],
      now: NOW,
      currency: 'USD',
    });
    expect(view.realizedPnlCents).toBe(-75_00);
    expect(view.indicators.realized.direction).toBe('loss');
  });

  it('rolls up cross-broker breakdowns', () => {
    const view = buildLivePnlView({ positions, quotes, baseAccounts, now: NOW, currency: 'USD' });
    const byBrokerage = view.report.breakdowns.byBrokerage;
    expect(byBrokerage.map((r) => r.key).sort()).toEqual(['Alpha', 'Beta']);
    expect(byBrokerage.find((r) => r.key === 'Alpha')?.dayPnlCents).toBe(100_00);
    expect(byBrokerage.find((r) => r.key === 'Beta')?.dayPnlCents).toBe(100_00);
    expect(view.report.breakdowns.byAssetClass.map((r) => r.key).sort()).toEqual([
      'crypto',
      'equity',
    ]);
  });
});
