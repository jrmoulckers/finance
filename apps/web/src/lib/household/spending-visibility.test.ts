// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { SpendingVisibilityRule, SpendingVisibilityTransaction } from './spending-visibility';
import { buildSpendingVisibilityPreview, evaluateSpendingVisibility } from './spending-visibility';

const tx: SpendingVisibilityTransaction = {
  id: 'txn-1',
  accountId: 'acct-1',
  ownerMemberId: 'member-owner',
  amountCents: 12_345,
  date: '2025-03-15',
  categoryId: 'cat-gifts',
  merchant: 'Gift Shop',
  tags: ['birthday'],
  isRecurringBill: false,
};

describe('evaluateSpendingVisibility', () => {
  it('always shows details to the transaction owner', () => {
    expect(evaluateSpendingVisibility([], tx, 'member-owner').detailLevel).toBe('DETAIL');
  });

  it('redacts transaction details for aggregate-only sharing', () => {
    const rules: SpendingVisibilityRule[] = [
      {
        id: 'rule-1',
        accountId: 'acct-1',
        ownerMemberId: 'member-owner',
        level: 'AGGREGATE_ONLY',
        updatedAt: '2025-03-01T00:00:00Z',
      },
    ];

    const decision = evaluateSpendingVisibility(rules, tx, 'member-partner');

    expect(decision.visible).toBe(true);
    expect(decision.detailLevel).toBe('AGGREGATE');
    expect(decision.redactionLabel).toContain('details hidden');
  });

  it('shares matching custom-rule transactions with details', () => {
    const rules: SpendingVisibilityRule[] = [
      {
        id: 'rule-custom',
        accountId: 'acct-1',
        ownerMemberId: 'member-owner',
        level: 'CUSTOM',
        categoryIds: ['cat-gifts'],
        tags: ['birthday'],
        minimumAmountCents: 10_000,
        updatedAt: '2025-03-01T00:00:00Z',
      },
    ];

    expect(evaluateSpendingVisibility(rules, tx, 'member-partner').detailLevel).toBe('DETAIL');
  });

  it('hides transactions when no rule permits sharing', () => {
    expect(evaluateSpendingVisibility([], tx, 'member-partner')).toMatchObject({
      visible: false,
      detailLevel: 'NONE',
    });
  });
});

describe('buildSpendingVisibilityPreview', () => {
  it('summarizes detail, redacted, and hidden outcomes before saving', () => {
    const rules: SpendingVisibilityRule[] = [
      {
        id: 'rule-1',
        accountId: 'acct-1',
        ownerMemberId: 'member-owner',
        level: 'AGGREGATE_ONLY',
        updatedAt: '2025-03-01T00:00:00Z',
      },
      {
        id: 'rule-2',
        accountId: 'acct-2',
        ownerMemberId: 'member-owner',
        level: 'SHARED_TRANSACTIONS',
        updatedAt: '2025-03-01T00:00:00Z',
      },
    ];
    const preview = buildSpendingVisibilityPreview(
      rules,
      [tx, { ...tx, id: 'txn-2', accountId: 'acct-2', amountCents: 500 }, { ...tx, id: 'txn-3', accountId: 'acct-3' }],
      'member-partner',
    );

    expect(preview.redactedTransactionIds).toEqual(['txn-1']);
    expect(preview.visibleTransactionIds).toEqual(['txn-2']);
    expect(preview.hiddenTransactionIds).toEqual(['txn-3']);
    expect(preview.aggregateVisibleCents).toBe(12_845);
    expect(preview.detailVisibleCents).toBe(500);
  });
});
