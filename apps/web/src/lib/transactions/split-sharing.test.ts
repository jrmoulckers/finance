// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { parseTransactionSplits, serializeTransactionSplits } from '../../db/repositories/helpers';
import type { TransactionSplit } from '../../kmp/bridge';
import { summarizeSplitSharing, type TransactionSplitDraft } from './splits';

function draft(
  amount: number,
  sharing?: TransactionSplitDraft['sharing'],
  memberId?: string,
): TransactionSplitDraft {
  return {
    categoryId: 'cat-1',
    amount: { amount },
    ...(sharing ? { sharing } : {}),
    ...(memberId ? { memberId } : {}),
  };
}

describe('summarizeSplitSharing (#3389)', () => {
  it('treats splits without a sharing flag as shared', () => {
    const summary = summarizeSplitSharing([draft(1000), draft(500)]);
    expect(summary.sharedCents).toBe(1500);
    expect(summary.personalCents).toBe(0);
    expect(summary.hasPersonal).toBe(false);
  });

  it('separates shared and personal totals', () => {
    const summary = summarizeSplitSharing([
      draft(1000, 'SHARED'),
      draft(400, 'PERSONAL'),
      draft(100, 'PERSONAL'),
    ]);
    expect(summary.sharedCents).toBe(1000);
    expect(summary.personalCents).toBe(500);
    expect(summary.hasPersonal).toBe(true);
  });

  it('attributes personal lines to members', () => {
    const summary = summarizeSplitSharing([
      draft(400, 'PERSONAL', 'member-a'),
      draft(600, 'PERSONAL', 'member-b'),
      draft(200, 'PERSONAL', 'member-a'),
    ]);
    expect(summary.perMemberCents).toEqual({ 'member-a': 600, 'member-b': 600 });
  });

  it('ignores non-positive amounts', () => {
    const summary = summarizeSplitSharing([draft(0, 'PERSONAL'), draft(-50, 'SHARED')]);
    expect(summary.sharedCents).toBe(0);
    expect(summary.personalCents).toBe(0);
  });
});

describe('transaction split sharing serialization (#3389)', () => {
  it('round-trips sharing and member attribution', () => {
    const splits: TransactionSplit[] = [
      { categoryId: 'cat-1', amount: { amount: 1000 }, note: null, sharing: 'SHARED' },
      {
        categoryId: 'cat-2',
        amount: { amount: 500 },
        note: 'lunch',
        sharing: 'PERSONAL',
        memberId: 'member-a',
      },
    ];

    const serialized = serializeTransactionSplits(splits);
    expect(serialized).not.toBeNull();

    const parsed = parseTransactionSplits(serialized);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.sharing).toBeUndefined();
    expect(parsed[1]?.sharing).toBe('PERSONAL');
    expect(parsed[1]?.memberId).toBe('member-a');
  });

  it('parses legacy category-only splits as shared (no sharing field)', () => {
    const legacy = JSON.stringify([{ categoryId: 'cat-1', amount: 1000, note: null }]);
    const parsed = parseTransactionSplits(legacy);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.sharing).toBeUndefined();
    expect(parsed[0]?.memberId).toBeUndefined();
  });
});
