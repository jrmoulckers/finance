// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { suggestMappings, applyMapping, type ColumnMapping } from './csv-column-mapper';
import { validateImportRows, parseDate, parseAmount } from './csv-import-validator';
import { detectDuplicates } from './csv-duplicate-detector';
import type { Transaction } from '@/kmp/bridge';
import type { ValidatedRow } from './csv-import-validator';

// ---------------------------------------------------------------------------
// Column mapping suggestions
// ---------------------------------------------------------------------------

describe('suggestMappings', () => {
  it('maps common English bank export headers', () => {
    const headers = ['Date', 'Amount', 'Description', 'Payee', 'Category'];
    const suggestions = suggestMappings(headers);

    const fieldMap = Object.fromEntries(suggestions.map((s) => [s.suggestedField, s.columnHeader]));

    expect(fieldMap['date']).toBe('Date');
    expect(fieldMap['amount']).toBe('Amount');
    expect(fieldMap['description']).toBe('Description');
    expect(fieldMap['payee']).toBe('Payee');
    expect(fieldMap['category']).toBe('Category');
  });

  it('maps German bank export headers', () => {
    const headers = ['Buchungstag', 'Betrag', 'Bezeichnung', 'Gruppe'];
    const suggestions = suggestMappings(headers);

    const fieldMap = Object.fromEntries(suggestions.map((s) => [s.suggestedField, s.columnHeader]));

    expect(fieldMap['date']).toBe('Buchungstag');
    expect(fieldMap['amount']).toBe('Betrag');
    expect(fieldMap['description']).toBe('Bezeichnung');
    expect(fieldMap['category']).toBe('Gruppe');
  });

  it('handles case-insensitive matching', () => {
    const headers = ['DATE', 'AMOUNT', 'DESCRIPTION'];
    const suggestions = suggestMappings(headers);

    expect(suggestions).toHaveLength(3);
    expect(suggestions.some((s) => s.suggestedField === 'date')).toBe(true);
  });

  it('handles partial matches like "Transaction Date"', () => {
    const headers = ['Transaction Date', 'Transaction Amount'];
    const suggestions = suggestMappings(headers);

    const fields = suggestions.map((s) => s.suggestedField);
    expect(fields).toContain('date');
    expect(fields).toContain('amount');
  });

  it('assigns each field to at most one column', () => {
    const headers = ['Date', 'Posted Date', 'Amount'];
    const suggestions = suggestMappings(headers);

    const dateSuggestions = suggestions.filter((s) => s.suggestedField === 'date');
    expect(dateSuggestions).toHaveLength(1);
  });

  it('returns suggestions with confidence scores between 0 and 1', () => {
    const headers = ['Date', 'Amount', 'Notes'];
    const suggestions = suggestMappings(headers);

    for (const s of suggestions) {
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// applyMapping
// ---------------------------------------------------------------------------

describe('applyMapping', () => {
  it('projects CSV rows into RawImportRow objects', () => {
    const headers = ['Date', 'Amount', 'Payee'];
    const rows = [
      ['2024-01-15', '42.50', 'ACME Corp'],
      ['2024-01-16', '-15.00', 'Coffee Shop'],
    ];
    const mapping: ColumnMapping = { 0: 'date', 1: 'amount', 2: 'payee' };

    const result = applyMapping(rows, mapping, headers);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: '2024-01-15',
      amount: '42.50',
      payee: 'ACME Corp',
      rowIndex: 1,
    });
    expect(result[1].rowIndex).toBe(2);
  });

  it('handles missing columns gracefully', () => {
    const rows = [['2024-01-15']];
    const mapping: ColumnMapping = { 0: 'date', 1: 'amount' };

    const result = applyMapping(rows, mapping, ['Date', 'Amount']);

    expect(result[0].date).toBe('2024-01-15');
    expect(result[0].amount).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

describe('parseDate', () => {
  it('parses ISO format (YYYY-MM-DD)', () => {
    expect(parseDate('2024-01-15')).toBe('2024-01-15');
  });

  it('parses US format (MM/DD/YYYY)', () => {
    expect(parseDate('01/15/2024')).toBe('2024-01-15');
  });

  it('parses EU dot format (DD.MM.YYYY)', () => {
    expect(parseDate('15.01.2024')).toBe('2024-01-15');
  });

  it('parses EU slash format when day > 12 (DD/MM/YYYY)', () => {
    expect(parseDate('25/01/2024')).toBe('2024-01-25');
  });

  it('defaults to US format when ambiguous (MM/DD/YYYY)', () => {
    // 03/04/2024 is ambiguous — should default to US: March 4th
    expect(parseDate('03/04/2024')).toBe('2024-03-04');
  });

  it('returns null for invalid dates', () => {
    expect(parseDate('not-a-date')).toBeNull();
    expect(parseDate('2024-13-01')).toBeNull(); // month 13
    expect(parseDate('2024-02-30')).toBeNull(); // Feb 30
    expect(parseDate('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Amount parsing
// ---------------------------------------------------------------------------

describe('parseAmount', () => {
  it('parses plain decimal amounts', () => {
    expect(parseAmount('1234.56')).toBe(123456);
  });

  it('parses amounts with currency symbol', () => {
    expect(parseAmount('$1,234.56')).toBe(123456);
  });

  it('parses negative amounts', () => {
    expect(parseAmount('-45.99')).toBe(-4599);
  });

  it('parses EU notation (comma as decimal separator)', () => {
    expect(parseAmount('1.234,56')).toBe(123456);
  });

  it('parses amounts without decimal part', () => {
    expect(parseAmount('100')).toBe(10000);
  });

  it('parses parenthetical negatives', () => {
    expect(parseAmount('(45.99)')).toBe(-4599);
  });

  it('parses amounts with single decimal digit', () => {
    expect(parseAmount('10.5')).toBe(1050);
  });

  it('returns null for empty or invalid input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateImportRows
// ---------------------------------------------------------------------------

describe('validateImportRows', () => {
  const accountId = 'acc-1';
  const householdId = 'hh-1';

  it('validates rows with date and amount', () => {
    const rows = [{ date: '2024-03-15', amount: '-42.50', description: 'Groceries', rowIndex: 1 }];

    const result = validateImportRows(rows, accountId, householdId);

    expect(result.valid).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.valid[0].data.amount.amount).toBe(4250);
    expect(result.valid[0].data.type).toBe('EXPENSE');
    expect(result.valid[0].data.status).toBe('CLEARED');
    expect(result.valid[0].data.date).toBe('2024-03-15');
  });

  it('classifies positive amounts as INCOME', () => {
    const rows = [{ date: '2024-03-15', amount: '100.00', description: 'Salary', rowIndex: 1 }];

    const result = validateImportRows(rows, accountId, householdId);
    expect(result.valid[0].data.type).toBe('INCOME');
  });

  it('classifies negative amounts as EXPENSE with positive stored amount', () => {
    const rows = [{ date: '2024-03-15', amount: '-50.00', description: 'Dinner', rowIndex: 1 }];

    const result = validateImportRows(rows, accountId, householdId);
    expect(result.valid[0].data.type).toBe('EXPENSE');
    expect(result.valid[0].data.amount.amount).toBe(5000);
  });

  it('falls back to payee when description is empty', () => {
    const rows = [{ date: '2024-03-15', amount: '10.00', payee: 'ACME Corp', rowIndex: 1 }];

    const result = validateImportRows(rows, accountId, householdId);
    expect(result.valid[0].warnings).toContain('Description was empty — used payee instead');
    expect(result.valid[0].data.payee).toBe('ACME Corp');
  });

  it('falls back to "Imported transaction" when both description and payee are empty', () => {
    const rows = [{ date: '2024-03-15', amount: '10.00', rowIndex: 1 }];

    const result = validateImportRows(rows, accountId, householdId);
    expect(result.valid[0].warnings).toContain(
      'Description was empty — set to "Imported transaction"',
    );
  });

  it('reports errors for missing date', () => {
    const rows = [{ amount: '42.50', description: 'Test', rowIndex: 1 }];

    const result = validateImportRows(rows, accountId, householdId);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('date');
    expect(result.errors[0].message).toBe('Date is required');
  });

  it('reports errors for missing amount', () => {
    const rows = [{ date: '2024-03-15', description: 'Test', rowIndex: 1 }];

    const result = validateImportRows(rows, accountId, householdId);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('amount');
  });

  it('reports errors for unparseable date', () => {
    const rows = [{ date: 'nope', amount: '10.00', rowIndex: 1 }];

    const result = validateImportRows(rows, accountId, householdId);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('date');
    expect(result.errors[0].message).toContain('Unable to parse date');
  });

  it('reports errors for unparseable amount', () => {
    const rows = [{ date: '2024-03-15', amount: 'abc', rowIndex: 1 }];

    const result = validateImportRows(rows, accountId, householdId);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('amount');
  });

  it('parses tags from comma-separated string', () => {
    const rows = [
      {
        date: '2024-03-15',
        amount: '10.00',
        description: 'Test',
        tags: 'food, groceries, weekly',
        rowIndex: 1,
      },
    ];

    const result = validateImportRows(rows, accountId, householdId);
    expect(result.valid[0].data.tags).toEqual(['food', 'groceries', 'weekly']);
  });

  it('sets totalRows to the number of input rows', () => {
    const rows = [
      { date: '2024-01-01', amount: '10', rowIndex: 1 },
      { date: 'bad', amount: '20', rowIndex: 2 },
    ];

    const result = validateImportRows(rows, accountId, householdId);
    expect(result.totalRows).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

describe('detectDuplicates', () => {
  const existingTransaction: Transaction = {
    id: 'tx-1',
    householdId: 'hh-1',
    accountId: 'acc-1',
    categoryId: 'cat-1',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: 4250 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Grocery Store',
    note: null,
    date: '2024-03-15',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    createdAt: '2024-03-15T10:00:00Z',
    updatedAt: '2024-03-15T10:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  };

  function makeValidatedRow(overrides: Partial<ValidatedRow['data']> = {}): ValidatedRow {
    return {
      data: {
        householdId: 'hh-1',
        accountId: 'acc-1',
        type: 'EXPENSE',
        status: 'CLEARED',
        amount: { amount: 4250 },
        date: '2024-03-15',
        payee: 'Grocery Store',
        ...overrides,
      },
      rowIndex: 1,
      warnings: [],
    };
  }

  it('detects exact date + amount match (score >= 0.8)', () => {
    const row = makeValidatedRow();
    const matches = detectDuplicates([row], [existingTransaction]);

    expect(matches).toHaveLength(1);
    expect(matches[0].matchScore).toBeGreaterThanOrEqual(0.8);
    expect(matches[0].matchReasons).toContain('exact date match');
    expect(matches[0].matchReasons).toContain('same amount');
  });

  it('increases score when description also matches', () => {
    const row = makeValidatedRow({ payee: 'Grocery Store' });
    const matches = detectDuplicates([row], [existingTransaction]);

    expect(matches).toHaveLength(1);
    expect(matches[0].matchScore).toBeGreaterThanOrEqual(0.9);
    expect(matches[0].matchReasons).toContain('similar description');
  });

  it('increases score when category also matches', () => {
    const row = makeValidatedRow({ categoryId: 'cat-1' });
    const matches = detectDuplicates([row], [existingTransaction]);

    expect(matches).toHaveLength(1);
    expect(matches[0].matchScore).toBeGreaterThanOrEqual(0.9);
    expect(matches[0].matchReasons).toContain('same category');
  });

  it('returns full score (1.0) when all fields match', () => {
    const row = makeValidatedRow({ payee: 'Grocery Store', categoryId: 'cat-1' });
    const matches = detectDuplicates([row], [existingTransaction]);

    expect(matches).toHaveLength(1);
    expect(matches[0].matchScore).toBe(1.0);
  });

  it('does not match when date and amount differ', () => {
    const row = makeValidatedRow({
      date: '2024-06-01',
      amount: { amount: 9999 },
    });
    const matches = detectDuplicates([row], [existingTransaction]);

    expect(matches).toHaveLength(0);
  });

  it('does not match when only date matches (score < 0.7)', () => {
    const row = makeValidatedRow({ amount: { amount: 9999 } });
    const matches = detectDuplicates([row], [existingTransaction]);

    expect(matches).toHaveLength(0);
  });

  it('uses fuzzy matching for descriptions', () => {
    const row = makeValidatedRow({ payee: 'GROCERY STORE!!!' });
    const matches = detectDuplicates([row], [existingTransaction]);

    // Should still match because fuzzy normalisation strips punctuation.
    expect(matches).toHaveLength(1);
    expect(matches[0].matchReasons).toContain('similar description');
  });

  it('returns empty array when no existing transactions', () => {
    const row = makeValidatedRow();
    const matches = detectDuplicates([row], []);

    expect(matches).toEqual([]);
  });

  it('returns empty array when no import rows', () => {
    const matches = detectDuplicates([], [existingTransaction]);

    expect(matches).toEqual([]);
  });
});
