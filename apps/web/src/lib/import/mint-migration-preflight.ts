// SPDX-License-Identifier: BUSL-1.1

import {
  createMigrationPreflight,
  type MigrationPreflight,
  type MigrationTransaction,
} from './migration-importers';
import { isMintFormat } from './mint-parser';

export interface MintMigrationPreflightRow {
  readonly rowNumber: number;
  readonly date: string;
  readonly payee: string;
  readonly originalDescription: string | null;
  readonly amount: string;
  readonly debitCredit: 'debit' | 'credit';
  readonly accountName: string | null;
  readonly category: string | null;
  readonly labels: readonly string[];
  readonly note: string | null;
}

export interface MintMigrationPreflightPanel {
  readonly source: 'mint';
  readonly detected: boolean;
  readonly rows: readonly MintMigrationPreflightRow[];
  readonly accounts: readonly string[];
  readonly categories: readonly string[];
  readonly labels: readonly string[];
  readonly issues: readonly string[];
}

export function isMintMigrationCandidate(fileName: string, content: string): boolean {
  const extension = fileName.toLowerCase().split('.').pop() ?? '';
  if (extension !== 'csv' && extension !== 'txt') return false;
  const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
  const headers = firstLine.split(',').map((header) => header.trim().replace(/^"|"$/g, ''));
  return isMintFormat(headers);
}

export function createMintMigrationPreflightPanel(
  fileName: string,
  content: string,
): MintMigrationPreflightPanel {
  const preflight = createMigrationPreflight(fileName, content);
  return buildMintMigrationPreflightPanel(preflight, isMintMigrationCandidate(fileName, content));
}

export function buildMintMigrationPreflightPanel(
  preflight: MigrationPreflight,
  detected = preflight.source === 'mint',
): MintMigrationPreflightPanel {
  const rows = preflight.transactions.map(toMintRow);
  const issues = [
    ...preflight.parserErrors,
    ...preflight.unsupportedFields.map(
      (field) => `Unsupported Mint field preserved in raw data: ${field}`,
    ),
  ];

  return {
    source: 'mint',
    detected: detected && preflight.source === 'mint',
    rows,
    accounts: preflight.accounts,
    categories: preflight.categories,
    labels: preflight.tags,
    issues,
  };
}

function toMintRow(transaction: MigrationTransaction): MintMigrationPreflightRow {
  return {
    rowNumber: transaction.sourceRow,
    date: transaction.date,
    payee: transaction.payee,
    originalDescription: transaction.originalDescription,
    amount: transaction.amount,
    debitCredit: transaction.amount.trim().startsWith('-') ? 'debit' : 'credit',
    accountName: transaction.accountName,
    category: transaction.category,
    labels: transaction.tags,
    note: transaction.note,
  };
}
