// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_SUMMARY_STORAGE_KEY,
  persistDashboardSummarySnapshot,
  readDashboardShellSnapshot,
  type DashboardSummaryStorage,
} from '../dashboard-summary-snapshot';

function memoryStorage(): DashboardSummaryStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe('dashboard summary snapshots', () => {
  it('persists and reads valid cold-start summary snapshots', () => {
    const storage = memoryStorage();
    persistDashboardSummarySnapshot(storage, {
      capturedAt: 1_000,
      totalBalanceCents: 125_00,
      cashFlowCents: 50_00,
      accountCount: 2,
      transactionCount: 12,
    });

    const result = readDashboardShellSnapshot(storage, { now: 1_500, sessionExpired: false });

    expect(result.mode).toBe('valid-snapshot');
    expect(result.snapshot?.totalBalanceCents).toBe(125_00);
  });

  it('suppresses stale snapshots and expired sessions', () => {
    const storage = memoryStorage();
    storage.setItem(
      DASHBOARD_SUMMARY_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        capturedAt: 1_000,
        totalBalanceCents: 1,
        cashFlowCents: 1,
        accountCount: 1,
        transactionCount: 1,
      }),
    );

    expect(
      readDashboardShellSnapshot(storage, { now: 3_000, sessionExpired: false, maxAgeMs: 500 })
        .mode,
    ).toBe('stale-snapshot');
    expect(storage.getItem(DASHBOARD_SUMMARY_STORAGE_KEY)).toBeNull();

    persistDashboardSummarySnapshot(storage, {
      capturedAt: 3_000,
      totalBalanceCents: 1,
      cashFlowCents: 1,
      accountCount: 1,
      transactionCount: 1,
    });
    expect(readDashboardShellSnapshot(storage, { now: 3_100, sessionExpired: true }).mode).toBe(
      'expired-session',
    );
  });
});
