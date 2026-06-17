// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { buildQuickenMigrationReview } from '../quicken-migration-review';
import { buildMigrationPreflight } from '../migration-importers';
import type { UniversalImportResult } from '../format-detector';
import { ImportFormat } from '../types';

describe('buildQuickenMigrationReview', () => {
  it('suggests missing accounts and categories and flags duplicate source IDs', () => {
    const preflight = buildMigrationPreflight({
      format: 'qfx',
      transactions: [],
      totalCount: 0,
      errors: [],
      accountInfo: null,
      currency: null,
      rawResult: {
        format: ImportFormat.QFX,
        transactions: [
          {
            date: '2024-01-15',
            amountCents: -1200,
            description: 'Coffee',
            sourceId: 'dup',
            category: 'Dining',
            checkNumber: null,
            type: 'DEBIT',
            memo: null,
            balanceCents: null,
            rawFields: { ACCOUNT: 'Checking' },
          },
          {
            date: '2024-01-16',
            amountCents: -1300,
            description: 'Lunch',
            sourceId: 'dup',
            category: 'Dining',
            checkNumber: null,
            type: 'DEBIT',
            memo: null,
            balanceCents: null,
            rawFields: { ACCOUNT: 'Checking' },
          },
        ],
        errors: [],
        totalRecords: 2,
        accountId: null,
        startDate: null,
        endDate: null,
        currency: null,
      },
    } satisfies UniversalImportResult);

    const review = buildQuickenMigrationReview({
      preflight,
      existingAccounts: [{ id: 'acct-1', name: 'Checking' }],
      existingCategories: [],
    });

    expect(review.accountSuggestions[0]).toMatchObject({ existingId: 'acct-1', shouldCreate: false });
    expect(review.categorySuggestions[0]).toMatchObject({ name: 'Dining', shouldCreate: true });
    expect(review.duplicateSourceIds).toEqual([{ sourceTransactionId: 'dup', rowNumbers: [1, 2] }]);
  });

  it('identifies split rows that need review', () => {
    const preflight = buildMigrationPreflight({
      format: 'qif',
      transactions: [],
      totalCount: 0,
      errors: [],
      accountInfo: null,
      currency: null,
      rawResult: {
        format: ImportFormat.QIF,
        transactions: [
          {
            date: '2024-01-15',
            amountCents: -5000,
            description: 'Store',
            sourceId: null,
            category: 'Split',
            checkNumber: null,
            type: null,
            memo: null,
            balanceCents: null,
            rawFields: { ACCOUNT: 'Checking', S1: 'Groceries', '$1': '-30.00' },
          },
        ],
        errors: [],
        totalRecords: 1,
        accountId: null,
        startDate: null,
        endDate: null,
        currency: null,
      },
    } satisfies UniversalImportResult);

    const review = buildQuickenMigrationReview({ preflight });

    expect(review.splitRows).toEqual([
      { rowNumber: 1, payee: 'Store', category: 'Split', splitFieldNames: ['$1', 'S1'] },
    ]);
  });
});
