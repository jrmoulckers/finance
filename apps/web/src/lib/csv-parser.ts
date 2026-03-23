// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure-TypeScript CSV parser with auto-delimiter detection.
 *
 * Handles RFC 4180 edge cases: quoted fields with embedded delimiters,
 * embedded newlines, and escaped double-quote characters (`""`).
 *
 * No external dependencies — all string parsing is done manually.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CsvParseOptions {
  /** Column delimiter character. Auto-detected when omitted. */
  delimiter?: string;
  /** Quote character wrapping fields. @default '"' */
  quoteChar?: string;
  /** Whether the first row is a header row. @default true */
  hasHeader?: boolean;
  /** Drop rows that are entirely empty. @default true */
  skipEmptyLines?: boolean;
  /** Trim leading/trailing whitespace from every cell value. @default true */
  trimValues?: boolean;
  /** Stop after this many *data* rows (headers excluded). */
  maxRows?: number;
}

export interface CsvParseResult {
  /** Column headers (empty array when `hasHeader` is false). */
  headers: string[];
  /** Data rows — each inner array has one element per column. */
  rows: string[][];
  /** Total number of data rows parsed (before `maxRows` cap). */
  totalRows: number;
  /** The delimiter that was actually used (useful when auto-detected). */
  delimiter: string;
}

// ---------------------------------------------------------------------------
// Delimiter detection
// ---------------------------------------------------------------------------

const CANDIDATE_DELIMITERS = [',', ';', '\t', '|'] as const;

/**
 * Heuristically detect the delimiter used in a CSV text by counting
 * occurrences of each candidate delimiter in the first five lines
 * (outside of quoted regions) and picking the one that appears most
 * frequently **and** most consistently across lines.
 */
export function detectDelimiter(text: string): string {
  // Grab up to the first 5 lines for sampling (handle both \r\n and \n).
  const sampleLines = getSampleLines(text, 5);

  if (sampleLines.length === 0) {
    return ',';
  }

  let bestDelimiter = ',';
  let bestScore = -1;

  for (const delim of CANDIDATE_DELIMITERS) {
    const counts = sampleLines.map((line) => countUnquotedOccurrences(line, delim));
    const minCount = Math.min(...counts);

    // A good delimiter appears at least once in every sample line and the
    // minimum per-line count is as high as possible (consistency).
    if (minCount > 0 && minCount > bestScore) {
      bestScore = minCount;
      bestDelimiter = delim;
    }
  }

  // Fallback: if no candidate appeared in every line, pick the one with the
  // highest total count across all sample lines.
  if (bestScore <= 0) {
    let bestTotal = 0;
    for (const delim of CANDIDATE_DELIMITERS) {
      const total = sampleLines.reduce(
        (sum, line) => sum + countUnquotedOccurrences(line, delim),
        0,
      );
      if (total > bestTotal) {
        bestTotal = total;
        bestDelimiter = delim;
      }
    }
  }

  return bestDelimiter;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a CSV string into structured rows and (optional) headers.
 *
 * Supports:
 * - Quoted fields containing the delimiter, newlines and escaped quotes (`""`)
 * - Auto-detection of delimiter when not specified
 * - Both `\r\n` and `\n` line endings
 * - Optional row limit via `maxRows`
 */
export function parseCsv(text: string, options?: CsvParseOptions): CsvParseResult {
  const quoteChar = options?.quoteChar ?? '"';
  const hasHeader = options?.hasHeader ?? true;
  const skipEmptyLines = options?.skipEmptyLines ?? true;
  const trimValues = options?.trimValues ?? true;
  const maxRows = options?.maxRows;

  const delimiter = options?.delimiter ?? detectDelimiter(text);

  // Parse all fields using a character-level state machine so we correctly
  // handle quoted fields that span multiple lines.
  const allRows = parseRows(text, delimiter, quoteChar);

  // Post-process: trim, skip empty lines, extract headers.
  let headers: string[] = [];
  const dataRows: string[][] = [];
  let headerExtracted = false;
  let totalRows = 0;

  for (const row of allRows) {
    // Apply trimming first.
    const processed = trimValues ? row.map((v) => v.trim()) : row;

    // Check for empty-line skip.
    if (skipEmptyLines && isEmptyRow(processed)) {
      continue;
    }

    if (hasHeader && !headerExtracted) {
      headers = processed;
      headerExtracted = true;
      continue;
    }

    totalRows++;

    if (maxRows === undefined || dataRows.length < maxRows) {
      dataRows.push(processed);
    }
  }

  return { headers, rows: dataRows, totalRows, delimiter };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Character-level state-machine parser. Returns every row (including headers)
 * as an array of raw field strings.
 */
function parseRows(text: string, delimiter: string, quoteChar: string): string[][] {
  const rows: string[][] = [];
  let currentField = '';
  let currentRow: string[] = [];
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === quoteChar) {
        // Look ahead for escaped quote (doubled quote char).
        if (i + 1 < text.length && text[i + 1] === quoteChar) {
          currentField += quoteChar;
          i += 2;
          continue;
        }
        // Closing quote.
        inQuotes = false;
        i++;
        continue;
      }
      // Any other character inside quotes — keep as-is (including newlines).
      currentField += ch;
      i++;
      continue;
    }

    // Not inside quotes.
    if (ch === quoteChar) {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === delimiter) {
      currentRow.push(currentField);
      currentField = '';
      i++;
      continue;
    }

    // Newline handling (\r\n or \n).
    if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
      currentRow.push(currentField);
      currentField = '';
      rows.push(currentRow);
      currentRow = [];
      i += 2;
      continue;
    }
    if (ch === '\n') {
      currentRow.push(currentField);
      currentField = '';
      rows.push(currentRow);
      currentRow = [];
      i++;
      continue;
    }

    currentField += ch;
    i++;
  }

  // Flush the last field/row if anything remains.
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

/** Grab up to `count` logical lines from the text (outside quotes). */
function getSampleLines(text: string, count: number): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }

    if (!inQuotes && (ch === '\n' || (ch === '\r' && text[i + 1] === '\n'))) {
      if (current.trim().length > 0) {
        lines.push(current);
        if (lines.length >= count) break;
      }
      current = '';
      if (ch === '\r') i++; // skip \n in \r\n
      continue;
    }

    current += ch;
  }

  // Tail
  if (current.trim().length > 0 && lines.length < count) {
    lines.push(current);
  }

  return lines;
}

/** Count how many times `char` appears outside of quoted regions in `line`. */
function countUnquotedOccurrences(line: string, char: string): number {
  let count = 0;
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && line[i] === char) {
      count++;
    }
  }

  return count;
}

/** A row is "empty" if it has no fields, or all fields are empty strings. */
function isEmptyRow(row: string[]): boolean {
  return row.length === 0 || row.every((f) => f === '');
}
