// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for what-if scenario modeling.
 *
 * Manages scenarios in local state (saved via localStorage) and computes
 * projections using the scenario modeler engine. Supports creating,
 * editing, duplicating, and comparing scenarios.
 *
 * Usage:
 * ```tsx
 * const { scenarios, projections, createScenario, ... } = useScenarioModeler();
 * ```
 *
 * References: #1743, #1735
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type BaselineSnapshot,
  type Scenario,
  type ScenarioAdjustment,
  type ScenarioProjection,
  compareScenarios,
  createEmptyScenario,
  createAdjustment as makeAdjustment,
  addAdjustment,
  removeAdjustment,
  duplicateScenario,
} from '../lib/planning';
import { useAccounts } from './useAccounts';
import { useTransactions } from './useTransactions';

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'finance:scenarios';

/** Load saved scenarios from localStorage. */
function loadScenarios(): Scenario[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Scenario[];
  } catch {
    return [];
  }
}

/** Persist scenarios to localStorage. */
function saveScenarios(scenarios: Scenario[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  } catch {
    // Storage quota exceeded — silently fail
  }
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useScenarioModeler}. */
export interface UseScenarioModelerResult {
  /** All saved scenarios. */
  scenarios: Scenario[];
  /** Projections for all scenarios plus the baseline. */
  projections: ScenarioProjection[];
  /** The currently selected scenario for editing (null if none). */
  selectedScenario: Scenario | null;
  /** Current baseline snapshot used for projections. */
  baseline: BaselineSnapshot;
  /** Number of months to project. */
  projectionMonths: number;
  /** Whether initial data is loading. */
  loading: boolean;
  /** Create a new scenario. */
  createScenario: (name: string, description?: string) => Scenario;
  /** Select a scenario for editing. */
  selectScenario: (id: string | null) => void;
  /** Delete a scenario. */
  deleteScenario: (id: string) => void;
  /** Duplicate a scenario. */
  duplicate: (id: string, newName?: string) => Scenario | null;
  /** Add an adjustment to the selected scenario. */
  addAdjustmentToSelected: (
    label: string,
    category: ScenarioAdjustment['category'],
    monthlyCents: number,
    monthOffset?: number,
  ) => void;
  /** Remove an adjustment from the selected scenario. */
  removeAdjustmentFromSelected: (adjustmentId: string) => void;
  /** Update the scenario name. */
  updateScenarioName: (id: string, name: string) => void;
  /** Set projection duration in months. */
  setProjectionMonths: (months: number) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Manage what-if scenarios with projection calculations. */
export function useScenarioModeler(): UseScenarioModelerResult {
  const { accounts, loading: accountsLoading } = useAccounts();
  const { transactions, loading: txLoading } = useTransactions();

  const [scenarios, setScenarios] = useState<Scenario[]>(loadScenarios);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projectionMonths, setProjectionMonths] = useState(60);

  // Persist scenarios whenever they change
  useEffect(() => {
    saveScenarios(scenarios);
  }, [scenarios]);

  // Compute baseline from accounts and recent transactions
  const baseline = useMemo<BaselineSnapshot>(() => {
    const totalBalance = accounts.reduce((sum, a) => sum + a.currentBalance.amount, 0);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysStr = thirtyDaysAgo.toISOString().split('T')[0] ?? '';

    const recentTx = transactions.filter((t) => t.date >= thirtyDaysStr);
    const monthlyIncome = recentTx
      .filter((t) => t.type === 'INCOME')
      .reduce((sum, t) => sum + t.amount.amount, 0);
    const monthlyExpenses = recentTx
      .filter((t) => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + t.amount.amount, 0);

    const savingsAccounts = accounts.filter((a) => a.type === 'SAVINGS' || a.type === 'INVESTMENT');
    const savingsBalance = savingsAccounts.reduce((sum, a) => sum + a.currentBalance.amount, 0);

    return {
      netWorthCents: totalBalance,
      monthlyIncomeCents: monthlyIncome,
      monthlyExpensesCents: monthlyExpenses,
      savingsCents: savingsBalance,
    };
  }, [accounts, transactions]);

  // Compute projections for all scenarios
  const projections = useMemo(
    () => compareScenarios(baseline, scenarios, projectionMonths),
    [baseline, scenarios, projectionMonths],
  );

  const selectedScenario = useMemo(
    () => scenarios.find((s) => s.id === selectedId) ?? null,
    [scenarios, selectedId],
  );

  const createScenario = useCallback((name: string, description?: string): Scenario => {
    const scenario = createEmptyScenario(name, description);
    setScenarios((prev) => [...prev, scenario]);
    setSelectedId(scenario.id);
    return scenario;
  }, []);

  const selectScenario = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const deleteScenario = useCallback((id: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  const duplicate = useCallback(
    (id: string, newName?: string): Scenario | null => {
      const original = scenarios.find((s) => s.id === id);
      if (!original) return null;
      const copy = duplicateScenario(original, newName);
      setScenarios((prev) => [...prev, copy]);
      return copy;
    },
    [scenarios],
  );

  const addAdjustmentToSelected = useCallback(
    (
      label: string,
      category: ScenarioAdjustment['category'],
      monthlyCents: number,
      monthOffset?: number,
    ) => {
      if (!selectedId) return;
      const adj = makeAdjustment(label, category, monthlyCents, monthOffset);
      setScenarios((prev) => prev.map((s) => (s.id === selectedId ? addAdjustment(s, adj) : s)));
    },
    [selectedId],
  );

  const removeAdjustmentFromSelected = useCallback(
    (adjustmentId: string) => {
      if (!selectedId) return;
      setScenarios((prev) =>
        prev.map((s) => (s.id === selectedId ? removeAdjustment(s, adjustmentId) : s)),
      );
    },
    [selectedId],
  );

  const updateScenarioName = useCallback((id: string, name: string) => {
    setScenarios((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name, updatedAt: new Date().toISOString() } : s)),
    );
  }, []);

  return {
    scenarios,
    projections,
    selectedScenario,
    baseline,
    projectionMonths,
    loading: accountsLoading || txLoading,
    createScenario,
    selectScenario,
    deleteScenario,
    duplicate,
    addAdjustmentToSelected,
    removeAdjustmentFromSelected,
    updateScenarioName,
    setProjectionMonths,
  };
}
