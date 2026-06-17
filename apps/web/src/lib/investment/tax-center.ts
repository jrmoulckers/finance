// SPDX-License-Identifier: BUSL-1.1

/**
 * Tax-center calculations for lot-level sales, holding-period classification,
 * estimated taxes, and wash-sale guardrails.
 *
 * All monetary values are integer cents. Shares may be fractional.
 * References: issue #2123
 */

import type { LocalDate } from '../../kmp/bridge';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WASH_SALE_WINDOW_DAYS = 30;
const EPSILON = 1e-8;

export type HoldingPeriodTerm = 'SHORT_TERM' | 'LONG_TERM';
export type TaxLotMatchingMethod = 'FIFO' | 'SPECIFIC_ID';

export interface TaxLot {
  readonly id: string;
  readonly symbol: string;
  readonly shares: number;
  readonly costPerShare: number;
  readonly acquiredDate: LocalDate;
}

export interface TaxSaleInput {
  readonly symbol: string;
  readonly shares: number;
  readonly salePricePerShare: number;
  readonly soldDate: LocalDate;
  readonly matchingMethod?: TaxLotMatchingMethod;
  readonly specificLotIds?: readonly string[];
}

export interface ClosedTaxLot {
  readonly lotId: string;
  readonly symbol: string;
  readonly acquiredDate: LocalDate;
  readonly soldDate: LocalDate;
  readonly shares: number;
  readonly proceeds: number;
  readonly costBasis: number;
  readonly gainLoss: number;
  readonly term: HoldingPeriodTerm;
}

export interface LotMatchResult {
  readonly closedLots: readonly ClosedTaxLot[];
  readonly unmatchedShares: number;
}

export interface WashSaleReplacementLot {
  readonly lotId: string;
  readonly acquiredDate: LocalDate;
  readonly shares: number;
}

export interface WashSaleGuardrail {
  readonly closedLotId: string;
  readonly symbol: string;
  readonly soldDate: LocalDate;
  readonly disallowedLoss: number;
  readonly replacementLots: readonly WashSaleReplacementLot[];
  readonly explanation: string;
}

export interface TaxSummary {
  readonly shortTermGainLoss: number;
  readonly longTermGainLoss: number;
  readonly netGainLoss: number;
  readonly washSaleDisallowedLoss: number;
  readonly taxableShortTermGainLoss: number;
  readonly taxableLongTermGainLoss: number;
  readonly estimatedTax: number;
}

export interface UnrealizedTaxLot {
  readonly lot: TaxLot;
  readonly currentPricePerShare: number;
  readonly marketValue: number;
  readonly costBasis: number;
  readonly unrealizedGainLoss: number;
  readonly unrealizedGainLossPercent: number;
  readonly termAsOfDate: HoldingPeriodTerm;
}

