// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { Transaction } from '../../kmp/bridge';
import type { AdvancedFilters } from '../../components/transactions/TransactionFilters';
import type { SortConfig } from '../../components/transactions/TransactionSort';
import { applyAdvancedFilters, matchesTransactionQuery, sortTransactions } from './filter-sort';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: 'category-food',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: 1000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Coffee Shop',
    note: null,
    date: '2025-03-06',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    merchantAddress: null,
    merchantCity: null,
    merchantState: null,
    merchantZip: null,
    merchantCountry: null,
    externalReferenceId: null,
    statementDescription: null,
    customFields: null,
    extraNotes: null,
    counterpartyName: null,
    counterpartyAccountId: null,
    ...syncMetadata,
    ...overrides,
  };
}

const EMPTY_FILTERS: AdvancedFilters = {
  startDate: '',
  endDate: '',
  categoryIds: [],
  accountIds: [],
  amountMin: '',
  amountMax: '',
  types: [],
  statuses: [],
};

const categoryNames = new Map<string, string>([
  ['category-food', 'Food'],
  ['category-income', 'Income'],
]);
const accountNames = new Map<string, string>([
  ['account-1', 'Checking'],
  ['account-2', 'Savings'],
]);

describe('sortTransactions', () => {
  it('sorts by date descending by default', () => {
    const older = makeTransaction({ id: 'a', date: '2025-03-01' });
    const newer = makeTransaction({ id: 'b', date: '2025-03-10' });
    const sort: SortConfig = { field: 'date', direction: 'desc' };

    const result = sortTransactions([older, newer], sort, categoryNames);

    expect(result.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('sorts by date ascending', () => {
    const older = makeTransaction({ id: 'a', date: '2025-03-01' });
    const newer = makeTransaction({ id: 'b', date: '2025-03-10' });
    const sort: SortConfig = { field: 'date', direction: 'asc' };

    const result = sortTransactions([newer, older], sort, categoryNames);

    expect(result.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('sorts by absolute amount ascending', () => {
    const small = makeTransaction({ id: 'a', amount: { amount: 500 } });
    const large = makeTransaction({ id: 'b', amount: { amount: -9000 } });
    const sort: SortConfig = { field: 'amount', direction: 'asc' };

    const result = sortTransactions([large, small], sort, categoryNames);

    expect(result.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('sorts by payee and does not mutate the input array', () => {
    const apple = makeTransaction({ id: 'a', payee: 'Apple' });
    const zebra = makeTransaction({ id: 'b', payee: 'Zebra' });
    const input = [zebra, apple];
    const sort: SortConfig = { field: 'payee', direction: 'asc' };

    const result = sortTransactions(input, sort, categoryNames);

    expect(result.map((t) => t.id)).toEqual(['a', 'b']);
    expect(input.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('applies a date-descending secondary sort when primary keys tie', () => {
    const earlier = makeTransaction({ id: 'a', payee: 'Same', date: '2025-03-01' });
    const later = makeTransaction({ id: 'b', payee: 'Same', date: '2025-03-09' });
    const sort: SortConfig = { field: 'payee', direction: 'asc' };

    const result = sortTransactions([earlier, later], sort, categoryNames);

    expect(result.map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('applyAdvancedFilters', () => {
  it('returns every transaction when no filters are set', () => {
    const transactions = [makeTransaction({ id: 'a' }), makeTransaction({ id: 'b' })];

    expect(applyAdvancedFilters(transactions, EMPTY_FILTERS)).toHaveLength(2);
  });

  it('filters by category, account, type, and status', () => {
    const keep = makeTransaction({
      id: 'keep',
      categoryId: 'category-food',
      accountId: 'account-1',
      type: 'EXPENSE',
      status: 'CLEARED',
    });
    const drop = makeTransaction({
      id: 'drop',
      categoryId: 'category-income',
      accountId: 'account-2',
      type: 'INCOME',
      status: 'PENDING',
    });

    expect(
      applyAdvancedFilters([keep, drop], { ...EMPTY_FILTERS, categoryIds: ['category-food'] }).map(
        (t) => t.id,
      ),
    ).toEqual(['keep']);
    expect(
      applyAdvancedFilters([keep, drop], { ...EMPTY_FILTERS, accountIds: ['account-1'] }).map(
        (t) => t.id,
      ),
    ).toEqual(['keep']);
    expect(
      applyAdvancedFilters([keep, drop], { ...EMPTY_FILTERS, types: ['EXPENSE'] }).map((t) => t.id),
    ).toEqual(['keep']);
    expect(
      applyAdvancedFilters([keep, drop], { ...EMPTY_FILTERS, statuses: ['CLEARED'] }).map(
        (t) => t.id,
      ),
    ).toEqual(['keep']);
  });

  it('filters by absolute amount range (entered in major units)', () => {
    const small = makeTransaction({ id: 'small', amount: { amount: 500 } }); // $5
    const mid = makeTransaction({ id: 'mid', amount: { amount: -2500 } }); // $25
    const large = makeTransaction({ id: 'large', amount: { amount: 9000 } }); // $90

    const result = applyAdvancedFilters([small, mid, large], {
      ...EMPTY_FILTERS,
      amountMin: '10',
      amountMax: '50',
    });

    expect(result.map((t) => t.id)).toEqual(['mid']);
  });

  it('ignores non-numeric amount bounds instead of hiding every row (#3639)', () => {
    const small = makeTransaction({ id: 'small', amount: { amount: 500 } });
    const large = makeTransaction({ id: 'large', amount: { amount: 9000 } });

    const nanMin = applyAdvancedFilters([small, large], {
      ...EMPTY_FILTERS,
      amountMin: 'abc',
    });
    expect(nanMin.map((t) => t.id)).toEqual(['small', 'large']);

    const nanMax = applyAdvancedFilters([small, large], {
      ...EMPTY_FILTERS,
      amountMax: 'not-a-number',
    });
    expect(nanMax.map((t) => t.id)).toEqual(['small', 'large']);
  });

  it('treats an empty amount range as no bound', () => {
    const small = makeTransaction({ id: 'small', amount: { amount: 500 } });
    const large = makeTransaction({ id: 'large', amount: { amount: 9000 } });

    const result = applyAdvancedFilters([small, large], {
      ...EMPTY_FILTERS,
      amountMin: '   ',
      amountMax: '',
    });

    expect(result.map((t) => t.id)).toEqual(['small', 'large']);
  });

  it('swaps an inverted amount range instead of returning an empty list (#3639)', () => {
    const small = makeTransaction({ id: 'small', amount: { amount: 500 } }); // $5
    const mid = makeTransaction({ id: 'mid', amount: { amount: -2500 } }); // $25
    const large = makeTransaction({ id: 'large', amount: { amount: 9000 } }); // $90

    const result = applyAdvancedFilters([small, mid, large], {
      ...EMPTY_FILTERS,
      amountMin: '50',
      amountMax: '10',
    });

    expect(result.map((t) => t.id)).toEqual(['mid']);
  });
});

describe('matchesTransactionQuery', () => {
  it('matches everything for an empty or whitespace query', () => {
    const transaction = makeTransaction();

    expect(matchesTransactionQuery(transaction, '')).toBe(true);
    expect(matchesTransactionQuery(transaction, '   ')).toBe(true);
  });

  it('matches payee, note, tags, status, and counterparty case-insensitively', () => {
    expect(matchesTransactionQuery(makeTransaction({ payee: 'Coffee Shop' }), 'coffee')).toBe(true);
    expect(matchesTransactionQuery(makeTransaction({ note: 'Team lunch' }), 'LUNCH')).toBe(true);
    expect(matchesTransactionQuery(makeTransaction({ tags: ['reimbursable'] }), 'reimb')).toBe(
      true,
    );
    expect(matchesTransactionQuery(makeTransaction({ status: 'PENDING' }), 'pending')).toBe(true);
    expect(
      matchesTransactionQuery(makeTransaction({ counterpartyName: 'Walgreens' }), 'walgreens'),
    ).toBe(true);
  });

  it('matches resolved category and account names via context', () => {
    const transaction = makeTransaction({ categoryId: 'category-food', accountId: 'account-2' });

    expect(matchesTransactionQuery(transaction, 'food', { categoryNames })).toBe(true);
    expect(matchesTransactionQuery(transaction, 'savings', { accountNames })).toBe(true);
  });

  it('matches an exact numeric amount entered in major units', () => {
    const transaction = makeTransaction({ amount: { amount: 1234 } }); // $12.34

    expect(matchesTransactionQuery(transaction, '12.34')).toBe(true);
    expect(matchesTransactionQuery(transaction, '$12.34')).toBe(true);
    expect(matchesTransactionQuery(transaction, '99.99')).toBe(false);
  });

  it('returns false when nothing matches', () => {
    const transaction = makeTransaction({ payee: 'Coffee Shop', note: null, tags: [] });

    expect(matchesTransactionQuery(transaction, 'mortgage', { categoryNames, accountNames })).toBe(
      false,
    );
  });

  it('matches ignoring diacritics in either direction', () => {
    const accented = makeTransaction({ payee: 'Café Rico' });
    expect(matchesTransactionQuery(accented, 'cafe')).toBe(true);
    expect(matchesTransactionQuery(accented, 'café')).toBe(true);

    const plain = makeTransaction({ payee: 'Cafe Rico' });
    expect(matchesTransactionQuery(plain, 'café')).toBe(true);

    const resolvedCategory = makeTransaction({ categoryId: 'category-accented' });
    const accentedCategoryNames = new Map<string, string>([['category-accented', 'Épicerie']]);
    expect(
      matchesTransactionQuery(resolvedCategory, 'epicerie', {
        categoryNames: accentedCategoryNames,
      }),
    ).toBe(true);
  });
});
