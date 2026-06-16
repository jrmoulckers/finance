// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Investment, InvestmentLot } from '../../kmp/bridge';
import {
  analyzeCostBasis,
  analyzeDividendIncome,
  analyzeExpenseRatios,
  buildAllocationVisualAnalysis,
  buildRebalancingSuggestions,
  computeTargetAllocationAnalysis,
  DEFAULT_TARGET_BANDS,
} from './beta-features';

const syncMetadata = {
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function investment(overrides: Partial<Investment> & Pick<Investment, 'id' | 'symbol'>): Investment {
  return {
    id: overrides.id,
    householdId: 'household-1',
    accountId: overrides.accountId ?? 'account-1',
    symbol: overrides.symbol,
    name: overrides.name ?? `${overrides.symbol} Fund`,
    type: overrides.type ?? 'ETF',
    shares: overrides.shares ?? 10,
    costBasisPerShare: overrides.costBasisPerShare ?? { amount: 10000 },
    currentPricePerShare: overrides.currentPricePerShare ?? { amount: 10000 },
    currency: overrides.currency ?? { code: 'USD', decimalPlaces: 2 },
    lastPriceUpdate: overrides.lastPriceUpdate ?? '2025-01-01T00:00:00Z',
    ...syncMetadata,
  };
}

function lot(overrides: Partial<InvestmentLot> & Pick<InvestmentLot, 'id' | 'investmentId'>): InvestmentLot {
  return {
    id: overrides.id,
    investmentId: overrides.investmentId,
    purchaseDate: overrides.purchaseDate ?? '2022-01-01',
    shares: overrides.shares ?? 5,
    costPerShare: overrides.costPerShare ?? { amount: 10000 },
    totalCost: overrides.totalCost ?? { amount: (overrides.shares ?? 5) * 10000 },
    ...syncMetadata,
  };
}

describe('investing beta allocation visuals', () => {
  it('groups by asset class, type, account, and holding with concentration signals', () => {
    const holdings = [
      investment({ id: 'vti', symbol: 'VTI', shares: 80, currentPricePerShare: { amount: 10000 } }),
      investment({ id: 'btc', symbol: 'BTC', type: 'CRYPTO', shares: 20, currentPricePerShare: { amount: 10000 } }),
    ];

    const analysis = buildAllocationVisualAnalysis(holdings, DEFAULT_TARGET_BANDS);

    expect(analysis.assetClassGroups.find((group) => group.key === 'US_STOCKS')?.percent).toBe(80);
    expect(analysis.typeGroups.find((group) => group.key === 'CRYPTO')?.valueCents).toBe(200000);
    expect(analysis.accountGroups[0].label).toContain('Account account-1');
    expect(analysis.holdingGroups[0].label).toContain('VTI');
    expect(analysis.diversificationSignals.some((signal) => signal.label === 'Top holding concentration')).toBe(true);
    expect(analysis.driftSignals.some((signal) => signal.id === 'drift-US_STOCKS')).toBe(true);
  });
});

describe('investing beta rebalancing suggestions', () => {
  it('produces buy-only suggestions from cash and sell suggestions only when enabled', () => {
    const holdings = [
      investment({ id: 'vti', symbol: 'VTI', shares: 90, currentPricePerShare: { amount: 10000 } }),
      investment({ id: 'bnd', symbol: 'BND', type: 'BOND', shares: 10, currentPricePerShare: { amount: 10000 } }),
    ];
    const analysis = computeTargetAllocationAnalysis(holdings, DEFAULT_TARGET_BANDS);

    const buyOnly = buildRebalancingSuggestions(analysis, 100000, false);
    const buySell = buildRebalancingSuggestions(analysis, 0, true);

    expect(buyOnly.every((suggestion) => suggestion.direction === 'BUY')).toBe(true);
    expect(buyOnly.some((suggestion) => suggestion.assetClass === 'BONDS')).toBe(true);
    expect(buySell.some((suggestion) => suggestion.direction === 'SELL')).toBe(true);
  });

  it('does not suggest trades when targets are invalid', () => {
    const holdings = [investment({ id: 'vti', symbol: 'VTI' })];
    const analysis = computeTargetAllocationAnalysis(holdings, [
      { assetClass: 'US_STOCKS', targetPercent: 50, minPercent: 45, maxPercent: 55 },
    ]);

    expect(buildRebalancingSuggestions(analysis, 100000, true)).toHaveLength(0);
  });
});

describe('investing beta dividend tracking', () => {
  it('forecasts forward income, yield on cost, monthly calendar, and stale warnings', () => {
    const holdings = [
      investment({ id: 'vti', symbol: 'VTI', shares: 10, costBasisPerShare: { amount: 10000 }, currentPricePerShare: { amount: 20000 } }),
    ];

    const analysis = analyzeDividendIncome(
      holdings,
      [{ investmentId: 'vti', dividendPerShareCents: 50, frequency: 'QUARTERLY', lastExDate: '2024-01-01', taxClassification: 'Qualified' }],
      [{ investmentId: 'vti', exDate: '2024-12-01', payDate: '2024-12-31', amountCents: 500, currency: 'USD', taxClassification: 'Qualified' }],
      '2025-01-15',
    );

    expect(analysis.trailingTwelveMonthIncomeCents).toBe(500);
    expect(analysis.forwardTwelveMonthIncomeCents).toBe(2000);
    expect(analysis.holdingSummaries[0].yieldOnCostPercent).toBe(2);
    expect(analysis.monthlyCalendar).toHaveLength(12);
    expect(analysis.warnings.some((warning) => warning.includes('over a year old'))).toBe(true);
  });
});

describe('investing beta fee analysis', () => {
  it('calculates annual fee drag and flags missing, not-applicable, and non-USD holdings', () => {
    const holdings = [
      investment({ id: 'vti', symbol: 'VTI', shares: 10, currentPricePerShare: { amount: 10000 } }),
      investment({ id: 'vxus', symbol: 'VXUS', currency: { code: 'EUR', decimalPlaces: 2 } }),
      investment({ id: 'aapl', symbol: 'AAPL', type: 'STOCK' }),
    ];

    const analysis = analyzeExpenseRatios(
      holdings,
      [
        { investmentId: 'vti', expenseRatioBps: 3, applies: true },
        { investmentId: 'vxus', expenseRatioBps: null, applies: true },
        { investmentId: 'aapl', expenseRatioBps: null, applies: false },
      ],
      7,
    );

    expect(analysis.summary.totalAnnualFees).toBe(30);
    expect(analysis.missingSymbols).toContain('VXUS');
    expect(analysis.nonUsdSymbols).toContain('VXUS');
    expect(analysis.notApplicableSymbols).toContain('AAPL');
    expect(analysis.projections.map((projection) => projection.years)).toEqual([10, 20, 30]);
  });
});

describe('investing beta cost-basis tracking', () => {
  it('computes lot-level unrealized gains and FIFO realized gains for partial sales', () => {
    const holdings = [
      investment({ id: 'vti', symbol: 'VTI', shares: 10, currentPricePerShare: { amount: 15000 } }),
    ];
    const lots = new Map<string, readonly InvestmentLot[]>([
      [
        'vti',
        [
          lot({ id: 'lot-1', investmentId: 'vti', purchaseDate: '2022-01-01', shares: 5, costPerShare: { amount: 10000 }, totalCost: { amount: 50000 } }),
          lot({ id: 'lot-2', investmentId: 'vti', purchaseDate: '2024-12-01', shares: 5, costPerShare: { amount: 12000 }, totalCost: { amount: 60000 } }),
        ],
      ],
    ]);

    const analysis = analyzeCostBasis(
      holdings,
      lots,
      [{ investmentId: 'vti', saleDate: '2025-01-15', sharesSold: 7, salePriceCents: 16000 }],
      '2025-01-15',
    );

    expect(analysis.lotRows).toHaveLength(2);
    expect(analysis.lotRows[0].unrealizedGainLossCents).toBe(25000);
    expect(analysis.realizedGainRows).toHaveLength(2);
    expect(analysis.realizedGainRows[0]).toMatchObject({ lotId: 'lot-1', sharesSold: 5, gainLossCents: 30000, holdingPeriod: 'LONG_TERM' });
    expect(analysis.realizedGainRows[1]).toMatchObject({ lotId: 'lot-2', sharesSold: 2, gainLossCents: 8000, holdingPeriod: 'SHORT_TERM' });
    expect(analysis.realizedByYear[0].totalCents).toBe(38000);
  });
});
