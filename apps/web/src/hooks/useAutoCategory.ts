// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for on-device auto-categorisation of transactions.
 *
 * Wraps the categorisation engine to provide a simple interface for
 * suggesting categories based on transaction descriptions and learning
 * from user corrections.
 *
 * Usage:
 * ```tsx
 * const { suggestCategory, learnCorrection, clearLearnedRules } = useAutoCategory(categories);
 * const suggestion = suggestCategory('Walmart Supercenter', 5000);
 * ```
 *
 * @module hooks/useAutoCategory
 * @see {@link suggestCategory} from lib/categorization
 */

import { useCallback } from 'react';

import type { Category } from '../kmp/bridge';
import {
  suggestCategory as engineSuggestCategory,
  type CategorySuggestion,
} from '../lib/categorization/categorization-engine';
import {
  clearLearnedRules as engineClearRules,
  learnFromCorrection as engineLearn,
  loadUserRules,
  type UserRule,
} from '../lib/categorization/user-rules';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useAutoCategory}. */
export interface UseAutoCategoryResult {
  /**
   * Suggest a category for the given transaction description.
   *
   * @param description  Merchant / payee text.
   * @param amount       Optional amount in cents for heuristic matching.
   * @returns A suggestion with confidence and source, or `null`.
   */
  suggestCategory: (description: string, amount?: number) => CategorySuggestion | null;

  /**
   * Record a user correction so future transactions from the same merchant
   * are auto-categorised with the corrected category.
   */
  learnCorrection: (description: string, categoryId: string) => void;

  /** Return all user-learned rules currently stored in localStorage. */
  getSuggestionHistory: () => UserRule[];

  /** Remove all user-learned categorisation rules. */
  clearLearnedRules: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Provides auto-categorisation helpers bound to the user's category list.
 *
 * @param categories  Available categories from the database.
 */
export function useAutoCategory(categories: Category[]): UseAutoCategoryResult {
  const suggestCategory = useCallback(
    (description: string, amount?: number): CategorySuggestion | null => {
      return engineSuggestCategory(description, categories, amount);
    },
    [categories],
  );

  const learnCorrection = useCallback((description: string, categoryId: string): void => {
    engineLearn(description, categoryId);
  }, []);

  const getSuggestionHistory = useCallback((): UserRule[] => {
    return loadUserRules();
  }, []);

  const clearLearnedRules = useCallback((): void => {
    engineClearRules();
  }, []);

  return {
    suggestCategory,
    learnCorrection,
    getSuggestionHistory,
    clearLearnedRules,
  };
}
