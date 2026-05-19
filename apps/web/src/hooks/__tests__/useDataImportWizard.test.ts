// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { parseCsv, detectFormat } from '../useDataImportWizard';

describe('parseCsv', () => {
  it('parses a simple CSV', () => {
    const csv = 'Date,Payee,Amount\n2025-01-15,Store,45.00\n2025-01-16,Gas,30.50';
    const result = parseCsv(csv);

    expect(result.headers).toEqual(['Date', 'Payee', 'Amount']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(['2025-01-15', 'Store', '45.00']);
  });

  it('handles quoted fields with commas', () => {
    const csv = 'Name,Description\n"Smith, John","A ""great"" person"';
    const result = parseCsv(csv);

    expect(result.headers).toEqual(['Name', 'Description']);
    expect(result.rows[0]).toEqual(['Smith, John', 'A "great" person']);
  });

  it('returns empty for empty input', () => {
    const result = parseCsv('');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('handles Windows line endings', () => {
    const csv = 'A,B\r\n1,2\r\n3,4';
    const result = parseCsv(csv);

    expect(result.headers).toEqual(['A', 'B']);
    expect(result.rows).toHaveLength(2);
  });

  it('skips blank lines', () => {
    const csv = 'A,B\n1,2\n\n3,4\n';
    const result = parseCsv(csv);

    expect(result.rows).toHaveLength(2);
  });
});

describe('detectFormat', () => {
  it('detects Mint format', () => {
    const headers = [
      'Date',
      'Description',
      'Original Description',
      'Amount',
      'Transaction Type',
      'Category',
      'Account Name',
      'Labels',
      'Notes',
    ];
    expect(detectFormat(headers)).toBe('mint');
  });

  it('detects YNAB format', () => {
    const headers = ['Date', 'Payee', 'Category', 'Memo', 'Outflow', 'Inflow'];
    expect(detectFormat(headers)).toBe('ynab');
  });

  it('detects generic CSV with date and amount', () => {
    const headers = ['Transaction Date', 'Merchant', 'Total Amount'];
    expect(detectFormat(headers)).toBe('generic');
  });

  it('detects Chase credit card format', () => {
    const headers = ['Transaction Date', 'Post Date', 'Description', 'Category', 'Type', 'Amount'];
    expect(detectFormat(headers)).toBe('chase');
  });

  it('detects American Express format', () => {
    const headers = ['Date', 'Description', 'Amount', 'Extended Details', 'Appears On'];
    expect(detectFormat(headers)).toBe('amex');
  });

  it('detects Wells Fargo format', () => {
    const headers = ['Date', 'Amount', 'Description'];
    expect(detectFormat(headers)).toBe('wellsfargo');
  });

  it('detects Citi card format', () => {
    const headers = ['Status', 'Date', 'Description', 'Debit', 'Credit'];
    expect(detectFormat(headers)).toBe('citi');
  });

  it('returns unknown for unrecognized format', () => {
    const headers = ['foo', 'bar', 'baz'];
    expect(detectFormat(headers)).toBe('unknown');
  });

  it('handles case-insensitive matching', () => {
    const headers = ['DATE', 'DESCRIPTION', 'AMOUNT', 'CATEGORY', 'TRANSACTION TYPE'];
    expect(detectFormat(headers)).toBe('mint');
  });
});
