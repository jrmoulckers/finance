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
import type { AsyncDb } from '../db/async-db';
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

async function enrichBudgets(db: AsyncDb): Promise<readonly BudgetWithSpending[]> {
  const budgets = await getAllBudgets(db);
  return Promise.all(
    budgets.map(async (budget) => {
      const enriched = await getBudgetWithSpending(db, budget.id);
      if (enriched) {
        return enriched;
      }

      return {
        ...budget,
        spentAmount: { amount: 0 },
        remainingAmount: { amount: budget.amount.amount },
      };
    }),
  );
}

async function loadRecommendations(db: AsyncDb) {
  return generateRecommendations({
    accounts: await getAllAccounts(db),
    budgets: await enrichBudgets(db),
    categories: await getAllCategories(db),
    goals: await getAllGoals(db),
    transactions: await getAllTransactions(db),
  });
}

export function useRecommendations(maxRecommendations: number = 5): UseRecommendationsResult {
  const queryFn = useCallback(
    async (database: AsyncDb) => {
      const result = await loadRecommendations(database);
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
    'SELECT id FROM transactions WHERE deleted_at IS NULL',
    [],
    {
      initialData: {
        recommendations: [],
        summary: EMPTY_SUMMARY,
      },
      tables: ['accounts', 'budgets', 'categories', 'goals', 'transactions'],
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
