// SPDX-License-Identifier: BUSL-1.1

/**
 * Validation and transformation layer for CSV-imported transactions.
 *
 * Converts loosely-typed `RawImportRow` objects (raw strings from the CSV)
 * into fully-typed `CreateTransactionInput` values, reporting per-row errors
 * and non-blocking warnings.
 */

import type { TransactionType, TransactionStatus, LocalDate } from '@/kmp/bridge';
import type { RawImportRow } from './csv-column-mapper';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Mirrors the KMP `CreateTransactionInput` type from the bridge.
 * Defined locally so the CSV import module does not tightly couple to a
 * generated KMP artefact that may not yet exist in the JS target.
 */
export interface CreateTransactionInput {
  householdId: string;
  accountId: string;
  categoryId?: string | null;
  type: TransactionType;
  status?: TransactionStatus;
  amount: { amount: number }; // in cents
  currency?: { code: string; decimalPlaces: number };
  payee?: string | null;
  note?: string | null;
  date: LocalDate;
  tags?: readonly string[];
}

/** A successfully validated row, ready for insertion. */
export interface ValidatedRow {
  data: CreateTransactionInput;
  /** Original CSV row number (for user-facing feedback). */
  rowIndex: number;
  /** Non-blocking issues (e.g. "description was empty — used payee instead"). */
  warnings: string[];
}

/** A row that failed validation. */
export interface ValidationError {
  rowIndex: number;
  field: string;
  message: string;
}

/** Aggregate result of validating all import rows. */
export interface ValidationResult {
  valid: ValidatedRow[];
  errors: ValidationError[];
  totalRows: number;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Validate and transform an array of raw import rows into
 * `CreateTransactionInput` objects.
 *
 * Every row is validated independently — a single bad row will not prevent
 * the rest from being imported.
 */
export function validateImportRows(
  rows: RawImportRow[],
  accountId: string,
  householdId: string,
): ValidationResult {
  const valid: ValidatedRow[] = [];
  const errors: ValidationError[] = [];

  for (const row of rows) {
    const warnings: string[] = [];
    const rowErrors: ValidationError[] = [];

    // --- Date (required) ---------------------------------------------------
    const parsedDate = row.date ? parseDate(row.date.trim()) : null;
    if (!parsedDate) {
      rowErrors.push({
        rowIndex: row.rowIndex,
        field: 'date',
        message: row.date ? `Unable to parse date "${row.date}"` : 'Date is required',
      });
    }

    // --- Amount (required) -------------------------------------------------
    const parsedAmount = row.amount ? parseAmount(row.amount.trim()) : null;
    if (parsedAmount === null) {
      rowErrors.push({
        rowIndex: row.rowIndex,
        field: 'amount',
        message: row.amount ? `Unable to parse amount "${row.amount}"` : 'Amount is required',
      });
    }

    // If we have fatal errors, skip this row entirely.
    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    // Non-null assertions are safe here — we'd have pushed errors above.
    const amountCents = parsedAmount!;
    const date = parsedDate!;

    // --- Type inference (EXPENSE / INCOME) ---------------------------------
    let txType: TransactionType;
    if (row.type) {
      const upper = row.type.trim().toUpperCase();
      if (upper === 'EXPENSE' || upper === 'INCOME' || upper === 'TRANSFER') {
        txType = upper as TransactionType;
      } else {
        txType = amountCents < 0 ? 'EXPENSE' : 'INCOME';
        warnings.push(`Unknown type "${row.type}" — defaulting to ${txType}`);
      }
    } else {
      txType = amountCents < 0 ? 'EXPENSE' : 'INCOME';
    }

    // Store absolute value — the type field carries the sign semantics.
    const absoluteCents = Math.abs(amountCents);

    // --- Description / payee fallback --------------------------------------
    const payee: string | null = row.payee?.trim() || null;
    let description: string | null = row.description?.trim() || null;

    if (!description && payee) {
      description = payee;
      warnings.push('Description was empty — used payee instead');
    }
    if (!description) {
      description = 'Imported transaction';
      warnings.push('Description was empty — set to "Imported transaction"');
    }

    // --- Tags --------------------------------------------------------------
    const tags: string[] = row.tags
      ? row.tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : [];

    // --- Assemble result ---------------------------------------------------
    const input: CreateTransactionInput = {
      householdId,
      accountId,
      type: txType,
      status: 'CLEARED' as TransactionStatus,
      amount: { amount: absoluteCents },
      date,
      payee: payee || description,
      note: row.note?.trim() || null,
      tags: tags.length > 0 ? tags : undefined,
    };

    if (row.category?.trim()) {
      // Category mapping would happen at a higher layer (matching name→id).
      // For now we pass the raw string through so the UI can resolve it.
      input.categoryId = row.category.trim();
    }

    valid.push({ data: input, rowIndex: row.rowIndex, warnings });
  }

  return { valid, errors, totalRows: rows.length };
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

/**
 * Attempt to parse a date string in one of several common formats:
 * - ISO 8601:  YYYY-MM-DD
 * - US:        MM/DD/YYYY
 * - EU slash:  DD/MM/YYYY  (ambiguous with US — see note below)
 * - EU dot:    DD.MM.YYYY
 *
 * Ambiguity note: When day ≤ 12 the US and EU slash formats are ambiguous.
 * We first try to detect the format heuristically (DD > 12 → EU, MM > 12 →
 * impossible, assume US) and fall back to US when truly ambiguous.
 */
export function parseDate(raw: string): LocalDate | null {
  if (!raw) return null;

  // ISO 8601: YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return buildDate(Number(y), Number(m), Number(d));
  }

  // Dot-separated: DD.MM.YYYY (European convention)
  const dotMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
  if (dotMatch) {
    const [, d, m, y] = dotMatch;
    return buildDate(Number(y), Number(m), Number(d));
  }

  // Slash-separated: either MM/DD/YYYY (US) or DD/MM/YYYY (EU)
  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (slashMatch) {
    const a = Number(slashMatch[1]);
    const b = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);

    // Disambiguate: if first part > 12 it *must* be a day (EU format).
    if (a > 12) {
      return buildDate(year, b, a); // DD/MM/YYYY
    }
    // If second part > 12 it *must* be a day (US format).
    if (b > 12) {
      return buildDate(year, a, b); // MM/DD/YYYY
    }
    // Ambiguous — default to US convention.
    return buildDate(year, a, b);
  }

