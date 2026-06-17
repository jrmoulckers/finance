// SPDX-License-Identifier: BUSL-1.1

import type { DebtBaselineState, MilestoneSnapshot, MilestoneStorageState } from './types';

const STORAGE_KEY = 'finance:milestone-state';
export const MILESTONE_DATA_CHANGED_EVENT = 'finance:milestone-data-changed';

const EMPTY_BASELINES: DebtBaselineState = {
  totalDebtCents: 0,
  accountBaselines: {},
};

const EMPTY_STATE: MilestoneStorageState = {
  snapshot: null,
  shownMilestoneIds: [],
  debtBaselines: EMPTY_BASELINES,
};

export function loadMilestoneStorageState(): MilestoneStorageState {
  if (typeof window === 'undefined') {
    return EMPTY_STATE;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return EMPTY_STATE;
    }

    const parsed = JSON.parse(raw) as Partial<MilestoneStorageState>;
    return {
      snapshot: parsed.snapshot ?? null,
      shownMilestoneIds: Array.isArray(parsed.shownMilestoneIds) ? parsed.shownMilestoneIds : [],
      debtBaselines: {
        totalDebtCents: parsed.debtBaselines?.totalDebtCents ?? 0,
        accountBaselines: parsed.debtBaselines?.accountBaselines ?? {},
      },
    };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveMilestoneStorageState(state: MilestoneStorageState): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures in constrained browsers.
  }
}

export function mergeDebtBaselines(
  baselines: DebtBaselineState,
  snapshot: MilestoneSnapshot,
): DebtBaselineState {
  const accountBaselines: Record<string, number> = { ...baselines.accountBaselines };

  for (const liability of Object.values(snapshot.liabilities)) {
    accountBaselines[liability.accountId] = Math.max(
      accountBaselines[liability.accountId] ?? 0,
      liability.balanceCents,
    );
  }

  return {
    totalDebtCents: Math.max(baselines.totalDebtCents, snapshot.totalDebtCents),
    accountBaselines,
  };
}

export function notifyMilestoneDataChanged(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(MILESTONE_DATA_CHANGED_EVENT));
}
