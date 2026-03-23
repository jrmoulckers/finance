// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for accessing and mutating recurring transaction rules.
 *
 * Reads from localStorage via the recurring-rules repository.
 * All operations are synchronous; errors are captured in state rather
 * than thrown so callers can render gracefully.
 *
 * Usage:
 * ```tsx
 * const { rules, loading, error, createRule, refresh } = useRecurringRules();
 * ```
 *
 * References: todo s7-recurring
 */

import { useCallback, useEffect, useState } from 'react';
import {
  createRecurringRule,
  deleteRecurringRule,
  getAllRecurringRules,
  getRecurringRuleById,
  getUpcomingTransactions,
  updateRecurringRule,
  type CreateRecurringRuleInput,
  type RecurringRule,
  type UpcomingOccurrence,
} from '../db/repositories/recurring-rules';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useRecurringRules}. */
export interface UseRecurringRulesResult {
  /** All recurring rules. */
  rules: RecurringRule[];
  /** `true` while the initial or refresh load is in progress. */
  loading: boolean;
  /** Human-readable error message from the last failed operation, or `null`. */
  error: string | null;
  /**
   * Create a new recurring rule and automatically refresh the list.
   * @returns The created rule, or `null` if creation failed.
   */
  createRule: (input: CreateRecurringRuleInput) => RecurringRule | null;
  /**
   * Update an existing recurring rule and automatically refresh the list.
   * @returns The updated rule, or `null` if the rule was not found or update failed.
   */
  updateRule: (
    id: string,
    updates: Partial<CreateRecurringRuleInput> & { isActive?: boolean },
  ) => RecurringRule | null;
  /**
   * Delete a recurring rule and automatically refresh the list.
   * @returns `true` if deletion succeeded, `false` otherwise.
   */
  deleteRule: (id: string) => boolean;
  /**
   * Generate a preview of the next `count` upcoming occurrences for a rule.
   * @param ruleId The rule ID to generate occurrences for.
   * @param count Number of upcoming occurrences (default 5).
   * @returns Array of upcoming occurrences, or empty array if rule not found.
   */
  getUpcoming: (ruleId: string, count?: number) => UpcomingOccurrence[];
  /** Trigger a re-fetch of all rules from localStorage. */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Load all recurring rules from localStorage and expose CRUD operations. */
export function useRecurringRules(): UseRecurringRulesResult {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  /** Increment the refresh token to trigger a data re-fetch. */
  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      const result = getAllRecurringRules();
      setRules(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recurring rules.');
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [refreshToken]);

  const createRule = useCallback(
    (input: CreateRecurringRuleInput): RecurringRule | null => {
      try {
        const created = createRecurringRule(input);
        refresh();
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create recurring rule.');
        setLoading(false);
        return null;
      }
    },
    [refresh],
  );

  const updateRule = useCallback(
    (
      id: string,
      updates: Partial<CreateRecurringRuleInput> & { isActive?: boolean },
    ): RecurringRule | null => {
      try {
        const updated = updateRecurringRule(id, updates);
        if (updated !== null) {
          refresh();
        }
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update recurring rule.');
        setLoading(false);
        return null;
      }
    },
    [refresh],
  );

  const deleteRuleHandler = useCallback(
    (id: string): boolean => {
      try {
        const deleted = deleteRecurringRule(id);
        if (deleted) {
          refresh();
        }
        return deleted;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete recurring rule.');
        setLoading(false);
        return false;
      }
    },
    [refresh],
  );

  const getUpcoming = useCallback((ruleId: string, count: number = 5): UpcomingOccurrence[] => {
    try {
      const rule = getRecurringRuleById(ruleId);
      if (!rule) return [];
      return getUpcomingTransactions(rule, count);
    } catch {
      return [];
    }
  }, []);

  return {
    rules,
    loading,
    error,
    createRule,
    updateRule,
    deleteRule: deleteRuleHandler,
    getUpcoming,
    refresh,
  };
}
