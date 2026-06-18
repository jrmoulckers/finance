// SPDX-License-Identifier: BUSL-1.1

/**
 * QIF (Quicken Interchange Format) parser.
 *
 * Parses QIF files into structured transaction records. Handles the
 * header line (!Type:), field lines (D, T, P, M, N, L, C, A), and
 * record terminators (^).
 *
 * All monetary values are returned as integer cents.
 * Pure functions — no side effects, no file I/O.
 */

import { ImportError, ImportFormat, ImportResult, ParsedTransaction } from './types';
import { bankersRound } from './utils';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** QIF account/transaction type from the !Type: header. */
export type QifType =
  | 'Bank'
  | 'Cash'
  | 'CCard'
  | 'Invst'
  | 'Oth A'
  | 'Oth L'
  | 'Memorized'
  | string;

/** A single parsed QIF record with raw field values. */
export interface QifRecord {
  /** Transaction date (raw from D line). */
  readonly date: string | null;
  /** Transaction amount (raw from T line). */
  readonly amount: string | null;
  /** Payee (from P line). */
  readonly payee: string | null;
  /** Memo (from M line). */
  readonly memo: string | null;
  /** Check number (from N line). */
  readonly checkNumber: string | null;
  /** Category (from L line, may include subcategory after ':'). */
  readonly category: string | null;
  /** Cleared status (from C line). */
  readonly clearedStatus: string | null;
  /** Address lines (from A lines). */
  readonly address: readonly string[];
  /** Account section name active when the record was parsed. */
  readonly accountName: string | null;
  /** QIF type active when the record was parsed. */
  readonly qifType: QifType | null;
  /** Split/category detail lines from S/$/E fields. */
  readonly splits: readonly string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse QIF content and extract financial transactions.
 *
 * @param content - Raw QIF text content.
 * @returns An `ImportResult` with parsed transactions and any errors.
 */
export function parseQif(content: string): ImportResult {
  const errors: ImportError[] = [];
  const lines = content.split(/\r?\n/);

  // Extract the first type header for default transaction type.
  let qifType: QifType | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;

    if (line.startsWith('!Type:')) {
      qifType = line.slice(6).trim();
      break;
    }
    if (line.startsWith('!Account')) {
      // Skip account header section until we reach a type line
      continue;
    }
    if (line.startsWith('!Option:')) {
      continue;
    }
    // If first non-empty line isn't a header, the file has no explicit type.
    break;
  }

  if (!qifType) {
    errors.push({
      line: 1,
      message: 'No !Type: header found; assuming Bank type',
      severity: 'warning',
      rawValue: lines[0] || null,
    });
    qifType = 'Bank';
  }

  // Parse records. Start from the top so !Account sections and mid-file !Type
  // switches can attach source account/type metadata to each transaction.
  const records = parseQifRecords(lines, 0, qifType);
  const transactions: ParsedTransaction[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    if (!record.date) {
      errors.push({
        line: null,
        message: `Record #${i + 1}: Missing date (D line)`,
        severity: 'error',
        rawValue: null,
      });
      continue;
    }

    const date = parseQifDate(record.date);
    if (!date) {
      errors.push({
        line: null,
        message: `Record #${i + 1}: Invalid date "${record.date}"`,
        severity: 'error',
        rawValue: record.date,
      });
      continue;
    }

    if (!record.amount) {
      errors.push({
        line: null,
        message: `Record #${i + 1}: Missing amount (T line)`,
        severity: 'error',
        rawValue: null,
      });
      continue;
    }

    const amountCents = parseQifAmount(record.amount);
    if (amountCents === null) {
      errors.push({
        line: null,
        message: `Record #${i + 1}: Invalid amount "${record.amount}"`,
        severity: 'error',
        rawValue: record.amount,
      });
      continue;
    }

    // Extract category (strip subcategory and transfer markers)
    const category = record.category ? extractCategory(record.category) : null;

    const rawFields: Record<string, string> = {};
    if (record.date) rawFields['D'] = record.date;
    if (record.amount) rawFields['T'] = record.amount;
    if (record.payee) rawFields['P'] = record.payee;
    if (record.memo) rawFields['M'] = record.memo;
    if (record.checkNumber) rawFields['N'] = record.checkNumber;
    if (record.category) rawFields['L'] = record.category;
    if (record.clearedStatus) rawFields['C'] = record.clearedStatus;
    if (record.accountName) rawFields['ACCOUNT'] = record.accountName;
    if (record.splits.length > 0) rawFields['SPLITS'] = record.splits.join('\n');
    if (record.address.length > 0) rawFields['A'] = record.address.join('\n');

    transactions.push({
      date,
      amountCents,
      description: record.payee || record.memo || '',
      sourceId: null,
      category,
      checkNumber: record.checkNumber || null,
      type: mapQifType(record.qifType ?? qifType),
      memo: mergeMemoAndAddress(record.memo, record.address),
      balanceCents: null,
      rawFields,
    });
  }

