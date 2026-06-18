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
const SCORE_THRESHOLD = 0.72;

/** Exact source IDs are authoritative for re-imports. */
const SOURCE_ID_SCORE = 1.0;

/** Score awarded for an exact date match. */
const DATE_SCORE = 0.28;

/** Score awarded when dates drift within a posting window. */
const DATE_WINDOW_SCORE = 0.18;

/** Score awarded for an exact amount match. */
const AMOUNT_SCORE = 0.34;

/** Score awarded for account match. */
const ACCOUNT_SCORE = 0.12;

/** Score awarded for a matching description / payee. */
const DESCRIPTION_SCORE = 0.2;

/** Score awarded for matching raw statement text. */
const STATEMENT_DESCRIPTION_SCORE = 0.14;

/** Score awarded for a matching category. */
const CATEGORY_SCORE = 0.08;

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

  const importSourceId = getString(row.data, 'externalReferenceId');
  if (
    importSourceId &&
    existing.externalReferenceId &&
    importSourceId === existing.externalReferenceId
  ) {
    return { score: SOURCE_ID_SCORE, reasons: ['same source transaction id'] };
  }

  // --- Date comparison -----------------------------------------------------
  if (row.data.date === existing.date) {
    score += DATE_SCORE;
    reasons.push('exact date match');
  } else if (Math.abs(daysBetween(row.data.date, existing.date)) <= 3) {
    score += DATE_WINDOW_SCORE;
    reasons.push('posting date within 3 days');
  }

  // --- Amount comparison ---------------------------------------------------
  if (row.data.amount.amount === existing.amount.amount) {
    score += AMOUNT_SCORE;
    reasons.push('same amount');
  }

  // --- Account comparison --------------------------------------------------
  if (row.data.accountId && row.data.accountId === existing.accountId) {
    score += ACCOUNT_SCORE;
    reasons.push('same account');
  }

  // --- Description / payee comparison --------------------------------------
  const importDesc = normalizeText(row.data.payee ?? '');
  const existingDesc = normalizeText(existing.payee ?? '');

  if (importDesc && existingDesc && fuzzyMatch(importDesc, existingDesc)) {
    score += DESCRIPTION_SCORE;
    reasons.push('similar payee');
  }

  const importStatementDesc = normalizeText(getString(row.data, 'statementDescription') ?? '');
  const existingStatementDesc = normalizeText(existing.statementDescription ?? '');
  if (
    importStatementDesc &&
    (fuzzyMatch(importStatementDesc, existingStatementDesc) ||
      fuzzyMatch(importStatementDesc, existingDesc))
  ) {
    score += STATEMENT_DESCRIPTION_SCORE;
    reasons.push('similar statement description');
  }

  // --- Category comparison -------------------------------------------------
  if (row.data.categoryId && existing.categoryId && row.data.categoryId === existing.categoryId) {
    score += CATEGORY_SCORE;
    reasons.push('same category');
  }

  if (importDesc && existingDesc && !fuzzyMatch(importDesc, existingDesc) && !importStatementDesc) {
    score = Math.min(score, SCORE_THRESHOLD - 0.01);
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
  if (a.includes(b) || b.includes(a)) return true;
  return tokenOverlap(a, b) >= 0.67;
}

function tokenOverlap(a: string, b: string): number {
  const aTokens = new Set(a.split(' ').filter(Boolean));
  const bTokens = new Set(b.split(' ').filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let shared = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) shared++;
  }
  return shared / Math.max(aTokens.size, bTokens.size);
}

function daysBetween(a: string, b: string): number {
  const left = Date.parse(`${a}T00:00:00Z`);
  const right = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(left) || Number.isNaN(right)) return Number.POSITIVE_INFINITY;
  return Math.round((left - right) / 86_400_000);
}

function getString(value: object, key: string): string | null {
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

export function mergeTransactionDetails(
  existing: Transaction,
  imported: Partial<{
    payee: string | null;
    note: string | null;
    categoryId: string | null;
    externalReferenceId: string | null;
    statementDescription: string | null;
    extraNotes: string | null;
  }>,
): Transaction {
  return {
    ...existing,
    payee: existing.payee || imported.payee || null,
    note: mergeText(existing.note, imported.note),
    categoryId: existing.categoryId || imported.categoryId || null,
    externalReferenceId: existing.externalReferenceId || imported.externalReferenceId || null,
    statementDescription: existing.statementDescription || imported.statementDescription || null,
    extraNotes: mergeText(existing.extraNotes, imported.extraNotes),
  };
}

function mergeText(existing: string | null, incoming: string | null | undefined): string | null {
  const left = existing?.trim() ?? '';
  const right = incoming?.trim() ?? '';
  if (!left) return right || null;
  if (!right || left.includes(right)) return left;
  return `${left}\n${right}`;
}
