// SPDX-License-Identifier: BUSL-1.1

/**
 * Mint CSV export format parser.
 *
 * Parses Mint.com CSV export files into normalised transaction format.
 * Mint exports have a specific column structure that this parser handles
 * directly without requiring user column mapping.
 *
 * Mint CSV columns (standard):
 *   Date, Description, Original Description, Amount, Transaction Type,
 *   Category, Account Name, Labels, Notes
 *
 * Runs entirely client-side to preserve user financial data privacy.
 *
 * @module lib/import/mint-parser
 * References: #1602
 */

import { parseCsv, type CsvParseResult } from '../../lib/csv-parser';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A transaction parsed from a Mint CSV export. */
export interface MintTransaction {
  /** Transaction date as ISO 8601 (YYYY-MM-DD). */
  date: string;
  /** Cleaned-up description / payee. */
  description: string;
  /** Original description from the bank. */
  originalDescription: string;
  /** Amount as decimal string (negative for expenses). */
  amount: string;
  /** Transaction type: debit or credit. */
  type: 'debit' | 'credit';
  /** Mint category name. */
  category: string;
  /** Account name in Mint. */
  accountName: string;
  /** Labels / tags (comma-separated). */
  labels: string;
  /** Notes. */
  notes: string;
}

/** Result of parsing a Mint CSV export. */
export interface MintParseResult {
  /** Parsed transactions. */
  transactions: MintTransaction[];
  /** Total rows in the file. */
  totalCount: number;
  /** Errors encountered during parsing. */
  errors: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Known Mint CSV header columns (case-insensitive matching). */
const MINT_HEADERS = [
  'date',
  'description',
  'original description',
  'amount',
  'transaction type',
  'category',
  'account name',
  'labels',
  'notes',
] as const;

/**
 * Parse a Mint date string to ISO 8601.
 * Mint uses M/DD/YYYY format.
 */
function parseMintDate(raw: string): string | null {
  if (!raw) return null;

  const parts = raw.trim().split('/');
  if (parts.length !== 3) return null;

  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);

  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Detect whether headers match Mint CSV format.
 */
export function isMintFormat(headers: string[]): boolean {
  const normalised = headers.map((h) => h.trim().toLowerCase());
  // Must have at least Date, Description, Amount, Transaction Type
  return (
    normalised.includes('date') &&
    normalised.includes('description') &&
    normalised.includes('amount') &&
    normalised.includes('transaction type')
  );
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse Mint CSV export content into structured transactions.
 *
 * All parsing is done client-side — no data leaves the browser.
 *
 * @param content Raw CSV content from a Mint export.
 * @returns Parsed Mint transactions.
 */
export function parseMint(content: string): MintParseResult {
  const errors: string[] = [];
  const transactions: MintTransaction[] = [];

  // Parse as CSV first
  let csvResult: CsvParseResult;
  try {
    csvResult = parseCsv(content);
  } catch {
    return { transactions: [], totalCount: 0, errors: ['Failed to parse CSV content'] };
  }

  if (csvResult.headers.length === 0) {
    return { transactions: [], totalCount: 0, errors: ['No headers found in CSV'] };
  }

  // Build column index map (case-insensitive)
  const headerMap: Record<string, number> = {};
  csvResult.headers.forEach((h, i) => {
    headerMap[h.trim().toLowerCase()] = i;
  });

  // Verify required Mint columns
  if (!isMintFormat(csvResult.headers)) {
    return {
      transactions: [],
      totalCount: 0,
      errors: [
        'File does not appear to be a Mint CSV export. Expected columns: ' +
          MINT_HEADERS.join(', '),
      ],
    };
  }

  const dateIdx = headerMap['date'];
  const descIdx = headerMap['description'];
  const origDescIdx = headerMap['original description'];
  const amountIdx = headerMap['amount'];
  const typeIdx = headerMap['transaction type'];
  const categoryIdx = headerMap['category'];
  const accountIdx = headerMap['account name'];
  const labelsIdx = headerMap['labels'];
  const notesIdx = headerMap['notes'];

  for (let i = 0; i < csvResult.rows.length; i++) {
    const row = csvResult.rows[i];
    const rowNum = i + 1;

    const rawDate = dateIdx !== undefined ? row[dateIdx] : '';
    const date = parseMintDate(rawDate);
    if (!date) {
      errors.push(`Row ${rowNum}: Invalid date "${rawDate}"`);
      continue;
    }

    const rawAmount = amountIdx !== undefined ? row[amountIdx] : '';
    if (!rawAmount || rawAmount.trim() === '') {
      errors.push(`Row ${rowNum}: Missing amount`);
      continue;
    }

    const transType = (typeIdx !== undefined ? row[typeIdx] : '').trim().toLowerCase();
    const isDebit = transType === 'debit';

    // Mint stores amounts as positive; negate for debits
    const cleanAmount = rawAmount.replace(/[$,]/g, '').trim();
    const amount = isDebit ? `-${cleanAmount}` : cleanAmount;

    transactions.push({
      date,
      description: descIdx !== undefined ? (row[descIdx] ?? '') : '',
      originalDescription: origDescIdx !== undefined ? (row[origDescIdx] ?? '') : '',
      amount,
      type: isDebit ? 'debit' : 'credit',
      category: categoryIdx !== undefined ? (row[categoryIdx] ?? '') : '',
      accountName: accountIdx !== undefined ? (row[accountIdx] ?? '') : '',
      labels: labelsIdx !== undefined ? (row[labelsIdx] ?? '') : '',
      notes: notesIdx !== undefined ? (row[notesIdx] ?? '') : '',
    });
  }

  return {
    transactions,
    totalCount: transactions.length,
    errors,
  };
}
