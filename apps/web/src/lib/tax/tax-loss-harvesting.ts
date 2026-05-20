// SPDX-License-Identifier: BUSL-1.1

/**
 * Tax-loss harvesting engine with wash-sale guardrails.
 *
 * Identifies positions with unrealized losses, calculates potential tax savings
 * from harvesting, and enforces IRS wash-sale rules (30-day window on
 * substantially identical securities).
 *
 * All monetary values are in cents (integers) to avoid floating-point errors.
 *
 * References: IRC §1091 (wash sales), IRC §1222 (capital gains), issue #1645
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A held position with cost basis and current market value. */
export interface Position {
  /** Unique security identifier (e.g., ticker symbol). */
  readonly symbol: string;
  /** Total cost basis in cents. */
  readonly costBasis: number;
  /** Current fair market value in cents. */
  readonly marketValue: number;
  /** Date position was acquired (ISO 8601). */
  readonly acquiredDate: string;
  /** Number of shares/units held. */
  readonly quantity: number;
}

/** Result of analyzing a single position for harvesting. */
export interface HarvestCandidate {
  /** The position being analyzed. */
  readonly position: Position;
  /** Unrealized gain or loss in cents (negative = loss). */
  readonly unrealizedGainLoss: number;
  /** Whether this is a short-term holding (< 1 year). */
  readonly isShortTerm: boolean;
  /** Estimated tax savings from harvesting this loss (cents). */
  readonly estimatedTaxSavings: number;
}

/** A prior sale/purchase used for wash-sale detection. */
export interface SecurityTransaction {
  /** Security identifier. */
  readonly symbol: string;
  /** Transaction date (ISO 8601). */
  readonly date: string;
  /** 'BUY' or 'SELL'. */
  readonly type: 'BUY' | 'SELL';
}

/** Result of a wash-sale check. */
export interface WashSaleCheckResult {
  /** Whether a wash sale would be triggered. */
  readonly isWashSale: boolean;
  /** The conflicting transaction, if any. */
  readonly conflictingTransaction: SecurityTransaction | null;
  /** Start of the wash-sale exclusion window (ISO 8601). */
  readonly windowStart: string;
  /** End of the wash-sale exclusion window (ISO 8601). */
  readonly windowEnd: string;
}

