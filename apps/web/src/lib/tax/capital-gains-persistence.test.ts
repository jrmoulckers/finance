// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { TaxLot } from '../investment/tax-center';
import {
  buildCapitalGainsAnnualExport,
  buildSavedCapitalGainsReport,
  normalizeImportedClosedSales,
  saveCapitalGainsSales,
  type CapitalGainsReportState,
} from './capital-gains-persistence';

const lots: TaxLot[] = [
  { id: 'lot-a', symbol: 'MSFT', shares: 1, costPerShare: 100_00, acquiredDate: '2023-01-01' },
  { id: 'lot-b', symbol: 'AAPL', shares: 2, costPerShare: 50_00, acquiredDate: '2024-01-01' },
];

describe('capital-gains-persistence', () => {
  it('normalizes imported closed-sale rows while preserving specific lot IDs', () => {
    const sales = normalizeImportedClosedSales([
      { saleId: 'sale-1', symbol: ' msft ', shares: 1, soldDate: '2025-02-01', salePricePerShare: 150_00, feesCents: 5_00, lotId: 'lot-a' },
    ]);

    expect(sales[0]).toMatchObject({ symbol: 'MSFT', matchingMethod: 'SPECIFIC_ID', specificLotIds: ['lot-a'] });
  });

  it('saves sales by id without mutating existing state', () => {
    const state: CapitalGainsReportState = { savedSales: [], reportsByTaxYear: {} };
    const sales = normalizeImportedClosedSales([
      { saleId: 'sale-1', symbol: 'MSFT', shares: 1, soldDate: '2025-02-01', salePricePerShare: 150_00 },
      { saleId: 'sale-1', symbol: 'MSFT', shares: 1, soldDate: '2025-02-01', salePricePerShare: 155_00 },
    ]);

    const next = saveCapitalGainsSales(state, sales);

    expect(state.savedSales).toEqual([]);
    expect(next.savedSales).toHaveLength(1);
    expect(next.savedSales[0].salePricePerShare).toBe(155_00);
  });

  it('builds saved annual reports and lot-level CSV exports by symbol', () => {
    const state = saveCapitalGainsSales(
      { savedSales: [], reportsByTaxYear: {} },
      normalizeImportedClosedSales([
        { saleId: 'sale-msft', symbol: 'MSFT', shares: 1, soldDate: '2025-02-01', salePricePerShare: 150_00 },
        { saleId: 'sale-aapl', symbol: 'AAPL', shares: 2, soldDate: '2025-03-01', salePricePerShare: 40_00 },
      ]),
    );
    const withReport = buildSavedCapitalGainsReport({ state, purchaseLots: lots, taxYear: 2025 });
    const report = withReport.reportsByTaxYear[2025];
    const annual = buildCapitalGainsAnnualExport(report);

    expect(report.summary.netGainLoss).toBe(30_00);
    expect(annual.bySymbol.map((row) => row.symbol)).toEqual(['AAPL', 'MSFT']);
    expect(annual.csv).toContain('saleId,symbol,lotId');
    expect(annual.csv).toContain('sale-msft,MSFT,lot-a');
  });
});
