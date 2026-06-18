// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildNetWorthDashboardPanelModel } from './net-worth-dashboard-panel';
import { buildPrivacyAwareNetWorthRollup } from './net-worth-rollup';
import type { NetWorthAccountInput, NetWorthSnapshot } from './net-worth-rollup';

const accounts: NetWorthAccountInput[] = [
  {
    accountId: 'joint',
    ownerMemberId: 'a',
    name: 'Joint savings',
    kind: 'ASSET',
    balanceCents: 500_000,
    visibility: 'DETAILED',
  },
  {
    accountId: 'redacted',
    ownerMemberId: 'b',
    name: 'Brokerage',
    kind: 'ASSET',
    balanceCents: 300_000,
    visibility: 'AGGREGATE_ONLY',
  },
];

const snapshots: NetWorthSnapshot[] = [
  {
    householdId: 'hh',
    month: '2025-04',
    assetCents: 700_000,
    liabilityCents: 0,
    netWorthCents: 700_000,
    createdAt: '2025-04-30T00:00:00Z',
  },
  {
    householdId: 'hh',
    month: '2025-05',
    assetCents: 800_000,
    liabilityCents: 0,
    netWorthCents: 800_000,
    createdAt: '2025-05-31T00:00:00Z',
  },
];

describe('buildNetWorthDashboardPanelModel', () => {
  it('creates a dashboard panel model without exposing aggregate-only names', () => {
    const model = buildNetWorthDashboardPanelModel({
      rollup: buildPrivacyAwareNetWorthRollup(accounts),
      snapshots,
      sharedGoals: [{ goalId: 'million', label: 'First million', targetNetWorthCents: 1_000_000 }],
    });

    expect(model.netWorthCents).toBe(800_000);
    expect(model.attributionSummary).toContain('redacted aggregate');
    expect(model.trendHeadline).toContain('increased');
    expect(model.goalRows[0]).toMatchObject({ label: 'First million', percentComplete: 80 });
    expect(model.privacyNotice).toContain('without showing names or owners');
    expect(JSON.stringify(model)).not.toContain('Brokerage');
  });
});
