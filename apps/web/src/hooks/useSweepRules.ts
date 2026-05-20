// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for rule-based savings sweep automations.
 *
 * Manages sweep rules in localStorage and provides simulation/evaluation
 * using the sweep engine. Supports creating, editing, enabling/disabling
 * rules, and previewing what rules would do.
 *
 * Usage:
 * ```tsx
 * const { rules, evaluations, createRule, simulate, ... } = useSweepRules();
 * ```
 *
 * References: #1635
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type SweepRule,
  type SweepEvaluation,
  type SweepLogEntry,
  type SweepContext,
  evaluateAllRules,
  createLogEntry,
  createRoundUpRule,
  createPercentRule,
  createThresholdRule,
  createFixedAmountRule,
} from '../lib/planning';
import { useAccounts } from './useAccounts';
import { useGoals } from './useGoals';
import { useTransactions } from './useTransactions';

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const RULES_STORAGE_KEY = 'finance:sweep-rules';
const LOG_STORAGE_KEY = 'finance:sweep-log';

/** Load rules from localStorage. */
function loadRules(): SweepRule[] {
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SweepRule[]) : [];
  } catch {
    return [];
  }
}

/** Persist rules to localStorage. */
function persistRules(rules: SweepRule[]): void {
  try {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch {
    /* storage quota */
  }
}

/** Load log from localStorage. */
function loadLog(): SweepLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SweepLogEntry[]) : [];
  } catch {
    return [];
  }
}

/** Persist log to localStorage. */
function persistLog(log: SweepLogEntry[]): void {
  try {
    // Keep only last 100 entries
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(log.slice(-100)));
  } catch {
    /* storage quota */
  }
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useSweepRules}. */
export interface UseSweepRulesResult {
  /** All configured sweep rules. */
  rules: SweepRule[];
  /** Latest evaluation results for all enabled rules. */
  evaluations: SweepEvaluation[];
  /** Execution/simulation log entries. */
  log: SweepLogEntry[];
  /** Whether data is loading. */
  loading: boolean;
  /** Create a round-up rule. */
  addRoundUpRule: (
    name: string,
    sourceId: string,
    destId: string,
    destType: 'account' | 'goal',
    roundUpCents?: number,
  ) => SweepRule;
  /** Create a percent-of-income rule. */
  addPercentRule: (
    name: string,
    sourceId: string,
    destId: string,
    destType: 'account' | 'goal',
    percent?: number,
  ) => SweepRule;
  /** Create a threshold-based rule. */
  addThresholdRule: (
    name: string,
    sourceId: string,
    destId: string,
    destType: 'account' | 'goal',
    thresholdCents: number,
  ) => SweepRule;
  /** Create a fixed-amount rule. */
  addFixedRule: (
    name: string,
    sourceId: string,
    destId: string,
    destType: 'account' | 'goal',
    amountCents: number,
    dayOfMonth?: number,
  ) => SweepRule;
  /** Delete a rule. */
  deleteRule: (id: string) => void;
  /** Toggle a rule's enabled state. */
  toggleRule: (id: string) => void;
  /** Run simulation mode — evaluate all rules without executing. */
  simulate: () => SweepEvaluation[];
  /** Clear the execution log. */
  clearLog: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Manage sweep automation rules with simulation support. */
export function useSweepRules(): UseSweepRulesResult {
  const { accounts, loading: accountsLoading } = useAccounts();
  const { goals, loading: goalsLoading } = useGoals();
  const { transactions, loading: txLoading } = useTransactions();

  const [rules, setRules] = useState<SweepRule[]>(loadRules);
  const [log, setLog] = useState<SweepLogEntry[]>(loadLog);
  const [evaluations, setEvaluations] = useState<SweepEvaluation[]>([]);

  // Persist rules on change
  useEffect(() => {
    persistRules(rules);
  }, [rules]);

  // Build sweep context from live data
  const context = useMemo<SweepContext>(() => {
    const accountData = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      balanceCents: a.currentBalance.amount,
    }));

    const goalData = goals.map((g) => ({
      id: g.id,
      name: g.name,
    }));

    // Get recent transactions (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysStr = thirtyDaysAgo.toISOString().split('T')[0] ?? '';
    const recentTx = transactions
      .filter((t) => t.date >= thirtyDaysStr)
      .map((t) => ({
        amountCents: t.amount.amount,
        accountId: t.accountId,
        type: t.type,
      }));

    return {
      accounts: accountData,
      goals: goalData,
      recentTransactions: recentTx,
      dayOfMonth: now.getDate(),
    };
  }, [accounts, goals, transactions]);

  // Auto-evaluate rules when context changes
  useEffect(() => {
    if (!accountsLoading && !goalsLoading && !txLoading && rules.length > 0) {
      const results = evaluateAllRules(rules, context);
      setEvaluations(results);
    }
  }, [rules, context, accountsLoading, goalsLoading, txLoading]);

  // Rule creation callbacks
  const addRoundUpRule = useCallback(
    (
      name: string,
      sourceId: string,
      destId: string,
      destType: 'account' | 'goal',
      roundUpCents?: number,
    ): SweepRule => {
      const rule = createRoundUpRule(name, sourceId, destId, destType, roundUpCents);
      setRules((prev) => [...prev, rule]);
      return rule;
    },
    [],
  );

  const addPercentRule = useCallback(
    (
      name: string,
      sourceId: string,
      destId: string,
      destType: 'account' | 'goal',
      percent?: number,
    ): SweepRule => {
      const rule = createPercentRule(name, sourceId, destId, destType, percent);
      setRules((prev) => [...prev, rule]);
      return rule;
    },
    [],
  );

  const addThresholdRule = useCallback(
    (
      name: string,
      sourceId: string,
      destId: string,
      destType: 'account' | 'goal',
      thresholdCents: number,
    ): SweepRule => {
      const rule = createThresholdRule(name, sourceId, destId, destType, thresholdCents);
      setRules((prev) => [...prev, rule]);
      return rule;
    },
    [],
  );

  const addFixedRule = useCallback(
    (
      name: string,
      sourceId: string,
      destId: string,
      destType: 'account' | 'goal',
      amountCents: number,
      dayOfMonth?: number,
    ): SweepRule => {
      const rule = createFixedAmountRule(name, sourceId, destId, destType, amountCents, dayOfMonth);
      setRules((prev) => [...prev, rule]);
      return rule;
    },
    [],
  );

  const deleteRule = useCallback((id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const toggleRule = useCallback((id: string) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  }, []);

  const simulate = useCallback((): SweepEvaluation[] => {
    const results = evaluateAllRules(rules, context);
    setEvaluations(results);

    // Add to log as simulated
    const newEntries = results.map((e) => createLogEntry(e, 'simulated'));
    setLog((prev) => {
      const updated = [...prev, ...newEntries];
      persistLog(updated);
      return updated;
    });

    return results;
  }, [rules, context]);

  const clearLog = useCallback(() => {
    setLog([]);
    persistLog([]);
  }, []);

  return {
    rules,
    evaluations,
    log,
    loading: accountsLoading || goalsLoading || txLoading,
    addRoundUpRule,
    addPercentRule,
    addThresholdRule,
    addFixedRule,
    deleteRule,
    toggleRule,
    simulate,
    clearLog,
  };
}
