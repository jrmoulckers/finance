// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  buildAccountRoutingPlan,
  findTransferCandidates,
  routeTransactionsToAccounts,
  type SourceAccountTransaction,
} from '../multi-account-routing';

const transactions: SourceAccountTransaction[] = [
  {
    rowIndex: 0,
    date: '2024-01-15',
    payee: 'Grocery Store',
    amountCents: -4567,
    sourceAccountName: 'Checking ****1234',
    sourceAccountId: 'bank-1234',
  },
  {
    rowIndex: 1,
    date: '2024-01-16',
    payee: 'Transfer to Savings',
    amountCents: -10000,
    sourceAccountName: 'Checking ****1234',
    sourceAccountId: 'bank-1234',
    category: 'Transfer',
  },
  {
    rowIndex: 2,
    date: '2024-01-16',
    payee: 'Transfer from Checking',
    amountCents: 10000,
    sourceAccountName: 'Savings',
    sourceAccountId: 'save-9999',
    category: 'Transfer',
  },
  {
    rowIndex: 3,
    date: '2024-01-17',
    payee: 'Cash purchase',
    amountCents: -500,
    sourceAccountName: null,
  },
];

describe('buildAccountRoutingPlan', () => {
  it('groups source accounts and proposes matches or creates', () => {
    const plan = buildAccountRoutingPlan(transactions, [
      { id: 'acct-checking', name: 'Household Checking', externalAccountId: 'bank-1234' },
      { id: 'acct-savings', name: 'Savings' },
    ]);

    expect(plan.accounts).toHaveLength(2);
    expect(plan.unroutedRowIndexes).toEqual([3]);
    expect(
      plan.accounts.find((account) => account.sourceName.includes('Checking'))?.matchedAccountId,
    ).toBe('acct-checking');
    expect(plan.accounts.find((account) => account.sourceName === 'Savings')?.action).toBe('match');
  });

  it('routes rows using reviewed overrides', () => {
    const plan = buildAccountRoutingPlan(transactions, [
      { id: 'acct-checking', name: 'Checking ****1234' },
    ]);

    const routed = routeTransactionsToAccounts(transactions, plan, [
      { sourceKey: 'id:save 9999', accountId: 'acct-new-savings', action: 'create' },
    ]);

    expect(routed[0].targetAccountId).toBe('acct-checking');
    expect(routed[2].targetAccountId).toBe('acct-new-savings');
    expect(routed[3].routingAction).toBe('needs_review');
  });
});

describe('findTransferCandidates', () => {
  it('finds opposite signed transactions across accounts', () => {
    const candidates = findTransferCandidates(transactions);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      debitRowIndex: 1,
      creditRowIndex: 2,
      amountCents: 10000,
    });
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(0.75);
  });
});
