// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildNetWorthProjectionInput,
  buildNetWorthProjectionResults,
  buildProjectedMilestoneRows,
  buildProjectionTableRows,
  loadNetWorthProjectionAssumptions,
  resetNetWorthProjectionAssumptions,
  saveNetWorthProjectionAssumptions,
} from './net-worth-projection-view';

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

describe('net-worth projection view helpers', () => {
  it('persists assumptions locally and resets to defaults', () => {
    const storage = new MemoryStorage();

    const saved = saveNetWorthProjectionAssumptions(storage, {
      monthlyContributionCents: 200_00,
      monthlyDebtPaymentCents: -50,
      annualAssetReturnPercent: 50,
      annualInflationPercent: 2,
      horizonMonths: 12.4,
    });

    expect(saved.monthlyDebtPaymentCents).toBe(0);
    expect(saved.annualAssetReturnPercent).toBe(25);
    expect(saved.horizonMonths).toBe(12);
    expect(loadNetWorthProjectionAssumptions(storage)).toEqual(saved);
    expect(resetNetWorthProjectionAssumptions(storage).horizonMonths).toBe(120);
  });

  it('builds projection rows and debt-free milestone reach messages', () => {
    const input = buildNetWorthProjectionInput(
      { label: '2025-01-15', assets: 1_000_00, liabilities: 1_000_00, netWorth: 0 },
      {
        monthlyContributionCents: 0,
        monthlyDebtPaymentCents: 500_00,
        annualAssetReturnPercent: 0,
        annualInflationPercent: 0,
        horizonMonths: 3,
      },
      [
        { id: 'debt-free', label: 'Debt-free', thresholdCents: 0, reached: false },
        { id: 'first-10k', label: 'First $10K', thresholdCents: 10_000_00, reached: false },
      ],
    );

    const results = buildNetWorthProjectionResults(input, 0);
    const rows = buildProjectionTableRows(results);
    const milestoneRows = buildProjectedMilestoneRows(results, input.milestones ?? []);

    expect(rows).toHaveLength(12);
    expect(rows.at(-1)?.liabilitiesCents).toBe(0);
    expect(milestoneRows.find((row) => row.milestoneId === 'debt-free')?.reachedLabel).toBe('2025-03');
    expect(milestoneRows.find((row) => row.milestoneId === 'first-10k')?.reachable).toBe(false);
    expect(milestoneRows.find((row) => row.milestoneId === 'first-10k')?.message).toContain(
      'not reached',
    );
  });
});
