// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { createBudgetScenarioFromBaseline } from './budget-scenarios';
import {
  checkBudgetScenarioBaselineStaleness,
  deleteBudgetScenarioRecord,
  duplicateBudgetScenarioRecord,
  loadBudgetScenarioRecords,
  saveBudgetScenarioRecord,
  type BudgetScenarioStorageLike,
  type StoredBudgetScenarioRecord,
} from './budget-scenario-storage';

class MemoryStorage implements BudgetScenarioStorageLike {
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

const baseline = {
  id: 'baseline-1',
  version: 'v1',
  updatedAt: '2025-03-01T00:00:00Z',
  incomeCents: 500_000,
  startingBalanceCents: 100_000,
  budgets: [
    { id: 'budget-food', categoryId: 'food', name: 'Food', amountCents: 75_000 },
    { id: 'budget-rent', categoryId: 'rent', name: 'Rent', amountCents: 200_000 },
  ],
};

function record(): StoredBudgetScenarioRecord {
  return {
    scenario: createBudgetScenarioFromBaseline(baseline, {
      id: 'scenario-1',
      name: 'Lower groceries',
      createdAt: '2025-03-02T00:00:00Z',
    }),
    baselineVersion: baseline.version,
    baselineCapturedAt: baseline.updatedAt,
    savedAt: '2025-03-02T00:00:00Z',
  };
}

describe('budget scenario local storage', () => {
  it('saves and loads scenario headers, budget lines, and sinking-fund contributions', () => {
    const storage = new MemoryStorage();
    const saved = saveBudgetScenarioRecord(storage, {
      ...record(),
      scenario: {
        ...record().scenario,
        sinkingFundContributions: [
          { id: 'fund-1', name: 'Car repair', linkedCategoryId: 'auto', contributionCents: 10_000 },
        ],
      },
    });

    const loaded = loadBudgetScenarioRecords(storage);

    expect(saved).toHaveLength(1);
    expect(loaded[0].scenario.budgets).toHaveLength(2);
    expect(loaded[0].scenario.sinkingFundContributions[0].contributionCents).toBe(10_000);
  });

  it('duplicates and deletes scenarios without touching the source record', () => {
    const storage = new MemoryStorage();
    const source = record();
    const duplicate = duplicateBudgetScenarioRecord(source, {
      id: 'scenario-copy',
      name: 'Copy',
      savedAt: '2025-03-03T00:00:00Z',
    });

    saveBudgetScenarioRecord(storage, source);
    saveBudgetScenarioRecord(storage, duplicate);
    expect(loadBudgetScenarioRecords(storage).map((item) => item.scenario.id)).toEqual([
      'scenario-copy',
      'scenario-1',
    ]);

    deleteBudgetScenarioRecord(storage, 'scenario-copy');

    expect(loadBudgetScenarioRecords(storage).map((item) => item.scenario.id)).toEqual(['scenario-1']);
    expect(source.scenario.id).toBe('scenario-1');
  });

  it('detects stale baselines using id, version, and updated metadata', () => {
    expect(checkBudgetScenarioBaselineStaleness(record(), baseline).isStale).toBe(false);

    const stale = checkBudgetScenarioBaselineStaleness(record(), {
      ...baseline,
      version: 'v2',
      updatedAt: '2025-03-04T00:00:00Z',
    });

    expect(stale).toEqual({
      isStale: true,
      reasons: ['baseline-version-changed', 'baseline-updated-after-capture'],
    });
  });
});
