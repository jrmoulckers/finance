// SPDX-License-Identifier: BUSL-1.1

import type { RoutedImportTransaction, TransferCandidate } from './multi-account-routing';

export interface RoutedCommitRow {
  readonly rowIndex: number;
  readonly targetAccountId: string | null;
  readonly amountCents: number;
  readonly blockedReason: string | null;
  readonly skippedReason: string | null;
}

export interface RoutedTransferReviewPair extends TransferCandidate {
  readonly selected: boolean;
}

export interface RoutedCommitPlan {
  readonly importableRows: readonly RoutedCommitRow[];
  readonly blockedRows: readonly RoutedCommitRow[];
  readonly skippedRows: readonly RoutedCommitRow[];
  readonly transferPairs: readonly RoutedTransferReviewPair[];
  readonly canCommit: boolean;
}

export function buildRoutedCommitPlan(input: {
  readonly transactions: readonly RoutedImportTransaction[];
  readonly transferCandidates?: readonly TransferCandidate[];
  readonly selectedTransferPairs?: readonly string[];
  readonly minimumTransferConfidence?: number;
}): RoutedCommitPlan {
  const minimumConfidence = input.minimumTransferConfidence ?? 0.75;
  const selectedKeys = new Set(input.selectedTransferPairs ?? []);
  const transferPairs = (input.transferCandidates ?? [])
    .filter((candidate) => candidate.confidence >= minimumConfidence)
    .map((candidate) => ({
      ...candidate,
      selected: selectedKeys.size === 0 ? true : selectedKeys.has(transferKey(candidate)),
    }));
  const skippedCreditRows = new Map<number, string>();
  for (const pair of transferPairs) {
    if (pair.selected) {
      skippedCreditRows.set(pair.creditRowIndex, `Covered by transfer from row ${pair.debitRowIndex + 1}`);
    }
  }

  const rows = input.transactions.map((transaction): RoutedCommitRow => {
    const skippedReason = skippedCreditRows.get(transaction.rowIndex) ?? null;
    const blockedReason = transaction.targetAccountId ? null : 'Missing reviewed target account';
    return {
      rowIndex: transaction.rowIndex,
      targetAccountId: transaction.targetAccountId,
      amountCents: transaction.amountCents,
      blockedReason,
      skippedReason,
    };
  });

  const blockedRows = rows.filter((row) => row.blockedReason !== null);
  const skippedRows = rows.filter((row) => row.skippedReason !== null);
  const importableRows = rows.filter((row) => row.blockedReason === null && row.skippedReason === null);

  return {
    importableRows,
    blockedRows,
    skippedRows,
    transferPairs,
    canCommit: blockedRows.length === 0,
  };
}

export function transferKey(candidate: Pick<TransferCandidate, 'debitRowIndex' | 'creditRowIndex'>): string {
  return `${candidate.debitRowIndex}->${candidate.creditRowIndex}`;
}
