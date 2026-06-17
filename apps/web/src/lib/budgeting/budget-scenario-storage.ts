// SPDX-License-Identifier: BUSL-1.1

import type { BudgetScenario, BudgetScenarioBaseline } from './budget-scenarios';

export interface BudgetScenarioStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoredBudgetScenarioRecord {
  readonly scenario: BudgetScenario;
  readonly baselineVersion: string;
  readonly baselineCapturedAt: string;
  readonly savedAt: string;
}

export interface BudgetScenarioStaleness {
  readonly isStale: boolean;
  readonly reasons: readonly string[];
}

export const BUDGET_SCENARIO_STORAGE_KEY = 'finance:budget-scenarios:v1';

export function loadBudgetScenarioRecords(
  storage: BudgetScenarioStorageLike,
  key = BUDGET_SCENARIO_STORAGE_KEY,
): readonly StoredBudgetScenarioRecord[] {
  const raw = storage.getItem(key);
  if (!raw) return [];

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(isStoredBudgetScenarioRecord);
}

export function saveBudgetScenarioRecord(
  storage: BudgetScenarioStorageLike,
  record: StoredBudgetScenarioRecord,
  key = BUDGET_SCENARIO_STORAGE_KEY,
): readonly StoredBudgetScenarioRecord[] {
  const records = loadBudgetScenarioRecords(storage, key).filter(
    (candidate) => candidate.scenario.id !== record.scenario.id,
  );
  const nextRecords = [...records, cloneRecord(record)].sort((left, right) =>
    left.scenario.name.localeCompare(right.scenario.name),
  );
  storage.setItem(key, JSON.stringify(nextRecords));
  return nextRecords;
}

export function deleteBudgetScenarioRecord(
  storage: BudgetScenarioStorageLike,
  scenarioId: string,
  key = BUDGET_SCENARIO_STORAGE_KEY,
): readonly StoredBudgetScenarioRecord[] {
  const nextRecords = loadBudgetScenarioRecords(storage, key).filter(
    (record) => record.scenario.id !== scenarioId,
  );
  if (nextRecords.length === 0) {
    storage.removeItem(key);
  } else {
    storage.setItem(key, JSON.stringify(nextRecords));
  }
  return nextRecords;
}

export function duplicateBudgetScenarioRecord(
  record: StoredBudgetScenarioRecord,
  options: { readonly id: string; readonly name: string; readonly savedAt: string },
): StoredBudgetScenarioRecord {
  return {
    ...cloneRecord(record),
    scenario: {
      ...record.scenario,
      id: options.id,
      name: options.name,
      budgets: record.scenario.budgets.map((budget) => ({ ...budget })),
      sinkingFundContributions: record.scenario.sinkingFundContributions.map((contribution) => ({
        ...contribution,
      })),
    },
    savedAt: options.savedAt,
  };
}

export function checkBudgetScenarioBaselineStaleness(
  record: StoredBudgetScenarioRecord,
  currentBaseline: BudgetScenarioBaseline & {
    readonly version?: string;
    readonly updatedAt?: string;
  },
): BudgetScenarioStaleness {
  const reasons: string[] = [];

  if (record.scenario.baselineId !== currentBaseline.id) {
    reasons.push('baseline-id-changed');
  }
  if (currentBaseline.version !== undefined && record.baselineVersion !== currentBaseline.version) {
    reasons.push('baseline-version-changed');
  }
  if (
    currentBaseline.updatedAt !== undefined &&
    currentBaseline.updatedAt.localeCompare(record.baselineCapturedAt) > 0
  ) {
    reasons.push('baseline-updated-after-capture');
  }

  return { isStale: reasons.length > 0, reasons };
}

function cloneRecord(record: StoredBudgetScenarioRecord): StoredBudgetScenarioRecord {
  return {
    ...record,
    scenario: {
      ...record.scenario,
      budgets: record.scenario.budgets.map((budget) => ({ ...budget })),
      sinkingFundContributions: record.scenario.sinkingFundContributions.map((contribution) => ({
        ...contribution,
      })),
    },
  };
}

function isStoredBudgetScenarioRecord(value: unknown): value is StoredBudgetScenarioRecord {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<StoredBudgetScenarioRecord>;
  return (
    typeof candidate.baselineVersion === 'string' &&
    typeof candidate.baselineCapturedAt === 'string' &&
    typeof candidate.savedAt === 'string' &&
    isBudgetScenario(candidate.scenario)
  );
}

function isBudgetScenario(value: unknown): value is BudgetScenario {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<BudgetScenario>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.baselineId === 'string' &&
    Array.isArray(candidate.budgets) &&
    Array.isArray(candidate.sinkingFundContributions) &&
    typeof candidate.incomeCents === 'number' &&
    typeof candidate.startingBalanceCents === 'number'
  );
}
