// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { parseCsv, parseCsvLine, detectDelimiter, autoDetectColumns } from './csvParser';

// ---------------------------------------------------------------------------
// parseCsvLine
// ---------------------------------------------------------------------------

describe('parseCsvLine', () => {
  it('parses simple comma-separated values', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields', () => {
    expect(parseCsvLine('"hello, world",b,c')).toEqual(['hello, world', 'b', 'c']);
  });

  it('handles escaped quotes within quoted fields', () => {
    expect(parseCsvLine('"say ""hello""",b')).toEqual(['say "hello"', 'b']);
  });

  it('trims whitespace from fields', () => {
    expect(parseCsvLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
  });

  it('uses custom delimiter', () => {
    expect(parseCsvLine('a;b;c', ';')).toEqual(['a', 'b', 'c']);
  });

  it('handles empty fields', () => {
    expect(parseCsvLine('a,,c')).toEqual(['a', '', 'c']);
  });
});

// ---------------------------------------------------------------------------
// detectDelimiter
// ---------------------------------------------------------------------------

describe('detectDelimiter', () => {
  it('detects comma delimiter', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
  });

  it('detects semicolon delimiter', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
  });

  it('detects tab delimiter', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });

  it('defaults to comma for ambiguous input', () => {
    expect(detectDelimiter('single')).toBe(',');
  });
});

// ---------------------------------------------------------------------------
// parseCsv
// ---------------------------------------------------------------------------

describe('parseCsv', () => {
  it('parses CSV with header row', () => {
    const csv = 'Date,Description,Amount\n2024-01-15,Coffee,-4.50\n2024-01-16,Salary,3000';

    const result = parseCsv(csv);

    expect(result.headers).toEqual(['Date', 'Description', 'Amount']);
    expect(result.rows).toEqual([
      ['2024-01-15', 'Coffee', '-4.50'],
      ['2024-01-16', 'Salary', '3000'],
    ]);
    expect(result.rowCount).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it('parses CSV without header row', () => {
    const csv = '2024-01-15,Coffee,-4.50';

    const result = parseCsv(csv, { hasHeader: false });

    expect(result.headers).toEqual(['Column 1', 'Column 2', 'Column 3']);
    expect(result.rows).toEqual([['2024-01-15', 'Coffee', '-4.50']]);
  });

  it('limits rows with maxRows option', () => {
    const csv = 'H1,H2\na,1\nb,2\nc,3\nd,4';

    const result = parseCsv(csv, { maxRows: 2 });

    expect(result.rowCount).toBe(2);
    expect(result.rows).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });

  it('reports column count mismatches as errors', () => {
    const csv = 'A,B,C\n1,2,3\n4,5\n6,7,8';

    const result = parseCsv(csv);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(1);
    expect(result.errors[0].message).toContain('Expected 3 columns but found 2');
  });

  it('handles empty input', () => {
    const result = parseCsv('');

    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it('handles quoted fields with commas', () => {
    const csv = 'Description,Amount\n"Coffee, large",-4.50';

    const result = parseCsv(csv);

    expect(result.rows[0][0]).toBe('Coffee, large');
  });

  it('skips blank lines', () => {
    const csv = 'A,B\n1,2\n\n3,4\n';

    const result = parseCsv(csv);

    expect(result.rowCount).toBe(2);
  });

  it('handles Windows line endings', () => {
    const csv = 'A,B\r\n1,2\r\n3,4';

    const result = parseCsv(csv);

    expect(result.rowCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// autoDetectColumns
// ---------------------------------------------------------------------------

describe('autoDetectColumns', () => {
  it('detects common financial column names', () => {
    const headers = ['Date', 'Description', 'Amount', 'Category'];
    const mapping = autoDetectColumns(headers);

    expect(mapping.date).toBe(0);
    expect(mapping.description).toBe(1);
    expect(mapping.amount).toBe(2);
    expect(mapping.category).toBe(3);
  });

  it('handles alternative column names', () => {
    const headers = ['Transaction Date', 'Memo', 'Debit', 'Notes'];
    const mapping = autoDetectColumns(headers);

    expect(mapping.date).toBe(0);
    expect(mapping.description).toBe(1);
    expect(mapping.amount).toBe(2);
    expect(mapping.notes).toBe(3);
  });

  it('returns empty mapping for unrecognized headers', () => {
    const headers = ['Foo', 'Bar', 'Baz'];
    const mapping = autoDetectColumns(headers);

    expect(Object.keys(mapping)).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    const headers = ['DATE', 'DESCRIPTION', 'AMOUNT'];
    const mapping = autoDetectColumns(headers);

    expect(mapping.date).toBe(0);
    expect(mapping.description).toBe(1);
    expect(mapping.amount).toBe(2);
  });
});
