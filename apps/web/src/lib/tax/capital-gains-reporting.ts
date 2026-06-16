// SPDX-License-Identifier: BUSL-1.1

/**
 * Annual capital-gains and wash-sale reporting built on the existing Tax Center
 * lot matcher and wash-sale guardrail implementation.
 *
 * Do not duplicate lot-level tax logic here; this module coordinates persisted
 * sales into report rows, symbol summaries, and CSV exports. Amounts are integer
 * cents. Wash-sale detection uses the Tax Center's inclusive ±30-day window.
 *
 * References: IRC §1091 wash sales, IRC §1222 capital gains/losses; issue #2273.
 */

import type { LocalDate } from '../../kmp/bridge';
import {
  computeTaxSummary,
  detectWashSaleGuardrails,
  matchSaleLots,
  type ClosedTaxLot,
  type TaxLot,
  type TaxLotMatchingMethod,
  type TaxSummary,
  type WashSaleGuardrail,
} from '../investment/tax-center';

export interface PersistedTaxSale {
  readonly id: string;
  readonly symbol: string;
  readonly shares: number;
  readonly soldDate: LocalDate;
  readonly salePricePerShare: number;
  readonly feesCents?: number;
  readonly matchingMethod?: TaxLotMatchingMethod;
  readonly specificLotIds?: readonly string[];
}

export interface ReportClosedTaxLot extends ClosedTaxLot {
  readonly saleId: string;
  readonly saleFeesAllocated: number;
  readonly taxableGainLoss: number;
  readonly washSaleDisallowedLoss: number;
}

export interface CapitalGainsSymbolSummary {
  readonly symbol: string;
  readonly salesCount: number;
  readonly proceeds: number;
  readonly costBasis: number;
  readonly shortTermGainLoss: number;
  readonly longTermGainLoss: number;
  readonly netGainLoss: number;
  readonly washSaleDisallowedLoss: number;
  readonly taxableGainLoss: number;
}

export interface CapitalGainsTaxReport {
  readonly taxYear: number;
  readonly closedLots: readonly ReportClosedTaxLot[];
  readonly washSaleAlerts: readonly WashSaleGuardrail[];
  readonly summary: TaxSummary;
  readonly bySymbol: readonly CapitalGainsSymbolSummary[];
  readonly unmatchedSales: readonly { readonly saleId: string; readonly unmatchedShares: number }[];
  readonly disclaimer: string;
}

interface MutableLot extends TaxLot {
  shares: number;
}

function taxYearFromDate(date: LocalDate): number {
  const year = Number.parseInt(date.slice(0, 4), 10);
  if (!Number.isInteger(year)) {
    throw new Error(`Invalid sale date: ${date}`);
  }
  return year;
}