  const accountIds = Array.from(
    new Set(
      records.map((record) => record.accountName).filter((value): value is string => !!value),
    ),
  );

  return {
    format: ImportFormat.QIF,
    transactions,
    errors,
    totalRecords: records.length,
    accountId: accountIds.length > 0 ? accountIds.join(',') : null,
    startDate: transactions.length > 0 ? transactions[0].date : null,
    endDate: transactions.length > 0 ? transactions[transactions.length - 1].date : null,
    currency: null,
  };
}

/**
 * Extract raw QIF records from content lines (exported for testing).
 *
 * @param lines - Array of content lines.
 * @param startLine - 0-based index of the first line to parse.
 * @returns Array of raw QIF records.
 */
export function parseQifRecords(
  lines: readonly string[],
  startLine: number,
  initialType: QifType | null = null,
): QifRecord[] {
  const records: QifRecord[] = [];
  let current = createEmptyRecord(initialType, null);
  let activeType = initialType;
  let activeAccountName: string | null = null;
  let accountSectionName: string | null = null;
  let inAccountSection = false;
  let hasFields = false;

  const flush = () => {
    if (hasFields) {
      records.push({
        ...current,
        address: [...current.address],
        splits: [...current.splits],
      });
    }
    current = createEmptyRecord(activeType, activeAccountName);
    hasFields = false;
  };

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;

    if (line === '^') {
      if (inAccountSection) {
        activeAccountName = accountSectionName;
        accountSectionName = null;
        inAccountSection = false;
        current = createEmptyRecord(activeType, activeAccountName);
        continue;
      }
      flush();
      continue;
    }

    if (/^!Account/i.test(line)) {
      flush();
      inAccountSection = true;
      accountSectionName = null;
      continue;
    }

    if (/^!Type:/i.test(line)) {
      flush();
      activeType = line.slice(6).trim();
      current = createEmptyRecord(activeType, activeAccountName);
      continue;
    }

    if (/^!Option:/i.test(line)) continue;
    if (line.startsWith('!')) continue;

    const code = line[0];
    const value = line.slice(1).trim();

    if (inAccountSection) {
      if (code === 'N') accountSectionName = value;
      continue;
    }

    hasFields = true;

    switch (code) {
      case 'D':
        current.date = value;
        break;
      case 'T':
        current.amount = value;
        break;
      case 'P':
        current.payee = value;
        break;
      case 'M':
        current.memo = appendLine(current.memo, value);
        break;
      case 'N':
        current.checkNumber = value;
        break;
      case 'L':
        current.category = value;
        break;
      case 'C':
        current.clearedStatus = value;
        break;
      case 'A':
        current.address.push(value);
        break;
      case 'S':
      case '$':
      case 'E':
        current.splits.push(`${code}${value}`);
        break;
    }
  }

  flush();
  return records;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createEmptyRecord(
  qifType: QifType | null,
  accountName: string | null,
): {
  date: string | null;
  amount: string | null;
  payee: string | null;
  memo: string | null;
  checkNumber: string | null;
  category: string | null;
  clearedStatus: string | null;
  address: string[];
  accountName: string | null;
  qifType: QifType | null;
  splits: string[];
} {
  return {
    date: null,
    amount: null,
    payee: null,
    memo: null,
    checkNumber: null,
    category: null,
    clearedStatus: null,
    address: [] as string[],
    accountName,
    qifType,
    splits: [] as string[],
  };
}

