// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { TaxLot } from '../investment/tax-center';
import {
  exportCapitalGainsLotsCsv,
  generateCapitalGainsTaxReport,
  type PersistedTaxSale,
} from './capital-gains-reporting';

const PURCHASE_LOTS: TaxLot[] = [
  {
    id: 'lot-old',
    symbol: 'AAPL',
    shares: 10,
    costPerShare: 100_00,
    acquiredDate: '2023-01-10',
  },
  {
    id: 'lot-replacement',
    symbol: 'AAPL',
    shares: 5,
    costPerShare: 80_00,
    acquiredDate: '2024-05-01',
  },
  {
    id: 'lot-msft',
    symbol: 'MSFT',
    shares: 2,
    costPerShare: 200_00,
    acquiredDate: '2022-01-01',
  },
];

describe('capital-gains-reporting', () => {
  it('builds annual report and detects wash sales using Tax Center guardrails', () => {
    const sales: PersistedTaxSale[] = [
      {
        id: 'sale-loss',
        symbol: 'AAPL',
        shares: 10,
        soldDate: '2024-04-15',
        salePricePerShare: 70_00,
      },
    ];

    const report = generateCapitalGainsTaxReport({ purchaseLots: PURCHASE_LOTS, sales, taxYear: 2024 });

    expect(report.closedLots).toHaveLength(1);
    expect(report.closedLots[0].gainLoss).toBe(-300_00);
    expect(report.washSaleAlerts).toHaveLength(1);
    expect(report.summary.washSaleDisallowedLoss).toBe(150_00);
    expect(report.closedLots[0].taxableGainLoss).toBe(-150_00);
    expect(report.bySymbol[0]).toMatchObject({
      symbol: 'AAPL',
      netGainLoss: -300_00,
      washSaleDisallowedLoss: 150_00,
      taxableGainLoss: -150_00,
    });
  });

  it('allocates sale fees against proceeds and gain/loss', () => {
    const report = generateCapitalGainsTaxReport({
      purchaseLots: PURCHASE_LOTS,
      taxYear: 2024,
      sales: [
        {
          id: 'sale-fee',
          symbol: 'MSFT',
          shares: 2,
          soldDate: '2024-06-01',
          salePricePerShare: 250_00,
          feesCents: 10_00,
        },
      ],
    });

    expect(report.closedLots[0].proceeds).toBe(490_00);
    expect(report.closedLots[0].costBasis).toBe(400_00);
    expect(report.closedLots[0].gainLoss).toBe(90_00);
  });

  it('depletes lots across persisted sales in date order', () => {
    const report = generateCapitalGainsTaxReport({
      purchaseLots: PURCHASE_LOTS,
      taxYear: 2024,
      sales: [
        {
          id: 'sale-first',
          symbol: 'AAPL',
          shares: 10,
          soldDate: '2024-02-01',
          salePricePerShare: 110_00,
        },
        {
          id: 'sale-second',
          symbol: 'AAPL',
          shares: 5,
          soldDate: '2024-08-01',
          salePricePerShare: 90_00,
        },
      ],
    });

    expect(report.closedLots).toHaveLength(2);
    expect(report.closedLots[0].lotId).toBe('lot-old');
    expect(report.closedLots[1].lotId).toBe('lot-replacement');
    expect(report.unmatchedSales).toEqual([]);
  });

  it('tracks unmatched sales without throwing', () => {
    const report = generateCapitalGainsTaxReport({
      purchaseLots: PURCHASE_LOTS,
      taxYear: 2024,
      sales: [
        {
          id: 'sale-too-large',
          symbol: 'MSFT',
          shares: 10,
          soldDate: '2024-06-01',
          salePricePerShare: 250_00,
        },
      ],
    });

    expect(report.unmatchedSales).toEqual([{ saleId: 'sale-too-large', unmatchedShares: 8 }]);
  });

  it('exports lot-level CSV for tax-prep review', () => {
    const report = generateCapitalGainsTaxReport({
      purchaseLots: PURCHASE_LOTS,
      taxYear: 2024,
      sales: [
        {
          id: 'sale-csv',
          symbol: 'MSFT',
          shares: 2,
          soldDate: '2024-06-01',
          salePricePerShare: 250_00,
        },
      ],
    });

    const csv = exportCapitalGainsLotsCsv(report);

    expect(csv.split('\n')[0]).toContain('washSaleDisallowedLossCents');
    expect(csv).toContain('sale-csv,MSFT,lot-msft');
  });
});