/** Summary of harvesting opportunities across a portfolio. */
export interface HarvestingSummary {
  /** All positions with unrealized losses. */
  readonly candidates: readonly HarvestCandidate[];
  /** Total unrealized losses across candidates (cents, negative). */
  readonly totalUnrealizedLosses: number;
  /** Total estimated tax savings (cents). */
  readonly totalEstimatedSavings: number;
  /** Net capital gain/loss across all positions (cents). */
  readonly netGainLoss: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Wash-sale window in days (30 days before and after). */
const WASH_SALE_WINDOW_DAYS = 30;

/** Maximum capital loss deduction per year against ordinary income (cents). */
export const MAX_CAPITAL_LOSS_DEDUCTION = 3_000_00;

/** Milliseconds per day. */
const MS_PER_DAY = 86_400_000;

/** Days in one year for short-term vs long-term classification. */
const ONE_YEAR_DAYS = 365;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse an ISO date string to a Date at midnight UTC.
 *
 * @param iso - ISO 8601 date string (YYYY-MM-DD)
 * @returns Date object
 */
function parseDate(iso: string): Date {
  return new Date(iso + 'T00:00:00Z');
}

/**
 * Calculate the number of full days between two ISO date strings.
 *
 * @param from - Start date (ISO 8601)
 * @param to - End date (ISO 8601)
 * @returns Number of days (can be negative if from > to)
 */
function daysBetween(from: string, to: string): number {
  const diff = parseDate(to).getTime() - parseDate(from).getTime();
  return Math.floor(diff / MS_PER_DAY);
}

/**
 * Add days to an ISO date string and return a new ISO date string.
 *
 * @param iso - Base date (ISO 8601)
 * @param days - Number of days to add (can be negative)
 * @returns New date in ISO 8601 format
 */
function addDays(iso: string, days: number): string {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate unrealized gain or loss for a position.
 *
 * @param position - The held position
 * @returns Unrealized gain (positive) or loss (negative) in cents
 */
export function calculateUnrealizedGainLoss(position: Position): number {
  return position.marketValue - position.costBasis;
}

/**
 * Determine whether a position is short-term (held less than 1 year).
 *
 * @param acquiredDate - Date position was acquired (ISO 8601)
 * @param asOfDate - Current or reference date (ISO 8601)
 * @returns true if holding period is less than 1 year
 */
export function isShortTermHolding(acquiredDate: string, asOfDate: string): boolean {
  return daysBetween(acquiredDate, asOfDate) < ONE_YEAR_DAYS;
}

/**
 * Estimate tax savings from harvesting a capital loss.
 *
 * Short-term losses offset short-term gains taxed at ordinary income rates.
 * Long-term losses offset long-term gains taxed at preferential rates.
 * Excess losses up to $3,000/year can offset ordinary income.
 *
 * @param lossAmount - Absolute value of loss in cents (must be positive)
 * @param marginalRate - Marginal tax rate as decimal (e.g. 0.24)
 * @param isShortTerm - Whether the loss is short-term
 * @param longTermRate - Long-term capital gains rate (default 0.15)
 * @returns Estimated tax savings in cents
 */
export function estimateTaxSavings(
  lossAmount: number,
  marginalRate: number,
  isShortTerm: boolean,
  longTermRate: number = 0.15,
): number {
  if (lossAmount <= 0) return 0;
  const rate = isShortTerm ? marginalRate : longTermRate;
  return Math.round(lossAmount * rate);
}

/**
 * Analyze a position for tax-loss harvesting potential.
 *
 * @param position - Position to analyze
 * @param asOfDate - Current date (ISO 8601)
 * @param marginalRate - Taxpayer's marginal ordinary income rate
 * @param longTermRate - Long-term capital gains rate (default 0.15)
 * @returns HarvestCandidate with analysis details
 */
export function analyzePosition(
  position: Position,
  asOfDate: string,
  marginalRate: number,
  longTermRate: number = 0.15,
): HarvestCandidate {
  const unrealizedGainLoss = calculateUnrealizedGainLoss(position);
  const shortTerm = isShortTermHolding(position.acquiredDate, asOfDate);
  const lossAmount = unrealizedGainLoss < 0 ? Math.abs(unrealizedGainLoss) : 0;
  const estimatedTaxSavings = estimateTaxSavings(lossAmount, marginalRate, shortTerm, longTermRate);

  return {
    position,
    unrealizedGainLoss,
    isShortTerm: shortTerm,
    estimatedTaxSavings,
  };
}

/**
 * Check if selling a security on a given date would trigger a wash sale.
 *
 * A wash sale occurs if a substantially identical security is purchased
 * within 30 days before or after the sale date.
 *
 * @param sellDate - Proposed sell date (ISO 8601)
 * @param symbol - Security identifier to check
 * @param transactions - Recent buy/sell transactions to check against
 * @returns Wash-sale check result
 */
export function checkWashSale(
  sellDate: string,
  symbol: string,
  transactions: readonly SecurityTransaction[],
): WashSaleCheckResult {
  const windowStart = addDays(sellDate, -WASH_SALE_WINDOW_DAYS);
  const windowEnd = addDays(sellDate, WASH_SALE_WINDOW_DAYS);

  const conflicting = transactions.find((txn) => {
    if (txn.symbol !== symbol || txn.type !== 'BUY') return false;
    const txnDays = daysBetween(sellDate, txn.date);
    return Math.abs(txnDays) <= WASH_SALE_WINDOW_DAYS;
  });

  return {
    isWashSale: conflicting !== undefined,
    conflictingTransaction: conflicting ?? null,
    windowStart,
    windowEnd,
  };
}

/**
 * Identify all positions with unrealized losses suitable for harvesting.
 *
 * @param positions - All held positions
 * @param asOfDate - Current date (ISO 8601)
 * @param marginalRate - Taxpayer's marginal rate
 * @param longTermRate - Long-term capital gains rate (default 0.15)
 * @returns Array of harvest candidates (only those with losses)
 */
export function findHarvestCandidates(
  positions: readonly Position[],
  asOfDate: string,
  marginalRate: number,
  longTermRate: number = 0.15,
): HarvestCandidate[] {
  return positions
    .map((p) => analyzePosition(p, asOfDate, marginalRate, longTermRate))
    .filter((c) => c.unrealizedGainLoss < 0);
}

/**
 * Calculate net capital gain or loss across realized transactions.
 *
 * Short-term and long-term gains/losses are netted separately, then
 * combined. Net losses are capped at $3,000 deductible against ordinary
 * income per year.
 *
 * @param shortTermGains - Total short-term gains (cents, positive)
 * @param shortTermLosses - Total short-term losses (cents, positive value)
 * @param longTermGains - Total long-term gains (cents, positive)
 * @param longTermLosses - Total long-term losses (cents, positive value)
 * @returns Object with net amounts and deductible loss
 */
export function calculateNetGainLoss(
  shortTermGains: number,
  shortTermLosses: number,
  longTermGains: number,
  longTermLosses: number,
): {
  readonly netShortTerm: number;
  readonly netLongTerm: number;
  readonly netTotal: number;
  readonly deductibleLoss: number;
  readonly carryForwardLoss: number;
} {
  const netShortTerm = shortTermGains - shortTermLosses;
  const netLongTerm = longTermGains - longTermLosses;
  const netTotal = netShortTerm + netLongTerm;

  let deductibleLoss = 0;
  let carryForwardLoss = 0;

  if (netTotal < 0) {
    deductibleLoss = Math.min(Math.abs(netTotal), MAX_CAPITAL_LOSS_DEDUCTION);
    carryForwardLoss = Math.abs(netTotal) - deductibleLoss;
  }

  return {
    netShortTerm,
    netLongTerm,
    netTotal,
    deductibleLoss,
    carryForwardLoss,
  };
}

/**
 * Generate a comprehensive harvesting summary for a portfolio.
 *
 * @param positions - All held positions
 * @param asOfDate - Current date (ISO 8601)
 * @param marginalRate - Taxpayer's marginal tax rate
 * @param longTermRate - Long-term capital gains rate (default 0.15)
 * @returns Portfolio-level harvesting summary
 */
export function generateHarvestingSummary(
  positions: readonly Position[],
  asOfDate: string,
  marginalRate: number,
  longTermRate: number = 0.15,
): HarvestingSummary {
  const allAnalyzed = positions.map((p) =>
    analyzePosition(p, asOfDate, marginalRate, longTermRate),
  );
  const candidates = allAnalyzed.filter((c) => c.unrealizedGainLoss < 0);

  const totalUnrealizedLosses = candidates.reduce((sum, c) => sum + c.unrealizedGainLoss, 0);
  const totalEstimatedSavings = candidates.reduce((sum, c) => sum + c.estimatedTaxSavings, 0);
  const netGainLoss = allAnalyzed.reduce((sum, c) => sum + c.unrealizedGainLoss, 0);

  return {
    candidates,
    totalUnrealizedLosses,
    totalEstimatedSavings,
    netGainLoss,
  };
}
