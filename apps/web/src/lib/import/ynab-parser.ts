// SPDX-License-Identifier: BUSL-1.1

/**
 * YNAB (You Need A Budget) CSV export format parser.
 *
 * Parses YNAB CSV exports (both YNAB4 and nYNAB formats) into normalised
 * transaction format. YNAB uses separate Inflow/Outflow columns instead
 * of a single signed amount.
 *
 * YNAB4 columns: Account, Flag, Date, Payee, Category Group/Category,
 *   Category, Master Category, Sub Category, Memo, Outflow, Inflow, Cleared
 *
 * nYNAB columns: Account, Flag, Date, Payee, Category Group/Category,
 *   Memo, Outflow, Inflow, Cleared
 *
 * Runs entirely client-side to preserve user financial data privacy.
 *
 * @module lib/import/ynab-parser
 * References: #1602
 */

import { parseCsv, type CsvParseResult } from '../../lib/csv-parser';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A transaction parsed from a YNAB CSV export. */
export interface YnabTransaction {
  /** Account name. */
  account: string;
  /** Flag colour (if any). */
  flag: string;
  /** Transaction date as ISO 8601 (YYYY-MM-DD). */
  date: string;
  /** Payee name. */
  payee: string;
  /** Category (may include group prefix). */
  category: string;
  /** Memo / notes. */
  memo: string;
  /** Net amount as decimal string (negative for outflows). */
  amount: string;
  /** Cleared status. */
  cleared: 'cleared' | 'uncleared' | 'reconciled';
}

/** Result of parsing a YNAB CSV export. */
export interface YnabParseResult {
  /** Parsed transactions. */
  transactions: YnabTransaction[];
  /** Total rows in the file. */
  totalCount: number;
  /** Errors encountered during parsing. */
  errors: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse a YNAB date string to ISO 8601.
 * YNAB uses MM/DD/YYYY or YYYY-MM-DD formats.
 */
function parseYnabDate(raw: string): string | null {
  if (!raw) return null;

  const cleaned = raw.trim();

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // US date format: M/D/YYYY or MM/DD/YYYY
  const parts = cleaned.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);

    if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Parse a YNAB currency amount string (removes currency symbols and commas).
 */
function parseYnabAmount(raw: string): number {
  if (!raw || raw.trim() === '') return 0;
  const cleaned = raw.replace(/[$€£¥,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse cleared status from YNAB format.
 */
function parseCleared(raw: string): 'cleared' | 'uncleared' | 'reconciled' {
  const c = (raw ?? '').trim().toLowerCase();
  if (c === 'cleared' || c === 'c') return 'cleared';
  if (c === 'reconciled' || c === 'r') return 'reconciled';
  return 'uncleared';
}

/**
 * Detect whether headers match YNAB CSV format.
 */
export function isYnabFormat(headers: string[]): boolean {
  const normalised = headers.map((h) => h.trim().toLowerCase());
  // Must have Date, Payee, and either Outflow+Inflow or Amount
  return (
    normalised.includes('date') &&
    normalised.includes('payee') &&
    (normalised.includes('outflow') || normalised.includes('amount'))
  );
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse YNAB CSV export content into structured transactions.
 *
 * All parsing is done client-side — no data leaves the browser.
 *
 * @param content Raw CSV content from a YNAB export.
 * @returns Parsed YNAB transactions.
 */
export function parseYnab(content: string): YnabParseResult {
  const errors: string[] = [];
  const transactions: YnabTransaction[] = [];

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

  if (!isYnabFormat(csvResult.headers)) {
    return {
      transactions: [],
      totalCount: 0,
      errors: [
        'File does not appear to be a YNAB CSV export. ' +
          'Expected columns: Date, Payee, Outflow, Inflow (or Amount)',
      ],
    };
  }

  const accountIdx = headerMap['account'];
  const flagIdx = headerMap['flag'];
  const dateIdx = headerMap['date'];
  const payeeIdx = headerMap['payee'];
  // nYNAB uses "Category Group/Category", YNAB4 uses separate columns
  const categoryIdx =
    headerMap['category group/category'] ?? headerMap['category'] ?? headerMap['sub category'];
  const memoIdx = headerMap['memo'];
  const outflowIdx = headerMap['outflow'];
  const inflowIdx = headerMap['inflow'];
  const amountIdx = headerMap['amount'];
  const clearedIdx = headerMap['cleared'];

  for (let i = 0; i < csvResult.rows.length; i++) {
    const row = csvResult.rows[i];
    const rowNum = i + 1;

    const rawDate = dateIdx !== undefined ? row[dateIdx] : '';
    const date = parseYnabDate(rawDate);
    if (!date) {
      errors.push(`Row ${rowNum}: Invalid date "${rawDate}"`);
      continue;
    }

    // Calculate net amount: inflow is positive, outflow is negative
    let amount: number;
    if (amountIdx !== undefined) {
      // Simple amount column (some YNAB exports)
      amount = parseYnabAmount(row[amountIdx] ?? '');
    } else {
      const inflow = inflowIdx !== undefined ? parseYnabAmount(row[inflowIdx] ?? '') : 0;
      const outflow = outflowIdx !== undefined ? parseYnabAmount(row[outflowIdx] ?? '') : 0;
      amount = inflow - outflow;
    }

    if (amount === 0 && !row[outflowIdx ?? -1] && !row[inflowIdx ?? -1]) {
      errors.push(`Row ${rowNum}: Missing amount`);
      continue;
    }

    transactions.push({
      account: accountIdx !== undefined ? (row[accountIdx] ?? '') : '',
      flag: flagIdx !== undefined ? (row[flagIdx] ?? '') : '',
      date,
      payee: payeeIdx !== undefined ? (row[payeeIdx] ?? '') : '',
      category: categoryIdx !== undefined ? (row[categoryIdx] ?? '') : '',
      memo: memoIdx !== undefined ? (row[memoIdx] ?? '') : '',
      amount: amount.toFixed(2),
      cleared: parseCleared(clearedIdx !== undefined ? (row[clearedIdx] ?? '') : ''),
    });
  }

  return {
    transactions,
    totalCount: transactions.length,
    errors,
  };
}
