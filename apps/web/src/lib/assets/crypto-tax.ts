// SPDX-License-Identifier: BUSL-1.1

/**
 * Crypto tax-lot matching and DeFi/staking income tracking.
 *
 * Supports FIFO, LIFO, and HIFO lot matching. Classifies gains as short-term
 * (≤365 days) or long-term (>365 days). DeFi yield and staking rewards are
 * treated as ordinary income at fair market value on date received.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issue #1672
 */

import { bankersRound, safeDivide } from './crypto-portfolio';
import type {
  CryptoDisposalResult,
  CryptoLotMethod,
  CryptoTaxLot,
  CryptoTaxSummary,
  CryptoWashSaleAlert,
  MatchedLot,
  StakingIncome,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse an ISO-8601 date string to a Date object. */
function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00Z');
}

/** Number of days between two ISO date strings. */
function daysBetween(start: string, end: string): number {
  const s = parseDate(start);
  const e = parseDate(end);
  return Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Lot sorting
// ---------------------------------------------------------------------------

/**
 * Sort tax lots according to the specified method.
 *
 * @param lots - Crypto tax lots to sort.
 * @param method - FIFO, LIFO, or HIFO.
 * @returns New sorted array of lots.
 */
export function sortLots(lots: readonly CryptoTaxLot[], method: CryptoLotMethod): CryptoTaxLot[] {
  const sorted = [...lots];
  switch (method) {
    case 'FIFO':
      return sorted.sort(
        (a, b) => parseDate(a.acquisitionDate).getTime() - parseDate(b.acquisitionDate).getTime(),
      );
    case 'LIFO':
      return sorted.sort(
        (a, b) => parseDate(b.acquisitionDate).getTime() - parseDate(a.acquisitionDate).getTime(),
      );
    case 'HIFO':
      return sorted.sort((a, b) => {
        const costPerUnitA = safeDivide(a.costBasisCents, a.quantity);
        const costPerUnitB = safeDivide(b.costBasisCents, b.quantity);
        return costPerUnitB - costPerUnitA;
      });
  }
}

// ---------------------------------------------------------------------------
// Lot matching
// ---------------------------------------------------------------------------

/**
 * Match lots against a crypto disposal (sale/trade/spend).
 *
 * Consumes lots in the order dictated by the method until the disposal
 * quantity is satisfied. Returns gain/loss split by short-term and long-term.
 *
 * @param lots - Available tax lots for the symbol.
 * @param quantityDisposed - Number of units disposed.
 * @param proceedsCents - Total proceeds from the disposal in cents.
 * @param disposalDate - Date of the disposal.
 * @param method - Lot matching method (FIFO, LIFO, HIFO).
 * @returns Disposal result with matched lots and gain/loss breakdown.
 */
export function matchLots(
  lots: readonly CryptoTaxLot[],
  quantityDisposed: number,
  proceedsCents: number,
  disposalDate: string,
  method: CryptoLotMethod,
): CryptoDisposalResult {
  if (quantityDisposed <= 0 || lots.length === 0) {
    return {
      disposalDate,
      proceedsCents,
      totalCostBasisCents: 0,
      gainLossCents: proceedsCents,
      shortTermGainLossCents: proceedsCents,
      longTermGainLossCents: 0,
      matchedLots: [],
    };
  }

  const sorted = sortLots(lots, method);
  const matchedLots: MatchedLot[] = [];
  let remaining = quantityDisposed;
  let totalCostBasis = 0;
  let shortTermGainLoss = 0;
  let longTermGainLoss = 0;

  for (const lot of sorted) {
    if (remaining <= 0) break;

    const quantityUsed = Math.min(remaining, lot.quantity);
    const costBasisForUsed = bankersRound(
      safeDivide(lot.costBasisCents, lot.quantity) * quantityUsed,
    );
    const proceedsForUsed = bankersRound(
      safeDivide(proceedsCents, quantityDisposed) * quantityUsed,
    );
    const gainLoss = proceedsForUsed - costBasisForUsed;
    const holdingDays = daysBetween(lot.acquisitionDate, disposalDate);
    const isLongTerm = holdingDays > 365;

    if (isLongTerm) {
      longTermGainLoss += gainLoss;
    } else {
      shortTermGainLoss += gainLoss;
    }

    totalCostBasis += costBasisForUsed;

    matchedLots.push({
      lotId: lot.id,
      symbol: lot.symbol,
      quantityUsed,
      costBasisCents: costBasisForUsed,
      isLongTerm,
      holdingDays,
      gainLossCents: gainLoss,
    });

    remaining -= quantityUsed;
  }

  return {
    disposalDate,
    proceedsCents,
    totalCostBasisCents: totalCostBasis,
    gainLossCents: proceedsCents - totalCostBasis,
    shortTermGainLossCents: shortTermGainLoss,
    longTermGainLossCents: longTermGainLoss,
    matchedLots,
  };
}

// ---------------------------------------------------------------------------
// Staking / DeFi income
// ---------------------------------------------------------------------------

/**
 * Compute total ordinary income from staking and DeFi yields.
 *
 * Staking rewards and DeFi yields are treated as ordinary income at the
 * fair market value on the date received per IRS guidance.
 *
 * @param records - Staking/DeFi income records.
 * @returns Total ordinary income in cents.
 */
export function computeStakingIncome(records: readonly StakingIncome[]): number {
  return records.reduce((sum, r) => sum + r.fairMarketValueCents, 0);
}

/**
 * Filter staking income records by tax year.
 *
 * @param records - All staking/DeFi income records.
 * @param year - Tax year to filter.
 * @returns Filtered records for the specified year.
 */
export function filterStakingByYear(
  records: readonly StakingIncome[],
  year: number,
): readonly StakingIncome[] {
  return records.filter((r) => {
    const d = parseDate(r.dateReceived);
    return d.getUTCFullYear() === year;
  });
}

// ---------------------------------------------------------------------------
// Wash sale detection for crypto
// ---------------------------------------------------------------------------

/** The wash sale detection window in days. */
const WASH_SALE_WINDOW_DAYS = 30;

/**
 * Detect potential wash sales for crypto disposals.
 *
 * A wash sale occurs when a crypto asset is sold at a loss and the same
 * asset is reacquired within 30 days before or after the sale. While the
 * IRS wash sale rule technically applies only to securities, many tax
 * advisors recommend treating crypto similarly.
 *
 * @param disposals - Disposal results with gain/loss.
 * @param acquisitions - All tax lots (including new purchases).
 * @returns Array of wash sale alerts.
 */
export function detectCryptoWashSales(
  disposals: readonly CryptoDisposalResult[],
  acquisitions: readonly CryptoTaxLot[],
): readonly CryptoWashSaleAlert[] {
  const alerts: CryptoWashSaleAlert[] = [];

  for (const disposal of disposals) {
    if (disposal.gainLossCents >= 0) continue;

    for (const lot of disposal.matchedLots) {
      const matchingAcquisitions = acquisitions.filter(
        (a) => a.symbol === lot.symbol && a.id !== lot.lotId,
      );

      for (const acq of matchingAcquisitions) {
        const daysDiff = Math.abs(daysBetween(disposal.disposalDate, acq.acquisitionDate));
        if (daysDiff <= WASH_SALE_WINDOW_DAYS) {
          alerts.push({
            symbol: lot.symbol,
            disposalDate: disposal.disposalDate,
            reacquisitionDate: acq.acquisitionDate,
            disallowedLossCents: Math.abs(lot.gainLossCents),
          });
          break;
        }
      }
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Annual tax summary
// ---------------------------------------------------------------------------

/**
 * Compute an annual crypto tax summary.
 *
 * Combines capital gains/losses from disposals with ordinary income from
 * staking/DeFi and reports wash sale alerts.
 *
 * @param taxYear - The tax year.
 * @param disposals - All disposal results for the year.
 * @param stakingRecords - All staking/DeFi income for the year.
 * @param allLots - All tax lots for wash sale detection.
 * @returns Annual crypto tax summary.
 */
export function computeCryptoTaxSummary(
  taxYear: number,
  disposals: readonly CryptoDisposalResult[],
  stakingRecords: readonly StakingIncome[],
  allLots: readonly CryptoTaxLot[],
): CryptoTaxSummary {
  let shortTermGainLoss = 0;
  let longTermGainLoss = 0;

  for (const d of disposals) {
    shortTermGainLoss += d.shortTermGainLossCents;
    longTermGainLoss += d.longTermGainLossCents;
  }

  const yearRecords = filterStakingByYear(stakingRecords, taxYear);
  const ordinaryIncome = computeStakingIncome(yearRecords);
  const washSaleAlerts = detectCryptoWashSales(disposals, allLots);

  return {
    taxYear,
    shortTermGainLossCents: shortTermGainLoss,
    longTermGainLossCents: longTermGainLoss,
    totalGainLossCents: shortTermGainLoss + longTermGainLoss,
    ordinaryIncomeCents: ordinaryIncome,
    totalDisposals: disposals.length,
    washSaleAlerts,
  };
}
