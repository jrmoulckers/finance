// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useState } from 'react';

import type { CreateTransactionInput } from '../db/repositories/transactions';
import type { Category } from '../kmp/bridge';
import { meetsConfidenceThreshold } from '../lib/categorization/confidence';
import {
  suggestCategory as engineSuggestCategory,
  suggestTransactionCategory,
} from '../lib/categorization/engine';
import {
  AUTO_CATEGORIZATION_CHANGED_EVENT,
  clearLearnedRules,
  deleteLearnedRule,
  loadAutoCategorizationSettings,
  loadLearnedRules,
  saveLearnedRule,
  updateAutoCategorizationSettings,
  updateLearnedRule,
} from '../lib/categorization/learner';
import type {
  AutoCategorizationSettings,
  CategorySuggestion,
  LearnedCategorizationRule,
  LearningEntry,
  TransactionLike,
} from '../lib/categorization/types';

export interface UseAutoCategorizeResult {
  settings: AutoCategorizationSettings;
  learnedRules: LearnedCategorizationRule[];
  suggestCategory: (description: string, amountCents?: number) => CategorySuggestion | null;
  suggestForTransaction: (transaction: TransactionLike) => CategorySuggestion | null;
  shouldAutoApply: (suggestion: CategorySuggestion | null) => boolean;
  autoCategorizeInput: (
    input: Pick<CreateTransactionInput, 'payee' | 'note' | 'amount' | 'categoryId'>,
  ) => string | null;
  learnFromFeedback: (entry: LearningEntry) => void;
  updateRule: (ruleId: string, updates: Partial<LearnedCategorizationRule>) => void;
  deleteRule: (ruleId: string) => void;
  clearRules: () => void;
  setEnabled: (enabled: boolean) => void;
  setConfidenceThreshold: (threshold: number) => void;
}

export function useAutoCategorize(categories: Category[]): UseAutoCategorizeResult {
  const [settings, setSettings] = useState<AutoCategorizationSettings>(() =>
    loadAutoCategorizationSettings(),
  );
  const [learnedRules, setLearnedRules] = useState<LearnedCategorizationRule[]>(() =>
    loadLearnedRules(),
  );

  const syncState = useCallback(() => {
    setSettings(loadAutoCategorizationSettings());
    setLearnedRules(loadLearnedRules());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleChange = () => {
      syncState();
    };

    window.addEventListener(AUTO_CATEGORIZATION_CHANGED_EVENT, handleChange);
    window.addEventListener('storage', handleChange);

    return () => {
      window.removeEventListener(AUTO_CATEGORIZATION_CHANGED_EVENT, handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, [syncState]);

  const suggestCategory = useCallback(
    (description: string, amountCents?: number): CategorySuggestion | null => {
      if (!settings.enabled) {
        return null;
      }

      return engineSuggestCategory(description, categories, amountCents);
    },
    [categories, settings.enabled],
  );

  const suggestForTransaction = useCallback(
    (transaction: TransactionLike): CategorySuggestion | null => {
      if (!settings.enabled) {
        return null;
      }

      return suggestTransactionCategory(transaction, categories);
    },
    [categories, settings.enabled],
  );

  const shouldAutoApply = useCallback(
    (suggestion: CategorySuggestion | null): boolean => {
      return (
        suggestion !== null &&
        meetsConfidenceThreshold(suggestion.confidence, settings.confidenceThreshold)
      );
    },
    [settings.confidenceThreshold],
  );

  const autoCategorizeInput = useCallback(
    (
      input: Pick<CreateTransactionInput, 'payee' | 'note' | 'amount' | 'categoryId'>,
    ): string | null => {
      if (!settings.enabled) {
        return input.categoryId ?? null;
      }

      if (input.categoryId) {
        return input.categoryId;
      }

      const description = input.payee?.trim() || input.note?.trim() || '';
      const amountCents = input.amount ? Math.abs(input.amount.amount) : undefined;
      const suggestion = suggestCategory(description, amountCents);
      if (suggestion === null) {
        return null;
      }

      return shouldAutoApply(suggestion) ? suggestion.categoryId : null;
    },
    [settings.enabled, shouldAutoApply, suggestCategory],
  );

  const learnFromFeedback = useCallback(
    (entry: LearningEntry): void => {
      const categoryName =
        entry.categoryName ??
        categories.find((category) => category.id === entry.categoryId)?.name ??
        null;
      saveLearnedRule({
        ...entry,
        categoryName,
      });
      syncState();
    },
    [categories, syncState],
  );

  const handleUpdateRule = useCallback(
    (ruleId: string, updates: Partial<LearnedCategorizationRule>): void => {
      const categoryName =
        updates.categoryId !== undefined
          ? (categories.find((category) => category.id === updates.categoryId)?.name ?? null)
          : updates.categoryName;

      updateLearnedRule(ruleId, {
        merchant: updates.merchant,
        categoryId: updates.categoryId,
        categoryName,
        amountRange: updates.amountRange,
      });
      syncState();
    },
    [categories, syncState],
  );

  const handleDeleteRule = useCallback(
    (ruleId: string): void => {
      deleteLearnedRule(ruleId);
      syncState();
    },
    [syncState],
  );

  const handleClearRules = useCallback((): void => {
    clearLearnedRules();
    syncState();
  }, [syncState]);

  const setEnabled = useCallback(
    (enabled: boolean): void => {
      updateAutoCategorizationSettings({ enabled });
      syncState();
    },
    [syncState],
  );

  const setConfidenceThreshold = useCallback(
    (confidenceThreshold: number): void => {
      updateAutoCategorizationSettings({ confidenceThreshold });
      syncState();
    },
    [syncState],
  );

  return {
    settings,
    learnedRules,
    suggestCategory,
    suggestForTransaction,
    shouldAutoApply,
    autoCategorizeInput,
    learnFromFeedback,
    updateRule: handleUpdateRule,
    deleteRule: handleDeleteRule,
    clearRules: handleClearRules,
    setEnabled,
    setConfidenceThreshold,
  };
}
