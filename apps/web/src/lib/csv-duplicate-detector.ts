// SPDX-License-Identifier: BUSL-1.1

/**
 * Duplicate detection for CSV-imported transactions.
 *
 * Compares incoming `ValidatedRow` objects against existing `Transaction`
 * records and returns potential duplicates with a confidence score and
 * human-readable match reasons.
 */

import type { Transaction } from '@/kmp/bridge';
import type { ValidatedRow } from './csv-import-validator';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A potential duplicate match between an import row and an existing transaction. */
export interface DuplicateMatch {
  /** The row being imported. */
  importRow: ValidatedRow;
  /** The existing transaction it may duplicate. */
  existingTransaction: Transaction;
  /** Confidence score from 0.0 to 1.0. */
  matchScore: number;
  /** Human-readable explanations of why this is considered a match. */
  matchReasons: string[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum score for a match to be reported. */
const SCORE_THRESHOLD = 0.7;

/** Score awarded for an exact date match. */
const DATE_SCORE = 0.4;

/** Score awarded for an exact amount match. */
const AMOUNT_SCORE = 0.4;

/** Score awarded for a matching description / payee. */
const DESCRIPTION_SCORE = 0.1;

/** Score awarded for a matching category. */
const CATEGORY_SCORE = 0.1;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect potential duplicates between a set of import rows and existing
 * transactions in the database.
 *
 * For each import row, every existing transaction is checked. Matches
 * with a combined score ≥ 0.7 are returned.
 *
 * @returns Array of `DuplicateMatch` objects sorted by score descending.
 */
export function detectDuplicates(
  importRows: ValidatedRow[],
  existingTransactions: Transaction[],
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];

  for (const row of importRows) {
    for (const existing of existingTransactions) {
      const { score, reasons } = computeMatch(row, existing);

      if (score >= SCORE_THRESHOLD) {
        matches.push({
          importRow: row,
          existingTransaction: existing,
          matchScore: Math.min(score, 1.0),
          matchReasons: reasons,
        });
      }
    }
  }

  // Sort by score descending, then by row index ascending.
  matches.sort(
    (a, b) => b.matchScore - a.matchScore || a.importRow.rowIndex - b.importRow.rowIndex,
  );

  return matches;
}

// ---------------------------------------------------------------------------
// Internal scoring
// ---------------------------------------------------------------------------

function computeMatch(
  row: ValidatedRow,
  existing: Transaction,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // --- Date comparison -----------------------------------------------------
  if (row.data.date === existing.date) {
    score += DATE_SCORE;
    reasons.push('exact date match');
  }

  // --- Amount comparison ---------------------------------------------------
  if (row.data.amount.amount === existing.amount.amount) {
    score += AMOUNT_SCORE;
    reasons.push('same amount');
  }

  // --- Description / payee comparison --------------------------------------
  const importDesc = normalizeText(row.data.payee ?? '');
  const existingDesc = normalizeText(existing.payee ?? '');

  if (importDesc && existingDesc && fuzzyMatch(importDesc, existingDesc)) {
    score += DESCRIPTION_SCORE;
    reasons.push('similar description');
  }

  // --- Category comparison -------------------------------------------------
  if (row.data.categoryId && existing.categoryId && row.data.categoryId === existing.categoryId) {
    score += CATEGORY_SCORE;
    reasons.push('same category');
  }

  return { score, reasons };
}

// ---------------------------------------------------------------------------
// Text normalisation & fuzzy matching
// ---------------------------------------------------------------------------

/**
 * Normalise a text string for comparison: lowercase, strip punctuation,
 * collapse whitespace.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple fuzzy match: returns true if the two normalised strings are equal,
 * or if one string contains the other as a substring.
 */
function fuzzyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 0 || b.length === 0) return false;
  return a.includes(b) || b.includes(a);
}