function appendLine(existing: string | null, value: string): string {
  if (!existing) return value;
  if (!value) return existing;
  return `${existing}\n${value}`;
}

function mergeMemoAndAddress(memo: string | null, address: readonly string[]): string | null {
  const lines = [memo, ...address].filter((value): value is string => Boolean(value?.trim()));
  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Parse a QIF date string into ISO 8601 format (YYYY-MM-DD).
 *
 * QIF dates can be in formats like:
 * - MM/DD/YYYY or M/D/YYYY
 * - MM/DD'YY or M/D'YY
 * - MM-DD-YYYY
 *
 * @param qifDate - Raw QIF date string.
 * @returns ISO 8601 date string, or null if parsing fails.
 */
export function parseQifDate(qifDate: string): string | null {
  const cleaned = qifDate.trim();

  // Handle MM/DD'YY format (apostrophe for 2-digit year)
  const apostropheMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})'(\d{2})$/);
  if (apostropheMatch) {
    const [, m, d, y] = apostropheMatch;
    const year = parseInt(y, 10) >= 70 ? 1900 + parseInt(y, 10) : 2000 + parseInt(y, 10);
    return formatDate(year, parseInt(m, 10), parseInt(d, 10));
  }

  // Handle MM/DD/YYYY or M/D/YYYY or MM/DD/YY
  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    let year = parseInt(y, 10);
    if (y.length === 2) {
      year = year >= 70 ? 1900 + year : 2000 + year;
    }
    return formatDate(year, parseInt(m, 10), parseInt(d, 10));
  }

  // Handle MM-DD-YYYY
  const dashMatch = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, m, d, y] = dashMatch;
    return formatDate(parseInt(y, 10), parseInt(m, 10), parseInt(d, 10));
  }

  return null;
}

/**
 * Parse a QIF amount string into integer cents.
 *
 * QIF amounts can have commas as thousands separators.
 * Uses Banker's rounding for fractional cents.
 *
 * @param qifAmount - Raw QIF amount string.
 * @returns Integer cents, or null if parsing fails.
 */
export function parseQifAmount(qifAmount: string): number | null {
  const cleaned = qifAmount.trim().replace(/,/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return bankersRound(num * 100);
}

/** Format year/month/day into ISO 8601 with validation. */
function formatDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

/**
 * Extract category from QIF L field.
 *
 * Strips transfer markers ([Account]), subcategory separators (:),
 * and class markers (/).
 *
 * @param rawCategory - Raw L-line value.
 * @returns Cleaned category string.
 */
export function extractCategory(rawCategory: string): string {
  let cat = rawCategory.trim();

  // Strip transfer marker: [Account Name]
  if (cat.startsWith('[') && cat.endsWith(']')) {
    return cat.slice(1, -1);
  }

  // Strip class marker: Category/Class
  const slashIdx = cat.indexOf('/');
  if (slashIdx >= 0) {
    cat = cat.slice(0, slashIdx);
  }

  // Keep primary category (before first ':' if subcategory)
  const colonIdx = cat.indexOf(':');
  if (colonIdx >= 0) {
    cat = cat.slice(0, colonIdx);
  }

  return cat.trim();
}

/** Map QIF type header to a general transaction type string. */
function mapQifType(qifType: QifType): string {
  switch (qifType) {
    case 'CCard':
      return 'CREDIT_CARD';
    case 'Invst':
      return 'INVESTMENT';
    case 'Cash':
      return 'CASH';
    case 'Oth A':
      return 'ASSET';
    case 'Oth L':
      return 'LIABILITY';
    case 'Memorized':
      return 'MEMORIZED';
    default:
      return 'BANK';
  }
}
