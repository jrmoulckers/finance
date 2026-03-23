// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { detectDelimiter, parseCsv } from './csv-parser';

// ---------------------------------------------------------------------------
// detectDelimiter
// ---------------------------------------------------------------------------

describe('detectDelimiter', () => {
  it('detects comma as delimiter', () => {
    const csv = 'a,b,c\n1,2,3\n4,5,6';
    expect(detectDelimiter(csv)).toBe(',');
  });

  it('detects semicolon as delimiter', () => {
    const csv = 'a;b;c\n1;2;3\n4;5;6';
    expect(detectDelimiter(csv)).toBe(';');
  });

  it('detects tab as delimiter', () => {
    const csv = 'a\tb\tc\n1\t2\t3\n4\t5\t6';
    expect(detectDelimiter(csv)).toBe('\t');
  });

  it('detects pipe as delimiter', () => {
    const csv = 'a|b|c\n1|2|3\n4|5|6';
    expect(detectDelimiter(csv)).toBe('|');
  });

  it('falls back to comma for empty input', () => {
    expect(detectDelimiter('')).toBe(',');
  });
});

// ---------------------------------------------------------------------------
// parseCsv — basic
// ---------------------------------------------------------------------------

describe('parseCsv', () => {
  it('parses a simple CSV with header', () => {
    const csv = 'Name,Age,City\nAlice,30,NYC\nBob,25,LA';
    const result = parseCsv(csv);

    expect(result.headers).toEqual(['Name', 'Age', 'City']);
    expect(result.rows).toEqual([
      ['Alice', '30', 'NYC'],
      ['Bob', '25', 'LA'],
    ]);
    expect(result.totalRows).toBe(2);
    expect(result.delimiter).toBe(',');
  });

  it('treats all rows as data when hasHeader is false', () => {
    const csv = 'a,b,c\n1,2,3';
    const result = parseCsv(csv, { hasHeader: false });

    expect(result.headers).toEqual([]);
    expect(result.rows).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Quoting
  // -------------------------------------------------------------------------

  it('handles quoted fields with embedded commas', () => {
    const csv = 'Name,Address\n"Doe, Jane","123 Main St, Apt 4"';
    const result = parseCsv(csv);

    expect(result.rows[0]).toEqual(['Doe, Jane', '123 Main St, Apt 4']);
  });

  it('handles quoted fields with embedded newlines', () => {
    const csv = 'Name,Note\n"Alice","Line1\nLine2"\n"Bob","Hello"';
    const result = parseCsv(csv);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(['Alice', 'Line1\nLine2']);
    expect(result.rows[1]).toEqual(['Bob', 'Hello']);
  });

  it('handles escaped quotes (doubled quote chars)', () => {
    const csv = 'Name,Quote\n"Alice","She said ""hello"" to me"';
    const result = parseCsv(csv);

    expect(result.rows[0][1]).toBe('She said "hello" to me');
  });

  // -------------------------------------------------------------------------
  // Whitespace & empty lines
  // -------------------------------------------------------------------------

  it('skips empty lines by default', () => {
    const csv = 'A,B\n\n1,2\n\n3,4\n';
    const result = parseCsv(csv);

    expect(result.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(result.totalRows).toBe(2);
  });

  it('keeps empty lines when skipEmptyLines is false', () => {
    const csv = 'A,B\n\n1,2\n';
    const result = parseCsv(csv, { skipEmptyLines: false });

    // The empty line becomes a row with empty fields.
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('trims values by default', () => {
    const csv = ' Name , Age \n Alice , 30 ';
    const result = parseCsv(csv);

    expect(result.headers).toEqual(['Name', 'Age']);
    expect(result.rows[0]).toEqual(['Alice', '30']);
  });

  it('preserves whitespace when trimValues is false', () => {
    const csv = ' Name , Age \n Alice , 30 ';
    const result = parseCsv(csv, { trimValues: false });

    expect(result.headers).toEqual([' Name ', ' Age ']);
    expect(result.rows[0]).toEqual([' Alice ', ' 30 ']);
  });

  // -------------------------------------------------------------------------
  // Line endings
  // -------------------------------------------------------------------------

  it('handles \\r\\n line endings', () => {
    const csv = 'A,B\r\n1,2\r\n3,4';
    const result = parseCsv(csv);

    expect(result.headers).toEqual(['A', 'B']);
    expect(result.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('handles mixed \\r\\n and \\n line endings', () => {
    const csv = 'A,B\r\n1,2\n3,4';
    const result = parseCsv(csv);

    expect(result.rows).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // maxRows
  // -------------------------------------------------------------------------

  it('respects maxRows option', () => {
    const csv = 'A,B\n1,2\n3,4\n5,6\n7,8';
    const result = parseCsv(csv, { maxRows: 2 });

    expect(result.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
    // totalRows should reflect all rows that were parsed, not just returned.
    expect(result.totalRows).toBe(4);
  });

  // -------------------------------------------------------------------------
  // Delimiter override
  // -------------------------------------------------------------------------

  it('uses the specified delimiter instead of auto-detecting', () => {
    const csv = 'A;B;C\n1;2;3';
    const result = parseCsv(csv, { delimiter: ';' });

    expect(result.delimiter).toBe(';');
    expect(result.headers).toEqual(['A', 'B', 'C']);
    expect(result.rows[0]).toEqual(['1', '2', '3']);
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('handles a single-column CSV', () => {
    const csv = 'Name\nAlice\nBob';
    const result = parseCsv(csv);

    expect(result.headers).toEqual(['Name']);
    expect(result.rows).toEqual([['Alice'], ['Bob']]);
  });

  it('handles empty input', () => {
    const result = parseCsv('');

    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.totalRows).toBe(0);
  });

  it('handles header-only input', () => {
    const csv = 'A,B,C\n';
    const result = parseCsv(csv);

    expect(result.headers).toEqual(['A', 'B', 'C']);
    expect(result.rows).toEqual([]);
    expect(result.totalRows).toBe(0);
  });

  it('handles rows with fewer columns than the header', () => {
    const csv = 'A,B,C\n1,2\n3,4,5';
    const result = parseCsv(csv);

    expect(result.rows[0]).toEqual(['1', '2']);
    expect(result.rows[1]).toEqual(['3', '4', '5']);
  });
});
