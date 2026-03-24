// SPDX-License-Identifier: BUSL-1.1

/**
 * Pattern matching utilities for transaction description analysis.
 *
 * Provides normalisation, keyword extraction, and amount-based heuristics
 * that the categorisation engine uses when built-in and user rules do not
 * yield a high-confidence match.
 *
 * @module lib/categorization/patterns
 */

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a transaction description for matching.
 *
 * Trims whitespace, converts to lower-case, and collapses multiple spaces.
 */
export function normaliseDescription(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Extract the primary merchant token from a description.
 *
 * Many bank descriptions contain extraneous details like transaction IDs or
 * dates after the merchant name. This helper returns the first two
 * "significant" tokens as a simplified merchant key.
 *
 * Example: "WALMART SUPERCENTER #1234 ANYTOWN TX" → "walmart supercenter"
 */
export function extractMerchantKey(description: string): string {
  const normalised = normaliseDescription(description);
  // Strip leading card/check prefixes often prepended by banks.
  const stripped = normalised.replace(/^(pos|debit|credit|check|ach|wire|ref#?\S*)\s+/i, '');
  // Return up to the first two tokens as the merchant key.
  const tokens = stripped.split(' ').filter(Boolean);
  return tokens.slice(0, 2).join(' ');
}

// ---------------------------------------------------------------------------
// Amount-based heuristics
// ---------------------------------------------------------------------------

/** Categories that can be hinted at via transaction amount ranges. */
export interface AmountHint {
  readonly categoryName: string;
  readonly minCents: number;
  readonly maxCents: number;
}

/**
 * Heuristic amount ranges (in cents) that suggest a category when the
 * merchant itself is ambiguous.
 *
 * These are deliberately conservative and only used as a last resort (with
 * low confidence).
 */
export const AMOUNT_HINTS: readonly AmountHint[] = [
  // Small amounts at restaurants / cafes
  { categoryName: 'Dining', minCents: 100, maxCents: 3000 },
  // Typical grocery trip
  { categoryName: 'Groceries', minCents: 3001, maxCents: 25000 },
  // Subscription-sized charges
  { categoryName: 'Entertainment', minCents: 500, maxCents: 2500 },
] as const;

/**
 * Return an amount-based category hint, or `null` if the amount does not
 * fall neatly into any heuristic range.
 *
 * @param amountCents Absolute transaction amount in the smallest currency unit.
 */
export function getAmountHint(amountCents: number): AmountHint | null {
  const abs = Math.abs(amountCents);
  for (const hint of AMOUNT_HINTS) {
    if (abs >= hint.minCents && abs <= hint.maxCents) {
      return hint;
    }
  }
  return null;
}
