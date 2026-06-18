// SPDX-License-Identifier: BUSL-1.1

import type { MigrationPreflight, MigrationTransaction } from './migration-importers';

export interface ExistingMigrationName {
  readonly id: string;
  readonly name: string;
}

export interface QuickenCreationSuggestion {
  readonly name: string;
  readonly existingId: string | null;
  readonly transactionCount: number;
  readonly shouldCreate: boolean;
}

export interface QuickenDuplicateSourceId {
  readonly sourceTransactionId: string;
  readonly rowNumbers: readonly number[];
}

export interface QuickenSplitReviewRow {
  readonly rowNumber: number;
  readonly payee: string;
  readonly category: string | null;
  readonly splitFieldNames: readonly string[];
}

export interface QuickenMigrationReview {
  readonly source: 'quicken-qif' | 'quicken-qfx' | 'quicken-ofx';
  readonly accountSuggestions: readonly QuickenCreationSuggestion[];
  readonly categorySuggestions: readonly QuickenCreationSuggestion[];
  readonly duplicateSourceIds: readonly QuickenDuplicateSourceId[];
  readonly splitRows: readonly QuickenSplitReviewRow[];
}

export function buildQuickenMigrationReview(input: {
  readonly preflight: MigrationPreflight;
  readonly existingAccounts?: readonly ExistingMigrationName[];
  readonly existingCategories?: readonly ExistingMigrationName[];
}): QuickenMigrationReview {
  if (!isQuickenSource(input.preflight.source)) {
    throw new Error(`Expected a Quicken migration preflight, received ${input.preflight.source}`);
  }

  return {
    source: input.preflight.source,
    accountSuggestions: suggestNames(
      input.preflight.accounts,
      input.preflight.transactions,
      (transaction) => transaction.accountName,
      input.existingAccounts ?? [],
    ),
    categorySuggestions: suggestNames(
      input.preflight.categories,
      input.preflight.transactions,
      (transaction) => transaction.category,
      input.existingCategories ?? [],
    ),
    duplicateSourceIds: findDuplicateSourceIds(input.preflight.transactions),
    splitRows: findSplitRows(input.preflight.transactions),
  };
}

function suggestNames(
  names: readonly string[],
  transactions: readonly MigrationTransaction[],
  selector: (transaction: MigrationTransaction) => string | null,
  existing: readonly ExistingMigrationName[],
): QuickenCreationSuggestion[] {
  return names.map((name) => {
    const match = existing.find((item) => normalizeName(item.name) === normalizeName(name));
    return {
      name,
      existingId: match?.id ?? null,
      transactionCount: transactions.filter((transaction) => selector(transaction) === name).length,
      shouldCreate: match === undefined,
    };
  });
}

function findDuplicateSourceIds(
  transactions: readonly MigrationTransaction[],
): QuickenDuplicateSourceId[] {
  const byId = new Map<string, number[]>();
  for (const transaction of transactions) {
    const id = transaction.sourceTransactionId?.trim();
    if (!id) continue;
    byId.set(id, [...(byId.get(id) ?? []), transaction.sourceRow]);
  }
  return Array.from(byId.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([sourceTransactionId, rowNumbers]) => ({ sourceTransactionId, rowNumbers }));
}

function findSplitRows(transactions: readonly MigrationTransaction[]): QuickenSplitReviewRow[] {
  return transactions.flatMap((transaction) => {
    const splitFieldNames = Object.keys(transaction.rawFields).filter(isSplitFieldName).sort();
    const hasSplitCategory = /^\[?split\]?$/i.test(transaction.category ?? '');
    if (splitFieldNames.length === 0 && !hasSplitCategory) return [];
    return [
      {
        rowNumber: transaction.sourceRow,
        payee: transaction.payee,
        category: transaction.category,
        splitFieldNames,
      },
    ];
  });
}

function isSplitFieldName(field: string): boolean {
  return /^S\d*$/i.test(field) || /^\$\d*$/i.test(field) || /^E\d*$/i.test(field);
}

function isQuickenSource(
  source: MigrationPreflight['source'],
): source is QuickenMigrationReview['source'] {
  return source === 'quicken-qif' || source === 'quicken-qfx' || source === 'quicken-ofx';
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
