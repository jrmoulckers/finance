// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildNetWorthContributionModel } from './net-worth-contribution-model';
import type { NetWorthAccountInput } from './net-worth-rollup';

const accounts: NetWorthAccountInput[] = [
  {
    accountId: 'joint',
    ownerMemberId: 'a',
    name: 'Joint checking',
    kind: 'ASSET',
    balanceCents: 100_000,
    visibility: 'DETAILED',
  },
  {
    accountId: 'private-brokerage',
    ownerMemberId: 'b',
    name: 'Private brokerage',
    kind: 'ASSET',
    balanceCents: 300_000,
    visibility: 'AGGREGATE_ONLY',
  },
  {
    accountId: 'private-card',
    ownerMemberId: 'b',
    name: 'Private card',
    kind: 'LIABILITY',
    balanceCents: 50_000,
    visibility: 'AGGREGATE_ONLY',
  },
  {
    accountId: 'excluded',
    ownerMemberId: 'a',
    name: 'Excluded savings',
    kind: 'ASSET',
    balanceCents: 900_000,
    visibility: 'EXCLUDED',
  },
];

describe('buildNetWorthContributionModel', () => {
  it('keeps totals accurate while redacting aggregate-only and excluded account attribution', () => {
    const model = buildNetWorthContributionModel(accounts);

    expect(model.rollup.assetCents).toBe(400_000);
    expect(model.rollup.liabilityCents).toBe(50_000);
    expect(model.rollup.netWorthCents).toBe(350_000);
    expect(model.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Joint checking',
          ownerMemberId: 'a',
          accountId: 'joint',
          visibility: 'DETAILED',
        }),
        expect.objectContaining({
          label: 'Redacted household assets',
          ownerMemberId: null,
          accountId: null,
          visibility: 'AGGREGATE_ONLY',
        }),
        expect.objectContaining({
          label: '1 excluded account',
          amountCents: 0,
          visibility: 'EXCLUDED',
        }),
      ]),
    );
    expect(model.rows.some((row) => row.label === 'Private brokerage')).toBe(false);
    expect(model.copy.aggregateOnly).toContain('redacted');
  });
});
