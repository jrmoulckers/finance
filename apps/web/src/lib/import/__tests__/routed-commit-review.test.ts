// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { buildRoutedCommitPlan, transferKey } from '../routed-commit-review';
import type { RoutedImportTransaction, TransferCandidate } from '../multi-account-routing';

const routed: RoutedImportTransaction[] = [
  { rowIndex: 0, date: '2024-01-15', payee: 'Transfer to Savings', amountCents: -10000, sourceAccountName: 'Checking', targetAccountId: 'acct-checking', routingAction: 'match' },
  { rowIndex: 1, date: '2024-01-15', payee: 'Transfer from Checking', amountCents: 10000, sourceAccountName: 'Savings', targetAccountId: 'acct-savings', routingAction: 'match' },
  { rowIndex: 2, date: '2024-01-16', payee: 'Unknown', amountCents: -500, sourceAccountName: null, targetAccountId: null, routingAction: 'needs_review' },
];

const pair: TransferCandidate = {
  debitRowIndex: 0,
  creditRowIndex: 1,
  amountCents: 10000,
  confidence: 0.9,
  reason: 'Opposite amounts',
};

describe('routed commit review', () => {
  it('uses per-row target accounts and blocks unrouted rows', () => {
    const plan = buildRoutedCommitPlan({ transactions: routed });

    expect(plan.importableRows.map((row) => row.targetAccountId)).toEqual(['acct-checking', 'acct-savings']);
    expect(plan.blockedRows.map((row) => row.rowIndex)).toEqual([2]);
    expect(plan.canCommit).toBe(false);
  });

  it('skips one side of selected transfers to prevent double counting', () => {
    const plan = buildRoutedCommitPlan({
      transactions: routed.slice(0, 2),
      transferCandidates: [pair],
      selectedTransferPairs: [transferKey(pair)],
    });

    expect(plan.importableRows.map((row) => row.rowIndex)).toEqual([0]);
    expect(plan.skippedRows.map((row) => row.rowIndex)).toEqual([1]);
    expect(plan.canCommit).toBe(true);
  });
});
