// SPDX-License-Identifier: BUSL-1.1

/**
 * Local persistence-state helpers for annual capital-gains Tax Center reports.
 *
 * These pure helpers normalize imported closed-sale rows and reuse the existing
 * lot-level report generator and CSV exporter. References: issue #2711.
 */

import type { TaxLot } from '../investment/tax-center';
import {
  exportCapitalGainsLotsCsv,
  generateCapitalGainsTaxReport,
  type CapitalGainsSymbolSummary,
  type CapitalGainsTaxReport,
  type PersistedTaxSale,
} from './capital-gains-reporting';

export interface CapitalGainsReportState {
  readonly savedSales: readonly PersistedTaxSale[];
  readonly reportsByTaxYear: Readonly<Record<number, CapitalGainsTaxReport>>;
}

export interface ImportedClosedSaleRow {
  readonly saleId: string;
  readonly symbol: string;
  readonly shares: number;
  readonly soldDate: string;
  readonly salePricePerShare: number;
  readonly feesCents?: number;
  readonly lotId?: string;
}

export interface CapitalGainsAnnualExport {
  readonly taxYear: number;
  readonly bySymbol: readonly CapitalGainsSymbolSummary[];
  readonly csv: string;
  readonly disclaimer: string;
}

export function normalizeImportedClosedSales(rows: readonly ImportedClosedSaleRow[]): PersistedTaxSale[] {
  return rows.map((row) => ({
    id: row.saleId,
    symbol: row.symbol.trim().toUpperCase(),
    shares: row.shares,
    soldDate: row.soldDate,
    salePricePerShare: row.salePricePerShare,
    feesCents: row.feesCents,
    matchingMethod: row.lotId === undefined ? 'FIFO' : 'SPECIFIC_ID',
    specificLotIds: row.lotId === undefined ? undefined : [row.lotId],
  }));
}

export function saveCapitalGainsSales(
  state: CapitalGainsReportState,
  sales: readonly PersistedTaxSale[],
): CapitalGainsReportState {
  const byId = new Map(state.savedSales.map((sale) => [sale.id, sale]));
  for (const sale of sales) byId.set(sale.id, sale);
  return { ...state, savedSales: [...byId.values()].sort((a, b) => a.soldDate.localeCompare(b.soldDate)) };
}

export function buildSavedCapitalGainsReport(input: {
  readonly state: CapitalGainsReportState;
  readonly purchaseLots: readonly TaxLot[];
  readonly taxYear: number;
  readonly shortTermTaxRatePercent?: number;
  readonly longTermTaxRatePercent?: number;
}): CapitalGainsReportState {
  const report = generateCapitalGainsTaxReport({
    purchaseLots: input.purchaseLots,
    sales: input.state.savedSales,
    taxYear: input.taxYear,
    shortTermTaxRatePercent: input.shortTermTaxRatePercent,
    longTermTaxRatePercent: input.longTermTaxRatePercent,
  });
  return {
    ...input.state,
    reportsByTaxYear: { ...input.state.reportsByTaxYear, [input.taxYear]: report },
  };
}

export function buildCapitalGainsAnnualExport(report: CapitalGainsTaxReport): CapitalGainsAnnualExport {
  return {
    taxYear: report.taxYear,
    bySymbol: report.bySymbol,
    csv: exportCapitalGainsLotsCsv(report),
    disclaimer: report.disclaimer,
  };
}
