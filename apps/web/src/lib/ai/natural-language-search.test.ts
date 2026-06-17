// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { executeTransactionSearch, parseTransactionSearchQuery, type SearchTransaction } from './natural-language-search';

const BASE = new Date('2025-03-15T12:00:00');
const CATEGORIES = [
  { id: 'dining', name: 'Dining', synonyms: ['restaurants'] },
  { id: 'groceries', name: 'Groceries', synonyms: ['food'] },
  { id: 'fuel', name: 'Fuel', synonyms: ['gas'] },
];
const TRANSACTIONS: SearchTransaction[] = [
  { id: 't1', date: '2025-02-04', amountCents: -6_000, payee: 'Amazon', categoryId: 'groceries', categoryName: 'Groceries', type: 'EXPENSE', accountName: 'Checking' },
  { id: 't2', date: '2025-02-08', amountCents: -2_500, payee: 'Cafe', categoryId: 'dining', categoryName: 'Dining', type: 'EXPENSE', accountName: 'Checking' },
  { id: 't3', date: '2025-03-11', amountCents: -7_500, payee: 'Amazon', categoryId: 'dining', categoryName: 'Dining', type: 'EXPENSE', accountName: 'Credit Card' },
  { id: 't4', date: '2025-01-15', amountCents: 250_000, payee: 'Payroll', categoryId: 'income', categoryName: 'Income', type: 'INCOME', accountName: 'Checking' },
];

describe('parseTransactionSearchQuery', () => {
  it('parses structured filters and aggregate intent', () => {
    const parsed = parseTransactionSearchQuery('how much did I spend on dining last month?', CATEGORIES, BASE);

    expect(parsed.aggregate).toBe('sum');
    expect(parsed.filters).toMatchObject({
      categoryId: 'dining',
      type: 'EXPENSE',
      dateRange: { start: '2025-02-01', end: '2025-02-28' },
    });
    expect(parsed.interpretedSummary).toContain('Dining');
  });

  it('supports this week, year to date, and custom month names', () => {
    expect(parseTransactionSearchQuery('transactions this week', [], BASE).filters.dateRange).toEqual({
      start: '2025-03-10',
      end: '2025-03-16',
    });
    expect(parseTransactionSearchQuery('income year to date', [], BASE).filters.dateRange).toEqual({
      start: '2025-01-01',
      end: '2025-03-15',
    });
    expect(parseTransactionSearchQuery('Amazon in February 2025', [], BASE).filters.dateRange).toEqual({
      start: '2025-02-01',
      end: '2025-02-28',
    });
  });
});

describe('executeTransactionSearch', () => {
  it('returns aggregate answers and matching transaction lists', () => {
    const result = executeTransactionSearch('show Amazon over $50', TRANSACTIONS, CATEGORIES, BASE);

    expect(result.parsed.filters).toMatchObject({ merchant: 'amazon', amountRange: { minCents: 5_000 } });
    expect(result.matches.map((transaction) => transaction.id)).toEqual(['t1', 't3']);
    expect(result.aggregateValueCents).toBeNull();
    expect(result.noMatch).toBe(false);
  });

  it('calculates sums for finance questions', () => {
    const result = executeTransactionSearch('how much spent on dining last month', TRANSACTIONS, CATEGORIES, BASE);

    expect(result.matches.map((transaction) => transaction.id)).toEqual(['t2']);
    expect(result.aggregateValueCents).toBe(2_500);
  });

  it('handles no-match and ambiguous category states gracefully', () => {
    const noMatch = executeTransactionSearch('show Target over $100 last month', TRANSACTIONS, CATEGORIES, BASE);
    const ambiguous = executeTransactionSearch('show food last month', TRANSACTIONS, CATEGORIES, BASE);

    expect(noMatch.noMatch).toBe(true);
    expect(noMatch.matches).toEqual([]);
    expect(ambiguous.ambiguousCategory).toBe(false);
    expect(ambiguous.parsed.filters.categoryId).toBe('groceries');
  });
});
