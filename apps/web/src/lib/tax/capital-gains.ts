// SPDX-License-Identifier: BUSL-1.1

/**
 * Capital gains calculator with cost basis methods.
 *
 * Classifies gains as short-term (< 1 year) or long-term (≥ 1 year),
 * supports FIFO, LIFO, and specific-lot cost basis methods, and generates
 * annual capital gains summaries with short/long-term netting.
 *
 * All monetary values are in cents (integers) to avoid floating-point errors.
 *
 * References: IRC §1222 (capital gains), IRC §1012 (basis), issue #1649
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Cost basis calculation method. */
export enum CostBasisMethod {
  FIFO = 'FIFO',
  LIFO = 'LIFO',
  SPECIFIC_LOT = 'SPECIFIC_LOT',
}

/** A single tax lot representing a purchase of shares. */
export interface TaxLot {
  /** Unique lot identifier. */
  readonly lotId: string;
  /** Security identifier (e.g., ticker symbol). */
  readonly symbol: string;
  /** Date the lot was acquired (ISO 8601). */
  readonly acquiredDate: string;
  /** Number of shares/units in this lot. */
  readonly quantity: number;
  /** Cost per share in cents. */
  readonly costPerShare: number;
}

/** A sale of shares to calculate gains on. */
export interface Sale {
  /** Security identifier. */
  readonly symbol: string;
  /** Date of sale (ISO 8601). */
  readonly saleDate: string;
  /** Number of shares sold. */
  readonly quantity: number;
  /** Sale price per share in cents. */
  readonly pricePerShare: number;
  /** Specific lot IDs to sell from (only for SPECIFIC_LOT method). */
  readonly specificLotIds?: readonly string[];
}

/** Result of a capital gains calculation for a single sale. */
export interface CapitalGainResult {
  /** Security identifier. */
  readonly symbol: string;
  /** Date of sale (ISO 8601). */
  readonly saleDate: string;
  /** Total sale proceeds in cents. */
  readonly proceeds: number;
  /** Total cost basis in cents. */
  readonly costBasis: number;
  /** Realized gain or loss in cents. */
  readonly gainLoss: number;
  /** Short-term portion of the gain/loss (cents). */
  readonly shortTermGainLoss: number;
  /** Long-term portion of the gain/loss (cents). */
  readonly longTermGainLoss: number;
  /** Lots consumed by this sale. */
  readonly lotsUsed: readonly LotAllocation[];
}

/** Allocation of shares from a specific lot to a sale. */
export interface LotAllocation {
  /** Lot identifier. */
  readonly lotId: string;
  /** Number of shares used from this lot. */
  readonly quantityUsed: number;
  /** Cost basis for the shares used (cents). */
  readonly costBasis: number;
  /** Whether this allocation is short-term. */
  readonly isShortTerm: boolean;
  /** Gain or loss for this allocation (cents). */
  readonly gainLoss: number;
}

