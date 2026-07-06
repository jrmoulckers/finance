// SPDX-License-Identifier: BUSL-1.1

/**
 * Source-specific migration preflight helpers for Mint, YNAB, and Quicken imports.
 *
 * Pure functions: no browser storage, network, or database access.
 * References: #2252.
 */

import { parseImportFile, type UniversalImportResult } from './format-detector';
import type { MintParseResult, MintTransaction } from './mint-parser';
import type { YnabParseResult, YnabTransaction } from './ynab-parser';
import type { ImportResult, ParsedTransaction } from './types';

export type MigrationSource =
  'mint' | 'ynab' | 'quicken-qif' | 'quicken-qfx' | 'quicken-ofx' | 'generic';

export interface MigrationTransaction {
  readonly source: MigrationSource;
  readonly sourceRow: number;
  readonly date: string;
  readonly amount: string;
  readonly payee: string;
  readonly accountName: string | null;
  readonly category: string | null;
  readonly tags: readonly string[];
  readonly note: string | null;
  readonly originalDescription: string | null;
  readonly clearedStatus: string | null;
  readonly checkNumber: string | null;
  readonly sourceTransactionId: string | null;
  readonly rawFields: Readonly<Record<string, string>>;
}

export interface MigrationPreflightSummary {
  readonly source: MigrationSource;
  readonly transactionCount: number;
  readonly accountCount: number;
  readonly categoryCount: number;
  readonly tagCount: number;
  readonly sourceIdCount: number;
  readonly duplicateSourceIdCount: number;
  readonly repairNeededCount: number;
  readonly unsupportedFieldCount: number;
}

export interface MigrationPreflight {
  readonly source: MigrationSource;
  readonly transactions: readonly MigrationTransaction[];
  readonly accounts: readonly string[];
  readonly categories: readonly string[];
  readonly tags: readonly string[];
  readonly unsupportedFields: readonly string[];
  readonly parserErrors: readonly string[];
  readonly summary: MigrationPreflightSummary;
}

const RECOGNIZED_RAW_FIELDS = new Set([
  'D',
  'T',
  'P',
  'M',
  'N',
  'L',
  'C',
  'ACCOUNT',
  'DTPOSTED',
  'TRNAMT',
  'FITID',
  'NAME',
  'MEMO',
  'TRNTYPE',
  'CHECKNUM',
  'REFNUM',
]);

export function createMigrationPreflight(fileName: string, content: string): MigrationPreflight {
  return buildMigrationPreflight(parseImportFile(fileName, content));
}

export function buildMigrationPreflight(result: UniversalImportResult): MigrationPreflight {
  const source = toMigrationSource(result.format);
  const transactions = extractMigrationTransactions(result, source);
  const accounts = sortedUnique(transactions.map((transaction) => transaction.accountName));
  const categories = sortedUnique(transactions.map((transaction) => transaction.category));
  const tags = sortedUnique(transactions.flatMap((transaction) => transaction.tags));
  const unsupportedFields = findUnsupportedFields(transactions);
  const duplicateSourceIdCount = countDuplicateSourceIds(transactions);
  const repairNeededCount = result.errors.length + transactions.filter(needsRepair).length;

  return {
    source,
    transactions,
    accounts,
    categories,
    tags,
    unsupportedFields,
    parserErrors: [...result.errors],
    summary: {
      source,
      transactionCount: transactions.length,
      accountCount: accounts.length,
      categoryCount: categories.length,
      tagCount: tags.length,
      sourceIdCount: transactions.filter((transaction) => transaction.sourceTransactionId).length,
      duplicateSourceIdCount,
      repairNeededCount,
      unsupportedFieldCount: unsupportedFields.length,
    },
  };
}

function extractMigrationTransactions(
  result: UniversalImportResult,
  source: MigrationSource,
): MigrationTransaction[] {
  if (result.format === 'mint' && isMintParseResult(result.rawResult)) {
    return result.rawResult.transactions.map((transaction, index) => fromMint(transaction, index));
  }

  if (result.format === 'ynab' && isYnabParseResult(result.rawResult)) {
    return result.rawResult.transactions.map((transaction, index) => fromYnab(transaction, index));
  }

  if (isImportResultWithTransactions(result.rawResult)) {
    return result.rawResult.transactions.map((transaction, index) =>
      fromParsed(transaction, source, index),
    );
  }

  return result.transactions.map((transaction, index) => ({
    source,
    sourceRow: index + 1,
    date: transaction.date,
    amount: transaction.amount,
    payee: transaction.payee,
    accountName: result.accountInfo?.accountId ?? null,
    category: transaction.category,
    tags: [],
    note: transaction.memo,
    originalDescription: null,
    clearedStatus: null,
    checkNumber: transaction.checkNum,
    sourceTransactionId: transaction.sourceTransactionId,
    rawFields: {},
  }));
}