  return null;
}

function buildDate(year: number, month: number, day: number): LocalDate | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
    return null;
  }
  // Validate day for the given month using native Date.
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Amount parsing
// ---------------------------------------------------------------------------

/**
 * Parse a monetary amount string into an integer number of cents.
 *
 * Supported patterns:
 * - Plain:         `1234.56`  → 123456
 * - Currency sym:  `$1,234.56` → 123456
 * - EU notation:   `1.234,56`  → 123456
 * - Negative:      `-45.99`   → -4599
 * - Parenthetical: `(45.99)`  → -4599  (accounting negative notation)
 */
export function parseAmount(raw: string): number | null {
  if (!raw) return null;

  let text = raw.trim();

  // Detect parenthetical negatives: (123.45)
  let negative = false;
  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true;
    text = text.slice(1, -1).trim();
  }

  // Strip currency symbols and whitespace.
  text = text.replace(/^[^\d\-+(.,]*/, '').replace(/[^\d.,-]$/, '');

  // Detect leading minus.
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1).trim();
  } else if (text.startsWith('+')) {
    text = text.slice(1).trim();
  }

  // Strip remaining non-numeric characters except . and ,
  text = text.replace(/[^\d.,]/g, '');

  if (text === '') return null;

  // Determine decimal separator heuristically:
  // If both . and , are present, the last one is the decimal separator.
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');

  let wholePart: string;
  let decimalPart: string;

  if (lastComma > lastDot) {
    // Comma is the decimal separator (EU): "1.234,56"
    wholePart = text.substring(0, lastComma).replace(/[.,]/g, '');
    decimalPart = text.substring(lastComma + 1);
  } else if (lastDot > lastComma) {
    // Dot is the decimal separator (US/UK): "1,234.56"
    wholePart = text.substring(0, lastDot).replace(/[.,]/g, '');
    decimalPart = text.substring(lastDot + 1);
  } else {
    // No decimal separator at all — treat the entire thing as whole units.
    wholePart = text.replace(/[.,]/g, '');
    decimalPart = '';
  }

  // Convert to cents: pad or truncate decimal part to 2 digits.
  if (decimalPart.length === 0) {
    decimalPart = '00';
  } else if (decimalPart.length === 1) {
    decimalPart = decimalPart + '0';
  } else if (decimalPart.length > 2) {
    decimalPart = decimalPart.substring(0, 2);
  }

  const cents = Number(wholePart + decimalPart);
  if (Number.isNaN(cents)) return null;

  return negative ? -cents : cents;
}