function sameSymbol(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

function toMutableLots(lots: readonly TaxLot[]): MutableLot[] {
  return lots.map((lot) => ({ ...lot }));
}

function allocateFees(closedLots: readonly ClosedTaxLot[], feesCents: number): number[] {
  if (closedLots.length === 0 || feesCents <= 0) return closedLots.map(() => 0);
  const totalProceeds = closedLots.reduce((sum, lot) => sum + lot.proceeds, 0);
  if (totalProceeds <= 0) return closedLots.map(() => 0);

  let allocatedSoFar = 0;
  return closedLots.map((lot, index) => {
    if (index === closedLots.length - 1) return Math.max(0, Math.round(feesCents) - allocatedSoFar);
    const allocation = Math.round(Math.round(feesCents) * (lot.proceeds / totalProceeds));
    allocatedSoFar += allocation;
    return allocation;
  });
}

function decrementRemainingLots(lots: MutableLot[], closedLots: readonly ClosedTaxLot[]): void {
  for (const closed of closedLots) {
    const lot = lots.find((candidate) => candidate.id === closed.lotId);
    if (lot !== undefined) {
      lot.shares = Math.max(0, lot.shares - closed.shares);
    }
  }
}

function buildReportLots(sale: PersistedTaxSale, closedLots: readonly ClosedTaxLot[]): ReportClosedTaxLot[] {
  const feeAllocations = allocateFees(closedLots, sale.feesCents ?? 0);
  return closedLots.map((lot, index) => {
    const saleFeesAllocated = feeAllocations[index] ?? 0;
    const proceeds = lot.proceeds - saleFeesAllocated;
    return {
      ...lot,
      saleId: sale.id,
      proceeds,
      gainLoss: proceeds - lot.costBasis,
      saleFeesAllocated,
      taxableGainLoss: proceeds - lot.costBasis,
      washSaleDisallowedLoss: 0,
    };
  });
}

function applyWashSales(
  closedLots: readonly ReportClosedTaxLot[],
  alerts: readonly WashSaleGuardrail[],
): ReportClosedTaxLot[] {
  const disallowedByLot = new Map<string, number>();
  for (const alert of alerts) {
    disallowedByLot.set(
      alert.closedLotId,
      (disallowedByLot.get(alert.closedLotId) ?? 0) + alert.disallowedLoss,
    );
  }

  return closedLots.map((lot) => {
    const washSaleDisallowedLoss = disallowedByLot.get(lot.lotId) ?? 0;
    return {
      ...lot,
      washSaleDisallowedLoss,
      taxableGainLoss: lot.gainLoss + washSaleDisallowedLoss,
    };
  });
}

function summarizeBySymbol(closedLots: readonly ReportClosedTaxLot[]): CapitalGainsSymbolSummary[] {
  const symbols = new Map<string, CapitalGainsSymbolSummary>();
  for (const lot of closedLots) {
    const key = lot.symbol.toUpperCase();
    const current = symbols.get(key) ?? {
      symbol: key,
      salesCount: 0,
      proceeds: 0,
      costBasis: 0,
      shortTermGainLoss: 0,
      longTermGainLoss: 0,
      netGainLoss: 0,
      washSaleDisallowedLoss: 0,
      taxableGainLoss: 0,
    };

    symbols.set(key, {
      ...current,
      salesCount: current.salesCount + 1,
      proceeds: current.proceeds + lot.proceeds,
      costBasis: current.costBasis + lot.costBasis,
      shortTermGainLoss:
        current.shortTermGainLoss + (lot.term === 'SHORT_TERM' ? lot.gainLoss : 0),
      longTermGainLoss: current.longTermGainLoss + (lot.term === 'LONG_TERM' ? lot.gainLoss : 0),
      netGainLoss: current.netGainLoss + lot.gainLoss,
      washSaleDisallowedLoss: current.washSaleDisallowedLoss + lot.washSaleDisallowedLoss,
      taxableGainLoss: current.taxableGainLoss + lot.taxableGainLoss,
    });
  }

  return [...symbols.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/** Generate a persisted annual capital-gains report while reusing Tax Center calculations. */
export function generateCapitalGainsTaxReport(input: {
  readonly purchaseLots: readonly TaxLot[];
  readonly sales: readonly PersistedTaxSale[];
  readonly taxYear: number;
  readonly shortTermTaxRatePercent?: number;
  readonly longTermTaxRatePercent?: number;
}): CapitalGainsTaxReport {
  const remainingLots = toMutableLots(input.purchaseLots);
  const sortedSales = [...input.sales].sort((a, b) => a.soldDate.localeCompare(b.soldDate));
  const allReportLots: ReportClosedTaxLot[] = [];
  const unmatchedSales: { saleId: string; unmatchedShares: number }[] = [];

  for (const sale of sortedSales) {
    const result = matchSaleLots(remainingLots, {
      symbol: sale.symbol,
      shares: sale.shares,
      salePricePerShare: sale.salePricePerShare,
      soldDate: sale.soldDate,
      matchingMethod: sale.matchingMethod,
      specificLotIds: sale.specificLotIds,
    });

    if (result.unmatchedShares > 0) {
      unmatchedSales.push({ saleId: sale.id, unmatchedShares: result.unmatchedShares });
    }

    const reportLots = buildReportLots(sale, result.closedLots);
    decrementRemainingLots(remainingLots, result.closedLots);
    if (taxYearFromDate(sale.soldDate) === input.taxYear) {
      allReportLots.push(...reportLots);
    }
  }

  const reportPurchaseLots = input.purchaseLots.filter((lot) =>
    allReportLots.some((closed) => sameSymbol(closed.symbol, lot.symbol)),
  );
  const washSaleAlerts = detectWashSaleGuardrails(allReportLots, reportPurchaseLots);
  const closedLots = applyWashSales(allReportLots, washSaleAlerts);
  const summary = computeTaxSummary(
    closedLots,
    input.shortTermTaxRatePercent ?? 24,
    input.longTermTaxRatePercent ?? 15,
    washSaleAlerts,
  );

  return {
    taxYear: input.taxYear,
    closedLots,
    washSaleAlerts,
    summary,
    bySymbol: summarizeBySymbol(closedLots),
    unmatchedSales,
    disclaimer:
      'Estimated capital-gains and wash-sale report for planning only; reconcile against broker Form 1099-B.',
  };
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return text.includes(',') || text.includes('"') || text.includes('\n')
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

/** Export report lots in a tax-prep-review friendly CSV shape. */
export function exportCapitalGainsLotsCsv(report: Pick<CapitalGainsTaxReport, 'closedLots'>): string {
  const header = [
    'saleId',
    'symbol',
    'lotId',
    'acquiredDate',
    'soldDate',
    'shares',
    'proceedsCents',
    'costBasisCents',
    'gainLossCents',
    'term',
    'washSaleDisallowedLossCents',
    'taxableGainLossCents',
  ];
  const rows = report.closedLots.map((lot) => [
    lot.saleId,
    lot.symbol,
    lot.lotId,
    lot.acquiredDate,
    lot.soldDate,
    lot.shares,
    lot.proceeds,
    lot.costBasis,
    lot.gainLoss,
    lot.term,
    lot.washSaleDisallowedLoss,
    lot.taxableGainLoss,
  ]);

  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}
