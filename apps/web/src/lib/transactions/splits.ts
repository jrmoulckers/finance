// SPDX-License-Identifier: BUSL-1.1

import type { SyncId } from '../../kmp/bridge';

export interface TransactionSplitDraft {
  readonly categoryId?: SyncId | null;
  readonly amount: { readonly amount: number };
  readonly note?: string | null;
}

export interface TransactionSplitValidationResult {
  readonly splitTotalCents: number;
  readonly remainingCents: number;
  readonly isBalanced: boolean;
  readonly error: string | null;
}

export function validateTransactionSplits(
  transactionTotalCents: number,
  splits: readonly TransactionSplitDraft[],
): TransactionSplitValidationResult {
  if (splits.length === 0) {
    return {
      splitTotalCents: 0,
      remainingCents: 0,
      isBalanced: true,
      error: null,
    };
  }

  const targetTotalCents = Math.abs(Math.trunc(transactionTotalCents));
  const splitTotalCents = splits.reduce((sum, split) => sum + Math.trunc(split.amount.amount), 0);
  const remainingCents = targetTotalCents - splitTotalCents;

  if (splits.some((split) => Math.trunc(split.amount.amount) <= 0)) {
    return {
      splitTotalCents,
      remainingCents,
      isBalanced: false,
      error: 'Each split amount must be greater than zero.',
    };
  }

  if (remainingCents !== 0) {
    return {
      splitTotalCents,
      remainingCents,
      isBalanced: false,
      error: 'Split amounts must equal the transaction total.',
    };
  }

  return {
    splitTotalCents,
    remainingCents,
    isBalanced: true,
    error: null,
  };
}
