// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MILESTONE_DATA_CHANGED_EVENT,
  loadMilestoneStorageState,
  mergeDebtBaselines,
  notifyMilestoneDataChanged,
  saveMilestoneStorageState,
} from './storage';

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('milestone storage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'window',
      Object.assign(new EventTarget(), {
        localStorage: createLocalStorageMock(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads empty defaults when storage is blank', () => {
    expect(loadMilestoneStorageState()).toEqual({
      snapshot: null,
      shownMilestoneIds: [],
      debtBaselines: { totalDebtCents: 0, accountBaselines: {} },
    });
  });

  it('persists and restores milestone state', () => {
    const state = {
      snapshot: {
        netWorthCents: 100,
        totalDebtCents: 50,
        savingsStreakMonths: 2,
        goals: {},
        liabilities: {},
      },
      shownMilestoneIds: ['net-worth-100'],
      debtBaselines: { totalDebtCents: 200, accountBaselines: { card: 120 } },
    } as const;

    saveMilestoneStorageState(state);

    expect(loadMilestoneStorageState()).toEqual(state);
  });

  it('merges debt baselines using the highest seen values', () => {
    const merged = mergeDebtBaselines(
      { totalDebtCents: 500, accountBaselines: { card: 300 } },
      {
        netWorthCents: 0,
        totalDebtCents: 750,
        savingsStreakMonths: 0,
        goals: {},
        liabilities: {
          card: { accountId: 'card', accountName: 'Visa', balanceCents: 200 },
          loan: { accountId: 'loan', accountName: 'Loan', balanceCents: 550 },
        },
      },
    );

    expect(merged).toEqual({
      totalDebtCents: 750,
      accountBaselines: { card: 300, loan: 550 },
    });
  });

  it('dispatches a browser event when milestone data changes', () => {
    const handler = vi.fn();
    window.addEventListener(MILESTONE_DATA_CHANGED_EVENT, handler);

    notifyMilestoneDataChanged();

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(MILESTONE_DATA_CHANGED_EVENT, handler);
  });
});
