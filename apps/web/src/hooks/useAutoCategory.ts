// SPDX-License-Identifier: BUSL-1.1

import { useCallback } from 'react';

import type { Category } from '../kmp/bridge';
import { loadUserRules, type UserRule } from '../lib/categorization/user-rules';
import type { CategorySuggestion } from '../lib/categorization';
import { useAutoCategorize } from './useAutoCategorize';

export interface UseAutoCategoryResult {
  suggestCategory: (description: string, amount?: number) => CategorySuggestion | null;
  learnCorrection: (description: string, categoryId: string) => void;
  getSuggestionHistory: () => UserRule[];
  clearLearnedRules: () => void;
}

export function useAutoCategory(categories: Category[]): UseAutoCategoryResult {
  const { suggestCategory, learnFromFeedback, clearRules } = useAutoCategorize(categories);

  const learnCorrection = useCallback(
    (description: string, categoryId: string): void => {
      learnFromFeedback({
        description,
        categoryId,
        categoryName: categories.find((category) => category.id === categoryId)?.name ?? null,
      });
    },
    [categories, learnFromFeedback],
  );

  const getSuggestionHistory = useCallback((): UserRule[] => {
    return loadUserRules();
  }, []);

  return {
    suggestCategory,
    learnCorrection,
    getSuggestionHistory,
    clearLearnedRules: clearRules,
  };
}
