// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for managing auto-tagging rules.
 *
 * Provides CRUD operations, rule evaluation, and testing capabilities
 * for the rule-based auto-tagging system (Phase 1).
 *
 * @module hooks/useTaggingRules
 * References: issue #1473
 */

import { useCallback, useEffect, useState } from 'react';

import type { Transaction } from '../kmp/bridge';
import type { TagAction, TaggingRule } from '../lib/tagging/tagging-types';
import {
  createRule,
  createRuleFromTransaction,
  deleteRule as deleteRuleFromStorage,
  evaluateRules,
  evaluateRulesWithIds,
  incrementMatchCounts,
  loadRules,
  matchCondition,
  updateRule,
} from '../lib/tagging/rule-engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result returned by {@link useTaggingRules}. */
export interface UseTaggingRulesResult {
  /** All tagging rules sorted by priority (highest first). */
  readonly rules: TaggingRule[];
  /** Whether rules are currently loading. */
  readonly loading: boolean;
  /** Human-readable error message, or null. */
  readonly error: string | null;
  /** Reload rules from localStorage. */
  readonly refresh: () => void;
  /** Create a new rule. Returns the created rule or null on error. */
  readonly addRule: (
    input: Omit<TaggingRule, 'id' | 'createdAt' | 'matchCount'>,
  ) => TaggingRule | null;
  /** Update an existing rule. Returns the updated rule or null. */
  readonly editRule: (
    id: string,
    updates: Partial<Omit<TaggingRule, 'id' | 'createdAt'>>,
  ) => TaggingRule | null;
  /** Delete a rule by ID. Returns true if successful. */
  readonly removeRule: (id: string) => boolean;
  /** Toggle a rule's enabled state. */
  readonly toggleRule: (id: string) => void;
  /** Evaluate all rules against a transaction and return matched actions. */
  readonly applyRules: (transaction: Transaction) => TagAction[];
  /** Apply rules and increment match counts for matched rules. */
  readonly applyAndTrack: (transaction: Transaction) => TagAction[];
  /** Create a rule pre-filled from a transaction. */
  readonly createFromTransaction: (transaction: Transaction, name: string) => TaggingRule;
  /** Test rules against a list of transactions. Returns matching transaction IDs per rule. */
  readonly testRules: (transactions: Transaction[]) => Map<string, string[]>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook for managing auto-tagging rules.
 *
 * Rules are persisted in localStorage and loaded on mount.
 * All mutations immediately persist and trigger a re-render.
 */
export function useTaggingRules(): UseTaggingRulesResult {
  const [rules, setRules] = useState<TaggingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  // Load rules on mount and refresh
  useEffect(() => {
    try {
      const loaded = loadRules();
      // Sort by priority descending
      loaded.sort((a, b) => b.priority - a.priority);
      setRules(loaded);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tagging rules.');
    } finally {
      setLoading(false);
    }
  }, [refreshToken]);

  const addRule = useCallback(
    (input: Omit<TaggingRule, 'id' | 'createdAt' | 'matchCount'>): TaggingRule | null => {
      try {
        const rule = createRule(input);
        refresh();
        return rule;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create rule.');
        return null;
      }
    },
    [refresh],
  );

  const editRule = useCallback(
    (id: string, updates: Partial<Omit<TaggingRule, 'id' | 'createdAt'>>): TaggingRule | null => {
      try {
        const updated = updateRule(id, updates);
        if (updated) refresh();
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update rule.');
        return null;
      }
    },
    [refresh],
  );

  const removeRule = useCallback(
    (id: string): boolean => {
      try {
        const result = deleteRuleFromStorage(id);
        if (result) refresh();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete rule.');
        return false;
      }
    },
    [refresh],
  );

  const toggleRule = useCallback(
    (id: string): void => {
      const rule = rules.find((r) => r.id === id);
      if (rule) {
        editRule(id, { enabled: !rule.enabled });
      }
    },
    [rules, editRule],
  );

  const applyRules = useCallback(
    (transaction: Transaction): TagAction[] => {
      return evaluateRules(transaction, rules);
    },
    [rules],
  );

  const applyAndTrack = useCallback(
    (transaction: Transaction): TagAction[] => {
      const { actions, matchedRuleIds } = evaluateRulesWithIds(transaction, rules);
      if (matchedRuleIds.length > 0) {
        incrementMatchCounts(matchedRuleIds);
        refresh();
      }
      return actions;
    },
    [rules, refresh],
  );

  const createFromTransaction = useCallback(
    (transaction: Transaction, name: string): TaggingRule => {
      const rule = createRuleFromTransaction(transaction, name);
      refresh();
      return rule;
    },
    [refresh],
  );

  const testRules = useCallback(
    (transactions: Transaction[]): Map<string, string[]> => {
      const results = new Map<string, string[]>();
      for (const rule of rules) {
        if (!rule.enabled) continue;
        const matchingIds = transactions
          .filter(
            (txn) =>
              rule.conditions.length > 0 && rule.conditions.every((c) => matchCondition(txn, c)),
          )
          .map((txn) => txn.id);
        if (matchingIds.length > 0) {
          results.set(rule.id, matchingIds);
        }
      }
      return results;
    },
    [rules],
  );

  return {
    rules,
    loading,
    error,
    refresh,
    addRule,
    editRule,
    removeRule,
    toggleRule,
    applyRules,
    applyAndTrack,
    createFromTransaction,
    testRules,
  };
}
