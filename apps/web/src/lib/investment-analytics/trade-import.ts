// SPDX-License-Identifier: BUSL-1.1

/**
 * Brokerage trade import with duplicate-safe reconciliation.
 *
 * Parses raw brokerage CSV data into typed {@link Trade} objects, detects
 * duplicates by fingerprinting (date + symbol + amount + action), and
 * reconciles against existing holdings to produce an import summary.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issue #1592
 */

import type {
  Cents,
  ISODate,
  ReconciliationResult,
  Trade,
  TradeAction,
  TradeFingerprint,
  TradeImportRow,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Supported trade action strings (case-insensitive matching). */
const ACTION_MAP: Record<string, TradeAction> = {
  buy: 'BUY',
  sell: 'SELL',
  dividend: 'DIVIDEND',
  div: 'DIVIDEND',
  'transfer in': 'TRANSFER_IN',
  'transfer out': 'TRANSFER_OUT',
  transfer_in: 'TRANSFER_IN',
  transfer_out: 'TRANSFER_OUT',
};

/**
 * Banker's rounding: round half to even.
 *
 * @param value - The number to round.
 * @returns The rounded integer.
 */
export function bankersRound(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const floored = Math.floor(value);
  const remainder = value - floored;
  // Exactly 0.5 — round to even
  if (Math.abs(remainder - 0.5) < Number.EPSILON * 100) {
    return floored % 2 === 0 ? floored : floored + 1;
  }
  return Math.round(value);
}

/**
 * Safe division that returns 0 when the divisor is 0.
 *
 * @param numerator - The dividend.
 * @param denominator - The divisor.
 * @returns The quotient or 0 on divide-by-zero.
 */
export function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Parse a dollar string to integer cents.
 *
 * Handles formats like "$1,234.56", "1234.56", "-$500.00".
 *
 * @param value - Raw dollar string.
 * @returns Amount in integer cents.
 */
export function parseDollarsToCents(value: string): Cents {
  const cleaned = value.replace(/[$,\s]/g, '');
  const parsed = parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return bankersRound(parsed * 100);
}

/**
 * Normalize a date string to ISO-8601 (YYYY-MM-DD).
 *
 * Handles common formats: MM/DD/YYYY, YYYY-MM-DD, M/D/YYYY.
 *
 * @param dateStr - Raw date string from CSV.
 * @returns Normalized ISO date string.
 */
export function normalizeDate(dateStr: string): ISODate {
  const trimmed = dateStr.trim();

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // MM/DD/YYYY or M/D/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Fallback: try to parse and format
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return trimmed;
}

/**
 * Parse a raw action string into a TradeAction.
 *
 * @param action - Raw action string (e.g., "Buy", "SELL", "Dividend").
 * @returns Parsed TradeAction or null if unrecognized.
 */
export function parseTradeAction(action: string): TradeAction | null {
  const normalized = action.trim().toLowerCase();
  return ACTION_MAP[normalized] ?? null;
}

// ---------------------------------------------------------------------------
// Trade fingerprinting and dedup
// ---------------------------------------------------------------------------

/**
 * Create a unique fingerprint string for a trade.
 *
 * Two trades with the same date, symbol, amount, and action are considered
 * duplicates. The fingerprint is a deterministic string key.
 *
 * @param fp - Trade fingerprint fields.
 * @returns A deterministic string key for duplicate detection.
 */
export function createFingerprint(fp: TradeFingerprint): string {
  return `${fp.date}|${fp.symbol.toUpperCase()}|${fp.amountCents}|${fp.action}`;
}

/**
 * Extract a fingerprint from a trade.
 *
 * @param trade - A trade object.
 * @returns The fingerprint fields.
 */
export function tradeToFingerprint(trade: Trade): TradeFingerprint {
  return {
    date: trade.date,
    symbol: trade.symbol.toUpperCase(),
    amountCents: trade.amountCents,
    action: trade.action,
  };
}

// ---------------------------------------------------------------------------
// CSV row parsing
// ---------------------------------------------------------------------------

let _idCounter = 0;

/**
 * Generate a simple sequential ID for imported trades.
 *
 * @returns A unique string ID.
 */
function generateImportId(): string {
  _idCounter += 1;
  return `import-${Date.now()}-${_idCounter}`;
}

/**
 * Reset the import ID counter (for testing).
 */
export function resetImportIdCounter(): void {
  _idCounter = 0;
}

/**
 * Parse a single raw CSV row into a Trade.
 *
 * Returns null if the row cannot be parsed (missing required fields,
 * unrecognized action, etc.).
 *
 * @param row - Raw CSV row data.
 * @returns Parsed Trade or null.
 */
export function parseTradeRow(row: TradeImportRow): Trade | null {
  const action = parseTradeAction(row.action);
  if (!action) return null;

  const symbol = row.symbol?.trim().toUpperCase();
  if (!symbol) return null;

  const date = normalizeDate(row.date);
  if (!date) return null;

  const amountCents = parseDollarsToCents(row.amount);
  const pricePerShareCents = parseDollarsToCents(row.price);
  const commissionCents = parseDollarsToCents(row.commission || '0');
  const shares = parseFloat(row.shares) || 0;

  return {
    id: generateImportId(),
    date,
    symbol,
    action,
    shares,
    amountCents,
    pricePerShareCents,
    commissionCents,
    accountName: row.account?.trim() || undefined,
  };
}

/**
 * Parse an array of raw CSV rows into trades, skipping invalid rows.
 *
 * @param rows - Raw CSV row data.
 * @returns Array of successfully parsed trades.
 */
export function parseTradeRows(rows: readonly TradeImportRow[]): Trade[] {
  const trades: Trade[] = [];
  for (const row of rows) {
    const trade = parseTradeRow(row);
    if (trade) trades.push(trade);
  }
  return trades;
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * Reconcile imported trades against existing trades.
 *
 * Categorizes each imported trade as:
 * - **duplicate**: fingerprint matches an existing trade
 * - **matched**: same symbol exists in existing trades but different details
 * - **new**: no existing trade with this symbol/date combination
 *
 * @param importedTrades - Newly imported trades.
 * @param existingTrades - Trades already in the system.
 * @returns Reconciliation result with categorized trades and counts.
 */
export function reconcileTrades(
  importedTrades: readonly Trade[],
  existingTrades: readonly Trade[],
): ReconciliationResult {
  // Build fingerprint set from existing trades
  const existingFingerprints = new Set<string>();
  const existingSymbolDates = new Set<string>();

  for (const trade of existingTrades) {
    existingFingerprints.add(createFingerprint(tradeToFingerprint(trade)));
    existingSymbolDates.add(`${trade.symbol.toUpperCase()}|${trade.date}`);
  }

  const newTrades: Trade[] = [];
  const duplicates: Trade[] = [];
  const matched: Trade[] = [];

  for (const trade of importedTrades) {
    const fp = createFingerprint(tradeToFingerprint(trade));

    if (existingFingerprints.has(fp)) {
      duplicates.push(trade);
    } else if (existingSymbolDates.has(`${trade.symbol.toUpperCase()}|${trade.date}`)) {
      matched.push(trade);
    } else {
      newTrades.push(trade);
    }
  }

  return {
    newTrades,
    duplicates,
    matched,
    totalImported: importedTrades.length,
    newCount: newTrades.length,
    duplicateCount: duplicates.length,
    matchedCount: matched.length,
  };
}
