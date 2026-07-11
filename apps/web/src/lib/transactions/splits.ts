// SPDX-License-Identifier: BUSL-1.1

import type { SyncId, TransactionSplitSharing } from '../../kmp/bridge';

export interface TransactionSplitDraft {
  readonly categoryId?: SyncId | null;
  readonly amount: { readonly amount: number };
  readonly note?: string | null;
  /** Shared/joint vs personal designation for this split line (#3389). */
  readonly sharing?: TransactionSplitSharing;
  /** Optional household member this split line is attributed to (#3389). */
  readonly memberId?: SyncId | null;
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

export interface SplitSharingSummary {
  /** Total cents on split lines marked shared/joint. */
  readonly sharedCents: number;
  /** Total cents on split lines marked personal. */
  readonly personalCents: number;
  /** Per-member personal totals keyed by member id (only attributed lines). */
  readonly perMemberCents: Readonly<Record<string, number>>;
  /** True when at least one line is personal (so a mixed-attribution view is useful). */
  readonly hasPersonal: boolean;
}

/**
 * Aggregate the shared-vs-personal dimension across split lines (#3389) so
 * household "yours / mine / ours" views can reflect real transaction splits.
 * Lines default to shared when their `sharing` flag is absent.
 */
export function summarizeSplitSharing(
  splits: readonly TransactionSplitDraft[],
): SplitSharingSummary {
  let sharedCents = 0;
  let personalCents = 0;
  const perMemberCents: Record<string, number> = {};

  for (const split of splits) {
    const amount = Math.trunc(split.amount.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    if (split.sharing === 'PERSONAL') {
      personalCents += amount;
      if (split.memberId) {
        perMemberCents[split.memberId] = (perMemberCents[split.memberId] ?? 0) + amount;
      }
    } else {
      sharedCents += amount;
    }
  }

  return {
    sharedCents,
    personalCents,
    perMemberCents,
    hasPersonal: personalCents > 0,
  };
}
