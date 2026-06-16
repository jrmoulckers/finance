// SPDX-License-Identifier: BUSL-1.1

/**
 * Universal import format detector and router.
 *
 * Detects the format of an imported file (CSV, OFX, QFX, QIF) and routes
 * it to the appropriate parser. Also provides a unified transaction type
 * that all parsers normalise into.
 *
 * Runs entirely client-side to preserve user financial data privacy.
 *
 * Updated to use the new unified parser interfaces from #1599.
 *
 * @module lib/import/format-detector
 * References: #1602, #1599
 */

import { parseOfx } from './ofx-parser';
import { parseQif } from './qif-parser';
import { parseMint, isMintFormat, type MintParseResult } from './mint-parser';
import { parseYnab, isYnabFormat, type YnabParseResult } from './ynab-parser';
import type { ImportResult } from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Supported import file formats. */
export type ImportFormat = 'csv' | 'ofx' | 'qfx' | 'qif' | 'mint' | 'ynab' | 'unknown';

/** A normalised transaction from any import source. */
export interface NormalisedTransaction {
  /** Transaction date (ISO 8601 YYYY-MM-DD). */
  date: string;
  /** Posted/settlement date (if different from transaction date). */
  postedDate: string | null;
  /** Amount as decimal string (negative for expenses). */
  amount: string;
  /** Payee / description. */
  payee: string;
  /** Category (if available from source). */
  category: string | null;
  /** Memo / notes. */
  memo: string | null;
  /** Check number (if available). */
  checkNum: string | null;
  /** Provider-specific transaction ID (for duplicate detection). */
  sourceTransactionId: string | null;
  /** Source transaction type hint (for example OFX TRNTYPE). */
  sourceType: string | null;
  /** Original source format. */
  sourceFormat: ImportFormat;
  /** Confidence score (0–100) for auto-mapped fields. */
  confidence: number;
}

