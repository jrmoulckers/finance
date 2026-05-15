// SPDX-License-Identifier: BUSL-1.1

/**
 * csvParser — CSV parsing utility for financial data import.
 *
 * Handles standard CSV with quoted fields, various delimiters, and common
 * financial CSV edge cases (commas in amounts, quoted descriptions).
 *
 * @module utils/csvParser
 * References: issue #1339
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for CSV parsing. */
export interface CsvParseOptions {
  /** Field delimiter character. Defaults to ','. */
  delimiter?: string;

  /** Whether the first row is a header row. Defaults to true. */
  hasHeader?: boolean;

  /** Maximum number of rows to parse (excluding header). 0 = unlimited. */
  maxRows?: number;
}

/** The result of parsing a CSV string. */
export interface CsvParseResult {
  /** Column headers (from first row or auto-generated). */
  headers: string[];

  /** Data rows as arrays of string values. */
  rows: string[][];

  /** Total number of data rows parsed. */
  rowCount: number;

  /** Any parsing errors encountered (row index + message). */
  errors: CsvParseError[];
}

/** A parsing error tied to a specific row. */
export interface CsvParseError {
  /** Zero-based row index (in the data rows, not including header). */
  row: number;

  /** Human-readable error description. */
  message: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Parse a single CSV line, handling quoted fields correctly.
 *
 * Supports fields with embedded delimiters, newlines (within quotes),
 * and escaped quotes (doubled: "").
 */
export function parseCsvLine(line: string, delimiter: string = ','): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      current += char;
      i++;
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        fields.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  // Push the last field
  fields.push(current.trim());
  return fields;
}

/**
 * Auto-detect the delimiter used in a CSV string.
 *
 * Checks the first line for common delimiters and returns the one
 * that produces the most fields.
 */
export function detectDelimiter(content: string): string {
  const firstLine = content.split('\n')[0] ?? '';
  const candidates = [',', ';', '\t', '|'];

  let bestDelimiter = ',';
  let maxFields = 0;

  for (const d of candidates) {
    const fields = parseCsvLine(firstLine, d);
    if (fields.length > maxFields) {
      maxFields = fields.length;
      bestDelimiter = d;
    }
  }

  return bestDelimiter;
}

/**
 * Parse a CSV string into structured data.
 *
 * @param content - Raw CSV text content
 * @param options - Parsing options
 * @returns Parsed headers, rows, and any errors
 */
export function parseCsv(content: string, options: CsvParseOptions = {}): CsvParseResult {
  const { delimiter = detectDelimiter(content), hasHeader = true, maxRows = 0 } = options;

  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [], rowCount: 0, errors: [] };
  }

  const errors: CsvParseError[] = [];

  // Parse header
  let headers: string[];
  let dataStartIndex: number;

  if (hasHeader) {
    headers = parseCsvLine(lines[0], delimiter);
    dataStartIndex = 1;
  } else {
    // Auto-generate column headers
    const firstRow = parseCsvLine(lines[0], delimiter);
    headers = firstRow.map((_, i) => `Column ${i + 1}`);
    dataStartIndex = 0;
  }

  const expectedColumns = headers.length;

  // Parse data rows
  const rows: string[][] = [];
  const end = maxRows > 0 ? Math.min(dataStartIndex + maxRows, lines.length) : lines.length;

  for (let i = dataStartIndex; i < end; i++) {
    const row = parseCsvLine(lines[i], delimiter);
    const dataRowIndex = i - dataStartIndex;

    if (row.length !== expectedColumns) {
      errors.push({
        row: dataRowIndex,
        message: `Expected ${expectedColumns} columns but found ${row.length}`,
      });
    }

    rows.push(row);
  }

  return {
    headers,
    rows,
    rowCount: rows.length,
    errors,
  };
}

/**
 * Auto-detect column mappings for common financial CSV column names.
 *
 * Returns a mapping from standard fields to header indices.
 */
export function autoDetectColumns(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};

  const patterns: Record<string, RegExp> = {
    date: /^(date|trans(action)?[\s_-]?date|posted|booking[\s_-]?date)$/i,
    description: /^(description|memo|narrative|payee|details?|name)$/i,
    amount: /^(amount|value|sum|total|debit|credit)$/i,
    category: /^(category|type|group|classification)$/i,
    notes: /^(notes?|comment|reference|ref)$/i,
  };

  for (const [field, regex] of Object.entries(patterns)) {
    const index = headers.findIndex((h) => regex.test(h.trim()));
    if (index !== -1) {
      mapping[field] = index;
    }
  }

  return mapping;
}
