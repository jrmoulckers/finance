// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildNetWorthSnapshotTrendCopy,
  compareNetWorthToMajorLiabilities,
  compareNetWorthToSharedGoals,
  upsertMonthlyNetWorthSnapshot,
} from './net-worth-snapshot-goals';
import type { NetWorthSnapshot } from './net-worth-rollup';

const snapshot: NetWorthSnapshot = {
  householdId: 'hh-1',
  month: '2025-05',
  assetCents: 800_000,
  liabilityCents: 100_000,
  netWorthCents: 700_000,
  createdAt: '2025-05-31T23:00:00Z',
};

describe('net worth snapshot goals', () => {
  it('upserts monthly household snapshots without account-level details', () => {
    const result = upsertMonthlyNetWorthSnapshot(
      [{ ...snapshot, month: '2025-04', netWorthCents: 650_000 }],
      snapshot,
    );

    expect(result.map((item) => item.month)).toEqual(['2025-04', '2025-05']);
    expect(Object.keys(result[1])).toEqual(['householdId', 'month', 'assetCents', 'liabilityCents', 'netWorthCents', 'createdAt']);
  });

  it('compares shared goals and liabilities without revealing aggregate-only liability names', () => {
    const goals = compareNetWorthToSharedGoals(snapshot, [
      { goalId: 'goal-1', label: 'First million', targetNetWorthCents: 1_000_000 },
    ]);
    const liabilities = compareNetWorthToMajorLiabilities(snapshot, [
      { liabilityId: 'loan', label: 'Private student loan', balanceCents: 50_000, visibility: 'AGGREGATE_ONLY' },
    ]);

    expect(goals[0]).toMatchObject({ gapCents: 300_000, percentComplete: 70 });
    expect(goals[0].privacyCopy).toContain('household-level monthly totals only');
    expect(liabilities[0].label).toBe('Redacted household liability');
    expect(liabilities[0].privacyCopy).toContain('stay redacted');
  });

  it('builds trend copy from household totals only', () => {
    const copy = buildNetWorthSnapshotTrendCopy([
      { ...snapshot, month: '2025-04', netWorthCents: 650_000 },
      snapshot,
    ]);

    expect(copy.headline).toContain('increased');
    expect(copy.detail).toContain('private account attribution remains hidden');
  });
});
