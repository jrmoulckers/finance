// SPDX-License-Identifier: BUSL-1.1

/**
 * CSV column mapping utilities.
 *
 * Provides intelligent column-name → transaction-field suggestions for common
 * bank export formats (English, German, generic) and an `applyMapping` helper
 * that projects raw CSV rows into typed `RawImportRow` objects.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Transaction fields that a CSV column can map to. */
export type TransactionField =
  | 'date'
  | 'amount'
  | 'description'
  | 'payee'
  | 'category'
  | 'type'
  | 'note'
  | 'tags';

/** Map from zero-based CSV column index to a transaction field. */
export interface ColumnMapping {
  [csvColumnIndex: number]: TransactionField;
}

/** A single auto-suggested mapping with a confidence score. */
export interface MappingSuggestion {
  /** Zero-based column index in the CSV. */
  columnIndex: number;
  /** The original header text from the CSV. */
  columnHeader: string;
  /** The transaction field this column likely maps to. */
  suggestedField: TransactionField;
  /** Confidence score from 0.0 (guess) to 1.0 (certain). */
  confidence: number;
}

/**
 * A loosely-typed row produced by `applyMapping` — all values are still
 * raw strings so downstream validation can parse/coerce them.
 */
export interface RawImportRow {
  date?: string;
  amount?: string;
  description?: string;
  payee?: string;
  category?: string;
  type?: string;
  note?: string;
  tags?: string;
  /** Original CSV row number (1-based, relative to data rows) for error reporting. */
  rowIndex: number;
}

// ---------------------------------------------------------------------------
// Pattern database
// ---------------------------------------------------------------------------

interface FieldPattern {
  field: TransactionField;
  /** Exact matches (after normalisation) receive `exactConfidence`. */
  exact: string[];
  /** Partial/substring matches receive `partialConfidence`. */
  partial: string[];
  exactConfidence: number;
  partialConfidence: number;
}

const FIELD_PATTERNS: FieldPattern[] = [
  {
    field: 'date',
    exact: [
      'date',
      'transaction date',
      'trans date',
      'posted date',
      'posting date',
      'booking date',
      'value date',
      'datum',
      'buchungstag',
    ],
    partial: ['date', 'datum'],
    exactConfidence: 1.0,
    partialConfidence: 0.7,
  },
  {
    field: 'amount',
    exact: ['amount', 'value', 'debit', 'credit', 'sum', 'betrag', 'total', 'transaction amount'],
    partial: ['amount', 'betrag', 'value', 'debit', 'credit', 'sum'],
    exactConfidence: 1.0,
    partialConfidence: 0.7,
  },
  {
    field: 'description',
    exact: [
      'description',
      'memo',
      'details',
      'reference',
      'narrative',
      'bezeichnung',
      'verwendungszweck',
      'transaction description',
    ],
    partial: ['desc', 'memo', 'detail', 'narrative', 'reference', 'bezeichnung'],
    exactConfidence: 1.0,
    partialConfidence: 0.6,
  },
  {
    field: 'payee',
    exact: ['payee', 'merchant', 'vendor', 'recipient', 'name', 'beneficiary'],
    partial: ['payee', 'merchant', 'vendor', 'recipient'],
    exactConfidence: 1.0,
    partialConfidence: 0.6,
  },
  {
    field: 'category',
    exact: ['category', 'class', 'gruppe', 'kategorie'],
    partial: ['category', 'categor', 'gruppe', 'class'],
    exactConfidence: 1.0,
    partialConfidence: 0.6,
  },
  {
    field: 'type',
    exact: ['type', 'transaction type', 'trans type'],
    partial: ['type'],
    exactConfidence: 0.8,
    partialConfidence: 0.4,
  },
  {
    field: 'note',
    exact: ['note', 'notes', 'comment', 'comments', 'remark', 'remarks'],
    partial: ['note', 'comment', 'remark'],
    exactConfidence: 1.0,
    partialConfidence: 0.6,
  },
  {
    field: 'tags',
    exact: ['tags', 'tag', 'labels', 'label'],
    partial: ['tag', 'label'],
    exactConfidence: 1.0,
    partialConfidence: 0.6,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Given a list of CSV header strings, return a mapping suggestion for each
 * header that could plausibly map to a `TransactionField`.
 *
 * Matching is case-insensitive. Exact matches win over partial matches.
 * Each transaction field is assigned to at most one column (the highest
 * scoring one).
 */
export function suggestMappings(headers: string[]): MappingSuggestion[] {
  // Build a scored candidate list for every (column, field) pair.
  const candidates: MappingSuggestion[] = [];

  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeHeader(headers[i]);

    for (const pattern of FIELD_PATTERNS) {
      // Try exact match first.
      if (pattern.exact.includes(normalized)) {
        candidates.push({
          columnIndex: i,
          columnHeader: headers[i],
          suggestedField: pattern.field,
          confidence: pattern.exactConfidence,
        });
        continue;
      }

      // Try partial / substring match.
      const hasPartial = pattern.partial.some(
        (p) => normalized.includes(p) || p.includes(normalized),
      );
      if (hasPartial) {
        candidates.push({
          columnIndex: i,
          columnHeader: headers[i],
          suggestedField: pattern.field,
          confidence: pattern.partialConfidence,
        });
      }
    }
  }

  // Sort by confidence descending so greedy assignment favours best matches.
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Greedy 1-to-1 assignment: each field and each column used at most once.
  const assignedFields = new Set<TransactionField>();
  const assignedColumns = new Set<number>();
  const result: MappingSuggestion[] = [];

  for (const c of candidates) {
    if (assignedFields.has(c.suggestedField) || assignedColumns.has(c.columnIndex)) {
      continue;
    }
    assignedFields.add(c.suggestedField);
    assignedColumns.add(c.columnIndex);
    result.push(c);
  }

  // Sort output by column index for deterministic ordering.
  result.sort((a, b) => a.columnIndex - b.columnIndex);

  return result;
}

/**
 * Apply a column mapping to raw CSV rows, producing `RawImportRow` objects
 * that can be fed into the validation layer.
 */
export function applyMapping(
  rows: string[][],
  mapping: ColumnMapping,
  _headers: string[],
): RawImportRow[] {
  return rows.map((row, idx) => {
    const importRow: RawImportRow = { rowIndex: idx + 1 };

    for (const [colIndexStr, field] of Object.entries(mapping) as [string, TransactionField][]) {
      const colIndex = Number(colIndexStr);
      const value = colIndex < row.length ? row[colIndex] : undefined;
      if (value !== undefined && value !== '') {
        (importRow as unknown as Record<string, string | number>)[field] = value;
      }
    }

    return importRow;
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a header string for matching: lowercase, collapse whitespace,
 * strip non-alphanumeric characters except spaces.
 */
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
