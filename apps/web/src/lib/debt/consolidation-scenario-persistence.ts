// SPDX-License-Identifier: BUSL-1.1

import type { Debt } from '../debt-types';
import type { ConsolidationFeeTreatment } from './consolidation-comparison';

export const CONSOLIDATION_SCENARIO_STORAGE_KEY = 'finance.debt.consolidationScenario.v1';

export interface PersistedConsolidationScenario {
  readonly version: 1;
  readonly selectedDebtIds: readonly string[];
  readonly annualRateBps: number;
  readonly termMonths: number;
  readonly originationFeeCents: number;
  readonly feeTreatment: ConsolidationFeeTreatment;
  readonly targetPaymentCents?: number;
}

export interface RestoredConsolidationScenario extends PersistedConsolidationScenario {
  readonly ignoredDebtIds: readonly string[];
}

export interface ScenarioStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isPersistedScenario(value: unknown): value is PersistedConsolidationScenario {
  if (!value || typeof value !== 'object') return false;
  const scenario = value as Partial<PersistedConsolidationScenario>;
  return (
    scenario.version === 1 &&
    Array.isArray(scenario.selectedDebtIds) &&
    typeof scenario.annualRateBps === 'number' &&
    typeof scenario.termMonths === 'number' &&
    typeof scenario.originationFeeCents === 'number' &&
    (scenario.feeTreatment === 'paid_upfront' || scenario.feeTreatment === 'financed')
  );
}

export function restoreConsolidationScenario(
  scenario: PersistedConsolidationScenario,
  debts: readonly Debt[],
): RestoredConsolidationScenario {
  const eligibleIds = new Set(debts.filter((debt) => debt.balanceCents > 0).map((debt) => debt.id));
  const selectedDebtIds = scenario.selectedDebtIds.filter((id) => eligibleIds.has(id));
  const ignoredDebtIds = scenario.selectedDebtIds.filter((id) => !eligibleIds.has(id));

  return {
    ...scenario,
    selectedDebtIds,
    ignoredDebtIds,
  };
}

export function readConsolidationScenario(
  storage: ScenarioStorageLike,
): PersistedConsolidationScenario | null {
  const raw = storage.getItem(CONSOLIDATION_SCENARIO_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPersistedScenario(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeConsolidationScenario(
  storage: ScenarioStorageLike,
  scenario: PersistedConsolidationScenario,
): void {
  storage.setItem(CONSOLIDATION_SCENARIO_STORAGE_KEY, JSON.stringify(scenario));
}
