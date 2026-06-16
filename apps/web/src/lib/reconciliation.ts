// SPDX-License-Identifier: BUSL-1.1

import type {
  LocalDate,
  SyncId,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../kmp/bridge';

export interface ReconciliationTransactionInput {
  readonly id: SyncId;
  readonly type: TransactionType;
  readonly status: TransactionStatus;
  readonly amount: { readonly amount: number };
  readonly date: LocalDate;
}

export interface ReconciliationCalculationInput {
  readonly startingBalance: number;
  readonly statementEndingBalance: number;
  readonly transactions: readonly ReconciliationTransactionInput[];
  readonly clearedTransactionIds: ReadonlySet<SyncId> | readonly SyncId[];
}

export interface ReconciliationCalculation {
  readonly startingBalance: number;
  readonly clearedTotal: number;
  readonly computedEndingBalance: number;
  readonly statementEndingBalance: number;
  readonly difference: number;
  readonly clearedCount: number;
  readonly canClose: boolean;
}

export function getTransactionReconciliationAmount(
  transaction: ReconciliationTransactionInput,
): number {
  if (transaction.status === 'VOID') {
    return 0;
  }

  if (transaction.type === 'EXPENSE') {
    return -Math.abs(transaction.amount.amount);
  }

  if (transaction.type === 'INCOME') {
    return Math.abs(transaction.amount.amount);
  }

  return transaction.amount.amount;
}

export function isTransactionLockedByReconciliation(
  transaction: Pick<Transaction, 'status'> | Pick<ReconciliationTransactionInput, 'status'>,
): boolean {
  return transaction.status === 'RECONCILED';
}

export function isTransactionEligibleForReconciliation(
  transaction: ReconciliationTransactionInput,
  statementDate?: LocalDate,
): boolean {
  if (transaction.status === 'RECONCILED' || transaction.status === 'VOID') {
    return false;
  }

  return statementDate === undefined || transaction.date <= statementDate;
}

function toClearedIdSet(ids: ReadonlySet<SyncId> | readonly SyncId[]): ReadonlySet<SyncId> {
  return ids instanceof Set ? ids : new Set(ids);
}

export function calculateReconciliationDifference(
  input: ReconciliationCalculationInput,
): ReconciliationCalculation {
  const clearedIds = toClearedIdSet(input.clearedTransactionIds);
  const clearedTransactions = input.transactions.filter((transaction) =>
    clearedIds.has(transaction.id),
  );
  const clearedTotal = clearedTransactions.reduce(
    (total, transaction) => total + getTransactionReconciliationAmount(transaction),
    0,
  );
  const computedEndingBalance = input.startingBalance + clearedTotal;
  const difference = input.statementEndingBalance - computedEndingBalance;

  return {
    startingBalance: input.startingBalance,
    clearedTotal,
    computedEndingBalance,
    statementEndingBalance: input.statementEndingBalance,
    difference,
    clearedCount: clearedTransactions.length,
    canClose: difference === 0,
  };
}

export function getReconciliationCandidates<T extends ReconciliationTransactionInput>(
  transactions: readonly T[],
  statementDate?: LocalDate,
): T[] {
  return transactions.filter((transaction) =>
    isTransactionEligibleForReconciliation(transaction, statementDate),
  );
}
