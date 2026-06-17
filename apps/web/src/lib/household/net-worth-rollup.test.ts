// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  buildPrivacyAwareNetWorthRollup,
  createMonthlyNetWorthSnapshot,
  type NetWorthAccountInput,
} from './net-worth-rollup';

const accounts: NetWorthAccountInput[] = [
  {
    accountId: 'checking',
    ownerMemberId: 'member-a',
    name: 'Checking',
    kind: 'ASSET',
    balanceCents: 100_000,
    visibility: 'DETAILED',
  },
  {
    accountId: 'brokerage',
    ownerMemberId: 'member-b',
    name: 'Brokerage',
    kind: 'ASSET',
    balanceCents: 250_000,
    visibility: 'AGGREGATE_ONLY',
  },
  {
    accountId: 'card',
    ownerMemberId: 'member-b',
    name: 'Credit Card',
    kind: 'LIABILITY',
    balanceCents: 40_000,
    visibility: 'AGGREGATE_ONLY',
  },
  {
    accountId: 'private',
    ownerMemberId: 'member-a',
    name: 'Private',
    kind: 'ASSET',
    balanceCents: 1_000_000,
    visibility: 'EXCLUDED',
  },
];

describe('buildPrivacyAwareNetWorthRollup', () => {
  it('includes detailed and aggregate-only accounts while omitting excluded accounts', () => {
    const rollup = buildPrivacyAwareNetWorthRollup(accounts);

    expect(rollup.assetCents).toBe(350_000);
    expect(rollup.liabilityCents).toBe(40_000);
    expect(rollup.netWorthCents).toBe(310_000);
    expect(rollup.excludedAccountCount).toBe(1);
  });

  it('only attributes owners for detailed accounts', () => {
    const rollup = buildPrivacyAwareNetWorthRollup(accounts);

    expect(rollup.detailedAttributions).toEqual([
      {
        accountId: 'checking',
        ownerMemberId: 'member-a',
        label: 'Checking',
        kind: 'ASSET',
        amountCents: 100_000,
        visibility: 'DETAILED',
      },
    ]);
    expect(rollup.aggregateAttributions.every((item) => item.ownerMemberId === null)).toBe(true);
    expect(rollup.privacyExplanation).toContain('aggregate-only accounts contribute totals');
  });
});

describe('createMonthlyNetWorthSnapshot', () => {
  it('persists monthly totals without account-level details', () => {
    const rollup = buildPrivacyAwareNetWorthRollup(accounts);
    const snapshot = createMonthlyNetWorthSnapshot(
      'household-1',
      '2025-03',
      rollup,
      '2025-03-31T23:59:59Z',
    );

    expect(snapshot).toMatchObject({
      householdId: 'household-1',
      month: '2025-03',
      netWorthCents: 310_000,
    });
    expect(Object.keys(snapshot)).not.toContain('detailedAttributions');
  });
});