function parseIsoDate(date: LocalDate): Date {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ISO date: ${date}`);
  }
  return parsed;
}

function addOneCalendarYear(date: Date): Date {
  const result = new Date(date.getTime());
  result.setUTCFullYear(result.getUTCFullYear() + 1);
  return result;
}

function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((parseIsoDate(b).getTime() - parseIsoDate(a).getTime()) / MS_PER_DAY);
}

function sameSymbol(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

function roundCents(amount: number): number {
  return Math.round(amount);
}

/** Classify a realized gain/loss as short-term or long-term. */
export function classifyGainTerm(acquiredDate: LocalDate, soldDate: LocalDate): HoldingPeriodTerm {
  const acquired = parseIsoDate(acquiredDate);
  const sold = parseIsoDate(soldDate);
  const oneYearAnniversary = addOneCalendarYear(acquired);
  return sold.getTime() > oneYearAnniversary.getTime() ? 'LONG_TERM' : 'SHORT_TERM';
}

/** Match a sale against open purchase lots using FIFO by default or specific-lot IDs. */
export function matchSaleLots(lots: readonly TaxLot[], sale: TaxSaleInput): LotMatchResult {
  if (sale.shares <= 0 || sale.salePricePerShare < 0) {
    return { closedLots: [], unmatchedShares: Math.max(0, sale.shares) };
  }

  const candidateLots = lots.filter((lot) => sameSymbol(lot.symbol, sale.symbol) && lot.shares > 0);
  const orderedLots =
    sale.matchingMethod === 'SPECIFIC_ID'
      ? (sale.specificLotIds ?? [])
          .map((id) => candidateLots.find((lot) => lot.id === id))
          .filter((lot): lot is TaxLot => lot !== undefined)
      : [...candidateLots].sort((a, b) => {
          const dateDiff =
            parseIsoDate(a.acquiredDate).getTime() - parseIsoDate(b.acquiredDate).getTime();
          return dateDiff !== 0 ? dateDiff : a.id.localeCompare(b.id);
        });

  const closedLots: ClosedTaxLot[] = [];
  let remaining = sale.shares;

  for (const lot of orderedLots) {
    if (remaining <= EPSILON) break;
    const sharesSold = Math.min(remaining, lot.shares);
    const proceeds = roundCents(sharesSold * sale.salePricePerShare);
    const costBasis = roundCents(sharesSold * lot.costPerShare);

    closedLots.push({
      lotId: lot.id,
      symbol: lot.symbol,
      acquiredDate: lot.acquiredDate,
      soldDate: sale.soldDate,
      shares: sharesSold,
      proceeds,
      costBasis,
      gainLoss: proceeds - costBasis,
      term: classifyGainTerm(lot.acquiredDate, sale.soldDate),
    });

    remaining -= sharesSold;
  }

  return {
    closedLots,
    unmatchedShares: remaining > EPSILON ? remaining : 0,
  };
}

/** Detect loss sales with same-symbol purchases inside the inclusive ±30-day wash-sale window. */
export function detectWashSaleGuardrails(
  closedLots: readonly ClosedTaxLot[],
  allLots: readonly TaxLot[],
): WashSaleGuardrail[] {
  const alerts: WashSaleGuardrail[] = [];

  for (const closed of closedLots) {
    if (closed.gainLoss >= 0) continue;

    const replacements = allLots.filter((lot) => {
      if (lot.id === closed.lotId || !sameSymbol(lot.symbol, closed.symbol)) return false;
      return Math.abs(daysBetween(closed.soldDate, lot.acquiredDate)) <= WASH_SALE_WINDOW_DAYS;
    });

    if (replacements.length === 0) continue;

    const replacementShares = replacements.reduce((sum, lot) => sum + lot.shares, 0);
    const disallowedShares = Math.min(closed.shares, replacementShares);
    const lossPerShare = Math.abs(closed.gainLoss) / closed.shares;
    const disallowedLoss = roundCents(disallowedShares * lossPerShare);
    const replacementLots = replacements.map((lot) => ({
      lotId: lot.id,
      acquiredDate: lot.acquiredDate,
      shares: lot.shares,
    }));

    alerts.push({
      closedLotId: closed.lotId,
      symbol: closed.symbol,
      soldDate: closed.soldDate,
      disallowedLoss,
      replacementLots,
      explanation: `Potential wash sale: ${closed.symbol} was sold at a loss and replacement shares were purchased within 30 days before or after ${closed.soldDate}. The estimated disallowed loss is based on replacement shares capped at the shares sold.`,
    });
  }

  return alerts;
}

/** Compute realized-gain summary and estimated tax from matched lots and user-entered rates. */
export function computeTaxSummary(
  closedLots: readonly ClosedTaxLot[],
  shortTermTaxRatePercent: number,
  longTermTaxRatePercent: number,
  washSaleAlerts: readonly WashSaleGuardrail[] = [],
): TaxSummary {
  const shortTermGainLoss = closedLots
    .filter((lot) => lot.term === 'SHORT_TERM')
    .reduce((sum, lot) => sum + lot.gainLoss, 0);
  const longTermGainLoss = closedLots
    .filter((lot) => lot.term === 'LONG_TERM')
    .reduce((sum, lot) => sum + lot.gainLoss, 0);

  const disallowedByLot = new Map<string, number>();
  for (const alert of washSaleAlerts) {
    disallowedByLot.set(
      alert.closedLotId,
      (disallowedByLot.get(alert.closedLotId) ?? 0) + alert.disallowedLoss,
    );
  }

  let taxableShortTermGainLoss = 0;
  let taxableLongTermGainLoss = 0;
  for (const lot of closedLots) {
    const taxableGainLoss = lot.gainLoss + (disallowedByLot.get(lot.lotId) ?? 0);
    if (lot.term === 'SHORT_TERM') {
      taxableShortTermGainLoss += taxableGainLoss;
    } else {
      taxableLongTermGainLoss += taxableGainLoss;
    }
  }

  const estimatedTax = roundCents(
    Math.max(0, taxableShortTermGainLoss) * (shortTermTaxRatePercent / 100) +
      Math.max(0, taxableLongTermGainLoss) * (longTermTaxRatePercent / 100),
  );

  return {
    shortTermGainLoss,
    longTermGainLoss,
    netGainLoss: shortTermGainLoss + longTermGainLoss,
    washSaleDisallowedLoss: washSaleAlerts.reduce((sum, alert) => sum + alert.disallowedLoss, 0),
    taxableShortTermGainLoss,
    taxableLongTermGainLoss,
    estimatedTax,
  };
}

/** Compute unrealized gain/loss for currently open lots. */
export function computeUnrealizedTaxLots(
  lots: readonly TaxLot[],
  currentPriceBySymbol: ReadonlyMap<string, number>,
  asOfDate: LocalDate,
): UnrealizedTaxLot[] {
  return lots.map((lot) => {
    const currentPricePerShare = currentPriceBySymbol.get(lot.symbol.toUpperCase()) ?? 0;
    const marketValue = roundCents(lot.shares * currentPricePerShare);
    const costBasis = roundCents(lot.shares * lot.costPerShare);
    const unrealizedGainLoss = marketValue - costBasis;

    return {
      lot,
      currentPricePerShare,
      marketValue,
      costBasis,
      unrealizedGainLoss,
      unrealizedGainLossPercent:
        costBasis === 0 ? 0 : Math.round((unrealizedGainLoss / costBasis) * 10000) / 100,
      termAsOfDate: classifyGainTerm(lot.acquiredDate, asOfDate),
    };
  });
}