/** Result of detecting and parsing an import file. */
export interface UniversalImportResult {
  /** Detected format. */
  format: ImportFormat;
  /** Normalised transactions. */
  transactions: NormalisedTransaction[];
  /** Total count of parsed transactions. */
  totalCount: number;
  /** Parsing errors. */
  errors: string[];
  /** Raw parse result from the format-specific parser. */
  rawResult: ImportResult | MintParseResult | YnabParseResult | null;
  /** Account info (if available from OFX/QFX). */
  accountInfo: {
    accountId: string;
    accountType: string | null;
  } | null;
  /** Currency code (if detected). */
  currency: string | null;
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

/**
 * Detect the format of a file based on its name and content.
 *
 * Detection order:
 *   1. File extension (.ofx, .qfx, .qif)
 *   2. Content sniffing (OFX headers, QIF type headers)
 *   3. CSV header detection (Mint, YNAB patterns)
 *   4. Fall back to generic CSV
 *
 * @param fileName - Original file name for extension detection.
 * @param content - Raw file content as a string.
 * @returns The detected format string.
 */
export function detectFormat(fileName: string, content: string): ImportFormat {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';

  // Extension-based detection
  if (ext === 'ofx') return 'ofx';
  if (ext === 'qfx') return 'qfx';
  if (ext === 'qif') return 'qif';

  // Content sniffing for OFX (may not have extension)
  if (content.includes('OFXHEADER') || content.includes('<OFX>') || content.includes('<ofx>')) {
    return 'ofx';
  }

  // Content sniffing for QIF
  if (content.trimStart().startsWith('!Type:') || content.trimStart().startsWith('!type:')) {
    return 'qif';
  }

  // For CSV files, check if it's a known format
  if (ext === 'csv' || ext === 'txt' || ext === '') {
    const firstLine = content.split('\n')[0] ?? '';
    const headers = firstLine.split(',').map((h) => h.trim().replace(/"/g, ''));

    if (isMintFormat(headers)) return 'mint';
    if (isYnabFormat(headers)) return 'ynab';

    return 'csv';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/**
 * Normalise ImportResult transactions to the universal format.
 *
 * @param result - Parse result from OFX or QIF parser.
 * @param sourceFormat - The source format label.
 * @param confidence - Default confidence score.
 */
function normaliseImportResult(
  result: ImportResult,
  sourceFormat: ImportFormat,
  confidence: number,
): NormalisedTransaction[] {
  return result.transactions.map((t) => ({
    date: t.date,
    postedDate: null,
    amount: (t.amountCents / 100).toFixed(2),
    payee: t.description,
    category: t.category,
    memo: t.memo,
    checkNum: t.checkNumber,
    sourceTransactionId: t.sourceId,
    sourceType: t.type,
    sourceFormat,
    confidence,
  }));
}

/**
 * Normalise Mint transactions to the universal format.
 */
function normaliseMint(result: MintParseResult): NormalisedTransaction[] {
  return result.transactions.map((t) => ({
    date: t.date,
    postedDate: null,
    amount: t.amount,
    payee: t.description || t.originalDescription,
    category: t.category || null,
    memo: t.notes || null,
    checkNum: null,
    sourceTransactionId: null,
    sourceType: null,
    sourceFormat: 'mint' as ImportFormat,
    confidence: 85,
  }));
}

/**
 * Normalise YNAB transactions to the universal format.
 */
function normaliseYnab(result: YnabParseResult): NormalisedTransaction[] {
  return result.transactions.map((t) => ({
    date: t.date,
    postedDate: null,
    amount: t.amount,
    payee: t.payee,
    category: t.category || null,
    memo: t.memo || null,
    checkNum: null,
    sourceTransactionId: null,
    sourceType: null,
    sourceFormat: 'ynab' as ImportFormat,
    confidence: 85,
  }));
}

// ---------------------------------------------------------------------------
// Universal parser
// ---------------------------------------------------------------------------

/**
 * Parse a file of any supported format into normalised transactions.
 *
 * Detects the format from file name and content, then routes to the
 * appropriate parser. All parsing is client-side.
 *
 * @param fileName - Original file name (for extension-based detection).
 * @param content - Raw file content as a string.
 * @returns Universal import result with normalised transactions.
 */
export function parseImportFile(fileName: string, content: string): UniversalImportResult {
  const format = detectFormat(fileName, content);

  switch (format) {
    case 'ofx':
    case 'qfx': {
      const result = parseOfx(content);
      const errors = result.errors.map((e) => e.message);
      return {
        format,
        transactions: normaliseImportResult(result, format, 90),
        totalCount: result.totalRecords,
        errors,
        rawResult: result,
        accountInfo: result.accountId ? { accountId: result.accountId, accountType: null } : null,
        currency: result.currency,
      };
    }

    case 'qif': {
      const result = parseQif(content);
      const errors = result.errors.map((e) => e.message);
      return {
        format,
        transactions: normaliseImportResult(result, format, 80),
        totalCount: result.totalRecords,
        errors,
        rawResult: result,
        accountInfo: null,
        currency: null,
      };
    }

    case 'mint': {
      const result = parseMint(content);
      return {
        format,
        transactions: normaliseMint(result),
        totalCount: result.totalCount,
        errors: result.errors,
        rawResult: result,
        accountInfo: null,
        currency: 'USD',
      };
    }

    case 'ynab': {
      const result = parseYnab(content);
      return {
        format,
        transactions: normaliseYnab(result),
        totalCount: result.totalCount,
        errors: result.errors,
        rawResult: result,
        accountInfo: null,
        currency: null,
      };
    }

    case 'csv':
      return {
        format: 'csv',
        transactions: [],
        totalCount: 0,
        errors: [],
        rawResult: null,
        accountInfo: null,
        currency: null,
      };

    default:
      return {
        format: 'unknown',
        transactions: [],
        totalCount: 0,
        errors: [`Unsupported file format: ${fileName}`],
        rawResult: null,
        accountInfo: null,
        currency: null,
      };
  }
}

/**
 * Detect potential duplicates within a set of normalised transactions.
 *
 * Two transactions are considered potential duplicates if they have the
 * same date, amount, and payee (case-insensitive).
 *
 * @param transactions - Transactions to check.
 * @returns Map of duplicate group keys to arrays of transaction indices.
 */
export function detectDuplicates(transactions: NormalisedTransaction[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();

  transactions.forEach((t, index) => {
    const key = `${t.date}|${t.amount}|${(t.payee || '').toLowerCase().trim()}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(index);
    } else {
      groups.set(key, [index]);
    }
  });

  const duplicates = new Map<string, number[]>();
  groups.forEach((indices, key) => {
    if (indices.length > 1) {
      duplicates.set(key, indices);
    }
  });

  return duplicates;
}
