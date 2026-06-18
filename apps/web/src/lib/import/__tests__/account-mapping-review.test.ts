// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { buildAccountRoutingPlan, type SourceAccountTransaction } from '../multi-account-routing';
import { applyAccountMappingReview, buildAccountMappingReview } from '../account-mapping-review';

const transactions: SourceAccountTransaction[] = [
  {
    rowIndex: 0,
    date: '2024-01-15',
    payee: 'Coffee',
    amountCents: -500,
    sourceAccountName: 'Checking',
    sourceAccountId: 'chk',
  },
  {
    rowIndex: 1,
    date: '2024-01-16',
    payee: 'Pay',
    amountCents: 1000,
    sourceAccountName: 'Savings',
    sourceAccountId: 'sav',
  },
];

describe('account mapping review', () => {
  it('builds review rows with proposed matches and create-new suggestions', () => {
    const existing = [{ id: 'acct-checking', name: 'Checking', externalAccountId: 'chk' }];
    const plan = buildAccountRoutingPlan(transactions, existing);

    const review = buildAccountMappingReview(plan, existing);

    expect(review.rows).toHaveLength(2);
    expect(review.rows.find((row) => row.sourceName === 'Checking')?.selectedAccountId).toBe(
      'acct-checking',
    );
    expect(review.rows.find((row) => row.sourceName === 'Savings')?.createNewName).toBe('Savings');
    expect(review.mappingFingerprint).toHaveLength(8);
  });

  it('applies reviewed overrides before commit planning', () => {
    const plan = buildAccountRoutingPlan(transactions, []);
    const review = buildAccountMappingReview(
      plan,
      [],
      [
        { sourceKey: 'id:chk', accountId: 'acct-checking', action: 'match' },
        { sourceKey: 'id:sav', accountId: 'acct-savings', action: 'create' },
      ],
    );

    const applied = applyAccountMappingReview({ transactions, plan, reviewRows: review.rows });

    expect(applied.routedTransactions.map((row) => row.targetAccountId)).toEqual([
      'acct-checking',
      'acct-savings',
    ]);
    expect(applied.overrides).toHaveLength(2);
  });
});