/** Annual capital gains summary. */
export interface AnnualCapitalGainsSummary {
  /** Tax year. */
  readonly year: number;
  /** Total short-term gains (cents, positive). */
  readonly shortTermGains: number;
  /** Total short-term losses (cents, positive value). */
  readonly shortTermLosses: number;
  /** Net short-term gain/loss (cents). */
  readonly netShortTerm: number;
  /** Total long-term gains (cents, positive). */
  readonly longTermGains: number;
  /** Total long-term losses (cents, positive value). */
  readonly longTermLosses: number;
  /** Net long-term gain/loss (cents). */
  readonly netLongTerm: number;
  /** Overall net capital gain/loss (cents). */
  readonly netTotal: number;
  /** Number of transactions. */
  readonly transactionCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Milliseconds per day. */
const MS_PER_DAY = 86_400_000;

/** Days in one year for short-term vs long-term classification. */
const ONE_YEAR_DAYS = 365;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse an ISO date string to a Date at midnight UTC.
 */
function parseDate(iso: string): Date {
  return new Date(iso + 'T00:00:00Z');
}

/**
 * Calculate the number of full days between two ISO dates.
 */
function daysBetween(from: string, to: string): number {
  const diff = parseDate(to).getTime() - parseDate(from).getTime();
  return Math.floor(diff / MS_PER_DAY);
}

/**
 * Determine if a holding period is short-term.
 */
function isShortTerm(acquiredDate: string, saleDate: string): boolean {
  return daysBetween(acquiredDate, saleDate) < ONE_YEAR_DAYS;
}

/** Create a mutable copy of a tax lot for consumption tracking. */
interface MutableLot {
  readonly lotId: string;
  readonly symbol: string;
  readonly acquiredDate: string;
  remainingQuantity: number;
  readonly costPerShare: number;
}

function toMutableLot(lot: TaxLot): MutableLot {
  return {
    lotId: lot.lotId,
    symbol: lot.symbol,
    acquiredDate: lot.acquiredDate,
    remainingQuantity: lot.quantity,
    costPerShare: lot.costPerShare,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Select lots for a sale using the FIFO (First-In, First-Out) method.
 *
 * Lots are consumed in order of acquisition date (oldest first).
 *
 * @param lots - Available tax lots for the security (will not be mutated)
 * @param sale - Sale to allocate lots for
 * @returns Array of lot allocations
 */
export function selectLotsFIFO(lots: readonly TaxLot[], sale: Sale): LotAllocation[] {
  const sorted = lots
    .filter((l) => l.symbol === sale.symbol)
    .map(toMutableLot)
    .sort((a, b) => parseDate(a.acquiredDate).getTime() - parseDate(b.acquiredDate).getTime());

  return allocateFromLots(sorted, sale);
}

/**
 * Select lots for a sale using the LIFO (Last-In, First-Out) method.
 *
 * Lots are consumed in reverse order of acquisition date (newest first).
 *
 * @param lots - Available tax lots for the security (will not be mutated)
 * @param sale - Sale to allocate lots for
 * @returns Array of lot allocations
 */
export function selectLotsLIFO(lots: readonly TaxLot[], sale: Sale): LotAllocation[] {
  const sorted = lots
    .filter((l) => l.symbol === sale.symbol)
    .map(toMutableLot)
    .sort((a, b) => parseDate(b.acquiredDate).getTime() - parseDate(a.acquiredDate).getTime());

  return allocateFromLots(sorted, sale);
}

/**
 * Select lots for a sale using specific lot identification.
 *
 * Requires sale.specificLotIds to be set.
 *
 * @param lots - Available tax lots for the security
 * @param sale - Sale with specificLotIds
 * @returns Array of lot allocations
 * @throws Error if specificLotIds is missing or a lot is not found
 */
export function selectLotsSpecific(lots: readonly TaxLot[], sale: Sale): LotAllocation[] {
  if (!sale.specificLotIds || sale.specificLotIds.length === 0) {
    throw new Error('specificLotIds is required for SPECIFIC_LOT method.');
  }

  const lotMap = new Map(
    lots.filter((l) => l.symbol === sale.symbol).map((l) => [l.lotId, toMutableLot(l)]),
  );

  const ordered: MutableLot[] = [];
  for (const id of sale.specificLotIds) {
    const lot = lotMap.get(id);
    if (!lot) {
      throw new Error(`Lot ${id} not found for symbol ${sale.symbol}.`);
    }
    ordered.push(lot);
  }

  return allocateFromLots(ordered, sale);
}

/**
 * Allocate shares from ordered lots to fulfill a sale.
 */
function allocateFromLots(orderedLots: MutableLot[], sale: Sale): LotAllocation[] {
  const allocations: LotAllocation[] = [];
  let remaining = sale.quantity;

  for (const lot of orderedLots) {
    if (remaining <= 0) break;
    if (lot.remainingQuantity <= 0) continue;

    const quantityUsed = Math.min(remaining, lot.remainingQuantity);
    const costBasis = Math.round(quantityUsed * lot.costPerShare);
    const proceeds = Math.round(quantityUsed * sale.pricePerShare);
    const gainLoss = proceeds - costBasis;
    const shortTerm = isShortTerm(lot.acquiredDate, sale.saleDate);

    allocations.push({
      lotId: lot.lotId,
      quantityUsed,
      costBasis,
      isShortTerm: shortTerm,
      gainLoss,
    });

    lot.remainingQuantity -= quantityUsed;
    remaining -= quantityUsed;
  }

  if (remaining > 0) {
    throw new Error(
      `Insufficient shares: need ${sale.quantity}, available ${sale.quantity - remaining} for ${sale.symbol}.`,
    );
  }

  return allocations;
}

/**
 * Calculate capital gains for a sale using the specified cost basis method.
 *
 * @param lots - Available tax lots
 * @param sale - The sale to process
 * @param method - Cost basis method (default FIFO)
 * @returns Capital gain result with full breakdown
 */
export function calculateCapitalGains(
  lots: readonly TaxLot[],
  sale: Sale,
  method: CostBasisMethod = CostBasisMethod.FIFO,
): CapitalGainResult {
  let lotsUsed: LotAllocation[];

  switch (method) {
    case CostBasisMethod.FIFO:
      lotsUsed = selectLotsFIFO(lots, sale);
      break;
    case CostBasisMethod.LIFO:
      lotsUsed = selectLotsLIFO(lots, sale);
      break;
    case CostBasisMethod.SPECIFIC_LOT:
      lotsUsed = selectLotsSpecific(lots, sale);
      break;
  }

  const proceeds = Math.round(sale.quantity * sale.pricePerShare);
  const costBasis = lotsUsed.reduce((sum, a) => sum + a.costBasis, 0);
  const gainLoss = proceeds - costBasis;

  const shortTermGainLoss = lotsUsed
    .filter((a) => a.isShortTerm)
    .reduce((sum, a) => sum + a.gainLoss, 0);

  const longTermGainLoss = lotsUsed
    .filter((a) => !a.isShortTerm)
    .reduce((sum, a) => sum + a.gainLoss, 0);

  return {
    symbol: sale.symbol,
    saleDate: sale.saleDate,
    proceeds,
    costBasis,
    gainLoss,
    shortTermGainLoss,
    longTermGainLoss,
    lotsUsed,
  };
}

/**
 * Generate an annual capital gains summary from a list of gain results.
 *
 * @param results - Capital gain results for the year
 * @param year - Tax year
 * @returns Annual summary with short/long-term netting
 */
export function generateAnnualSummary(
  results: readonly CapitalGainResult[],
  year: number,
): AnnualCapitalGainsSummary {
  let shortTermGains = 0;
  let shortTermLosses = 0;
  let longTermGains = 0;
  let longTermLosses = 0;

  for (const r of results) {
    if (r.shortTermGainLoss >= 0) {
      shortTermGains += r.shortTermGainLoss;
    } else {
      shortTermLosses += Math.abs(r.shortTermGainLoss);
    }

    if (r.longTermGainLoss >= 0) {
      longTermGains += r.longTermGainLoss;
    } else {
      longTermLosses += Math.abs(r.longTermGainLoss);
    }
  }

  const netShortTerm = shortTermGains - shortTermLosses;
  const netLongTerm = longTermGains - longTermLosses;

  return {
    year,
    shortTermGains,
    shortTermLosses,
    netShortTerm,
    longTermGains,
    longTermLosses,
    netLongTerm,
    netTotal: netShortTerm + netLongTerm,
    transactionCount: results.length,
  };
}
