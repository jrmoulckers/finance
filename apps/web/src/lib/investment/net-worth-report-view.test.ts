// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildNetWorthReportViewModel,
  clearNetWorthSnapshots,
  loadNetWorthSnapshots,
  persistCurrentNetWorthSnapshot,
  saveNetWorthSnapshots,
  snapshotFromCurrentNetWorth,
  upsertMonthlyNetWorthSnapshot,
} from './net-worth-report-view';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('net-worth report view helpers', () => {
  it('persists monthly snapshots and replaces the same month offline-first', () => {
    const storage = new MemoryStorage();
    const january = snapshotFromCurrentNetWorth(
      { label: '2025-01-10', assets: 10_000_00, liabilities: 5_000_00, netWorth: 5_000_00 },
      [
        {
          className: 'Investments',
          balance: 10_000_00,
          percent: 100,
          accountCount: 1,
          accountTypes: ['INVESTMENT'],
        },
      ],
    );
    const replacement = { ...january, date: '2025-01-31', assetsCents: 12_000_00 };

    expect(upsertMonthlyNetWorthSnapshot([january], replacement)).toEqual([replacement]);
    saveNetWorthSnapshots(storage, [january]);
    expect(loadNetWorthSnapshots(storage)).toEqual([january]);
    persistCurrentNetWorthSnapshot(storage, {
      label: '2025-02-15',
      assets: 13_000_00,
      liabilities: 0,
      netWorth: 13_000_00,
    });
    expect(loadNetWorthSnapshots(storage)).toHaveLength(2);
    clearNetWorthSnapshots(storage);
    expect(loadNetWorthSnapshots(storage)).toEqual([]);
  });

  it('builds table rows, milestone markers, and CSV filenames for selected ranges', () => {
    const snapshots = [
      { date: '2025-01-10', assetsCents: 10_000_00, liabilitiesCents: 5_000_00 },
      { date: '2025-02-10', assetsCents: 20_000_00, liabilitiesCents: 0 },
    ];

    const viewModel = buildNetWorthReportViewModel(snapshots, 'ALL');

    expect(viewModel.tableRows[0]?.changeFromPreviousCents).toBeNull();
    expect(viewModel.tableRows[1]?.changeFromPreviousCents).toBe(15_000_00);
    expect(viewModel.milestoneMarkers).toContain('Debt-free reached in 2025-02');
    expect(viewModel.csvFileName).toBe('net-worth-all-2025-02.csv');
    expect(viewModel.emptyMessage).toBeNull();
  });
});
