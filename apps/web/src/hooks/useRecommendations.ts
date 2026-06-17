// SPDX-License-Identifier: BUSL-1.1

import { useCallback } from 'react';
import { getAllAccounts } from '../db/repositories/accounts';
import {
  getAllBudgets,
  getBudgetWithSpending,
  type BudgetWithSpending,
} from '../db/repositories/budgets';
import { getAllCategories } from '../db/repositories/categories';
import { getAllGoals } from '../db/repositories/goals';
import { getAllTransactions } from '../db/repositories/transactions';
import type { SqliteDb } from '../db/sqlite-wasm';
import {
  generateRecommendations,
  type PersonalizedRecommendation,
  type RecommendationSummary,
} from '../lib/recommendations';
import { useLiveQuery } from './useLiveQuery';

export interface UseRecommendationsResult {
  readonly recommendations: readonly PersonalizedRecommendation[];
  readonly summary: RecommendationSummary;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
}

const EMPTY_SUMMARY: RecommendationSummary = {
  totalCount: 0,
  criticalCount: 0,
  highCount: 0,
  estimatedMonthlySavingsCents: 0,
  lastAnalyzedAt: new Date(0).toISOString(),
};

function enrichBudgets(db: SqliteDb): readonly BudgetWithSpending[] {
  return getAllBudgets(db).map((budget) => {
    const enriched = getBudgetWithSpending(db, budget.id);
    if (enriched) {
      return enriched;
    }

    return {
      ...budget,
      spentAmount: { amount: 0 },
      remainingAmount: { amount: budget.amount.amount },
    };
  });
}

function loadRecommendations(db: SqliteDb) {
  return generateRecommendations({
    accounts: getAllAccounts(db),
    budgets: enrichBudgets(db),
    categories: getAllCategories(db),
    goals: getAllGoals(db),
    transactions: getAllTransactions(db),
  });
}

export function useRecommendations(maxRecommendations: number = 5): UseRecommendationsResult {
  const queryFn = useCallback(
    (database: SqliteDb) => {
      const result = loadRecommendations(database);
      const recommendations = result.recommendations.slice(0, maxRecommendations);
      return {
        recommendations,
        summary: {
          ...result.summary,
          totalCount: recommendations.length,
          criticalCount: recommendations.filter(
            (recommendation) => recommendation.priority === 'critical',
          ).length,
          highCount: recommendations.filter((recommendation) => recommendation.priority === 'high')
            .length,
          estimatedMonthlySavingsCents: recommendations.reduce(
            (sum, recommendation) => sum + (recommendation.impact?.monthlySavingsCents ?? 0),
            0,
          ),
        },
      };
    },
    [maxRecommendations],
  );

  const { data, loading, error, refresh } = useLiveQuery(
    'SELECT id FROM "transaction" WHERE deleted_at IS NULL',
    [],
    {
      initialData: {
        recommendations: [],
        summary: EMPTY_SUMMARY,
      },
      tables: ['account', 'budget', 'category', 'goal', 'transaction'],
      queryFn,
    },
  );

  return {
    recommendations: data.recommendations,
    summary: data.summary,
    loading,
    error,
    refresh,
  };
}
