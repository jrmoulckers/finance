// SPDX-License-Identifier: BUSL-1.1

/**
 * QIF (Quicken Interchange Format) file parser.
 *
 * Parses QIF files into a normalised transaction format. QIF is a legacy
 * format used by Quicken, Microsoft Money, and other personal finance tools.
 *
 * Runs entirely client-side to preserve user financial data privacy.
 * No data is sent to any server during parsing.
 *
 * @see https://en.wikipedia.org/wiki/Quicken_Interchange_Format
 * @module lib/import/qif-parser
 * References: #1602
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single parsed QIF transaction. */
export interface QifTransaction {
  /** Transaction date as ISO 8601 string (YYYY-MM-DD). */
  date: string;
  /** Transaction amount as decimal string (e.g., "-42.50"). */
  amount: string;
  /** Payee name. */
  payee: string;
  /** Memo / notes. */
  memo: string | null;
  /** Category. */
  category: string | null;
  /** Check number. */
  checkNum: string | null;
  /** Cleared status: cleared, reconciled, or uncleared. */
  clearedStatus: 'cleared' | 'reconciled' | 'uncleared';
  /** Address lines (for Memorized entries). */
  address: string[];
}

/** QIF account type header. */
export type QifAccountType = 'Bank' | 'Cash' | 'CCard' | 'Invst' | 'Oth A' | 'Oth L' | 'Unknown';

/** Result of parsing a QIF file. */
export interface QifParseResult {
  /** Detected account type from the header. */
  accountType: QifAccountType;
  /** Parsed transactions. */
  transactions: QifTransaction[];
  /** Total number of transactions parsed. */
  totalCount: number;
  /** Errors encountered during parsing. */
  errors: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** QIF type header mapping. */
const TYPE_MAP: Record<string, QifAccountType> = {
  '!Type:Bank': 'Bank',
  '!Type:Cash': 'Cash',
  '!Type:CCard': 'CCard',
  '!Type:Invst': 'Invst',
  '!Type:Oth A': 'Oth A',
  '!Type:Oth L': 'Oth L',
};

/**
 * Parse a QIF date string to ISO 8601 (YYYY-MM-DD).
 *
 * QIF dates can be in multiple formats:
 *   - M/D/YY or M/D/YYYY (US)
 *   - D/M/YY or D/M/YYYY (non-US, less common)
 *   - M-D-YY or M-D-YYYY
 *   - M/D'YY (apostrophe separator for 2000s)
 *
 * We default to M/D/Y (US format) as QIF originated in the US.
 */
function parseQifDate(raw: string): string | null {
  if (!raw) return null;

  const cleaned = raw.trim();

  // Handle apostrophe separator: 1/31'23 → 1/31/2023
  const normalised = cleaned.replace(/'/g, '/');

  // Split on / or -
  const parts = normalised.split(/[/-]/);
  if (parts.length < 3) return null;

  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);

  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;

  // Handle 2-digit years
  if (year < 100) {
    year += year < 50 ? 2000 : 1900;
  }

  // Validate ranges
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Parse a QIF cleared status character.
 */
function parseClearedStatus(raw: string | null): 'cleared' | 'reconciled' | 'uncleared' {
  if (!raw) return 'uncleared';
  const c = raw.trim().toUpperCase();
  if (c === 'X' || c === 'C' || c === '*') return 'cleared';
  if (c === 'R') return 'reconciled';
  return 'uncleared';
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a QIF file content string into structured data.
 *
 * All parsing is done client-side — no data leaves the browser.
 *
 * @param content Raw QIF file content.
 * @returns Parsed QIF result with transactions.
 */
export function parseQif(content: string): QifParseResult {
  const errors: string[] = [];
  const transactions: QifTransaction[] = [];
  let accountType: QifAccountType = 'Unknown';

  // Normalise line endings
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Current transaction being built
  let currentDate: string | null = null;
  let currentAmount: string | null = null;
  let currentPayee = '';
  let currentMemo: string | null = null;
  let currentCategory: string | null = null;
  let currentCheckNum: string | null = null;
  let currentCleared: string | null = null;
  let currentAddress: string[] = [];
  let transactionIndex = 0;

  /** Flush the current transaction to the list. */
  function flushTransaction(): void {
    if (currentDate === null && currentAmount === null) return;

    transactionIndex++;

    if (!currentDate) {
      errors.push(`Transaction ${transactionIndex}: Missing date`);
      resetCurrent();
      return;
    }

    if (!currentAmount) {
      errors.push(`Transaction ${transactionIndex}: Missing amount`);
      resetCurrent();
      return;
    }

    transactions.push({
      date: currentDate,
      amount: currentAmount,
      payee: currentPayee,
      memo: currentMemo,
      category: currentCategory,
      checkNum: currentCheckNum,
      clearedStatus: parseClearedStatus(currentCleared),
      address: currentAddress,
    });

    resetCurrent();
  }

  /** Reset current transaction fields. */
  function resetCurrent(): void {
    currentDate = null;
    currentAmount = null;
    currentPayee = '';
    currentMemo = null;
    currentCategory = null;
    currentCheckNum = null;
    currentCleared = null;
    currentAddress = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    // Type header
    if (line.startsWith('!Type:') || line.startsWith('!type:')) {
      const typeKey = Object.keys(TYPE_MAP).find((k) => k.toLowerCase() === line.toLowerCase());
      if (typeKey) {
        accountType = TYPE_MAP[typeKey];
      }
      continue;
    }

    // Skip other header lines
    if (line.startsWith('!')) continue;

    // End-of-record marker
    if (line === '^') {
      flushTransaction();
      continue;
    }

    // Field indicators (first character)
    const fieldCode = line.charAt(0);
    const value = line.substring(1).trim();

    switch (fieldCode) {
      case 'D': // Date
        currentDate = parseQifDate(value);
        if (!currentDate) {
          errors.push(`Transaction ${transactionIndex + 1}: Invalid date format "${value}"`);
        }
        break;
      case 'T': // Amount (total)
      case 'U': // Amount (US, same as T in modern files)
        // Remove commas from formatted amounts
        currentAmount = value.replace(/,/g, '');
        break;
      case 'P': // Payee
        currentPayee = value;
        break;
      case 'M': // Memo
        currentMemo = value || null;
        break;
      case 'L': // Category (or transfer account in brackets)
        currentCategory = value || null;
        break;
      case 'N': // Check number
        currentCheckNum = value || null;
        break;
      case 'C': // Cleared status
        currentCleared = value;
        break;
      case 'A': // Address line
        currentAddress.push(value);
        break;
      // Split transaction lines (S, E, $) are captured but not individually tracked
      case 'S': // Split category
      case 'E': // Split memo
      case '$': // Split amount
        break;
      default:
        // Unknown field — skip silently
        break;
    }
  }

  // Flush any remaining transaction
  flushTransaction();

  return {
    accountType,
    transactions,
    totalCount: transactions.length,
    errors,
  };
}