function fromMint(transaction: MintTransaction, index: number): MigrationTransaction {
  return {
    source: 'mint',
    sourceRow: index + 1,
    date: transaction.date,
    amount: transaction.amount,
    payee: transaction.description || transaction.originalDescription,
    accountName: emptyToNull(transaction.accountName),
    category: emptyToNull(transaction.category),
    tags: splitTags(transaction.labels),
    note: emptyToNull(transaction.notes),
    originalDescription: emptyToNull(transaction.originalDescription),
    clearedStatus: null,
    checkNumber: null,
    sourceTransactionId: null,
    rawFields: {
      type: transaction.type,
      labels: transaction.labels,
      originalDescription: transaction.originalDescription,
    },
  };
}

function fromYnab(transaction: YnabTransaction, index: number): MigrationTransaction {
  return {
    source: 'ynab',
    sourceRow: index + 1,
    date: transaction.date,
    amount: transaction.amount,
    payee: transaction.payee,
    accountName: emptyToNull(transaction.account),
    category: emptyToNull(transaction.category),
    tags: splitTags(transaction.flag),
    note: emptyToNull(transaction.memo),
    originalDescription: null,
    clearedStatus: transaction.cleared,
    checkNumber: null,
    sourceTransactionId: null,
    rawFields: { flag: transaction.flag, cleared: transaction.cleared },
  };
}

function fromParsed(
  transaction: ParsedTransaction,
  source: MigrationSource,
  index: number,
): MigrationTransaction {
  return {
    source,
    sourceRow: index + 1,
    date: transaction.date,
    amount: (transaction.amountCents / 100).toFixed(2),
    payee: transaction.description,
    accountName: emptyToNull(transaction.rawFields.ACCOUNT),
    category: transaction.category,
    tags: [],
    note: transaction.memo,
    originalDescription: null,
    clearedStatus: emptyToNull(transaction.rawFields.C),
    checkNumber: transaction.checkNumber,
    sourceTransactionId: transaction.sourceId,
    rawFields: transaction.rawFields,
  };
}

function toMigrationSource(format: UniversalImportResult['format']): MigrationSource {
  if (format === 'mint') return 'mint';
  if (format === 'ynab') return 'ynab';
  if (format === 'qif') return 'quicken-qif';
  if (format === 'qfx') return 'quicken-qfx';
  if (format === 'ofx') return 'quicken-ofx';
  return 'generic';
}

function sortedUnique(values: readonly (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value)),
  ).sort((left, right) => left.localeCompare(right));
}

function splitTags(value: string): string[] {
  return sortedUnique(value.split(/[;,|]/));
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function findUnsupportedFields(transactions: readonly MigrationTransaction[]): string[] {
  const fields = new Set<string>();
  for (const transaction of transactions) {
    for (const field of Object.keys(transaction.rawFields)) {
      if (!RECOGNIZED_RAW_FIELDS.has(field) && transaction.rawFields[field]?.trim()) {
        fields.add(field);
      }
    }
  }
  return Array.from(fields).sort((left, right) => left.localeCompare(right));
}

function countDuplicateSourceIds(transactions: readonly MigrationTransaction[]): number {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const transaction of transactions) {
    const sourceId = transaction.sourceTransactionId?.trim();
    if (!sourceId) continue;
    if (seen.has(sourceId)) duplicates.add(sourceId);
    seen.add(sourceId);
  }
  return duplicates.size;
}

function needsRepair(transaction: MigrationTransaction): boolean {
  return !transaction.date || !transaction.amount || !transaction.payee;
}

function isMintParseResult(value: UniversalImportResult['rawResult']): value is MintParseResult {
  return !!value && Array.isArray((value as Partial<MintParseResult>).transactions);
}

function isYnabParseResult(value: UniversalImportResult['rawResult']): value is YnabParseResult {
  return !!value && Array.isArray((value as Partial<YnabParseResult>).transactions);
}

function isImportResultWithTransactions(
  value: UniversalImportResult['rawResult'],
): value is ImportResult {
  if (!value) return false;
  const candidate = value as Partial<ImportResult>;
  return Array.isArray(candidate.transactions) && 'format' in candidate;
}
