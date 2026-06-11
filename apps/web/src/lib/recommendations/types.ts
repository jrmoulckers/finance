// SPDX-License-Identifier: BUSL-1.1

import type { BudgetWithSpending } from '../../db/repositories/budgets';
import type { Account, Category, Goal, Transaction } from '../../kmp/bridge';
import type { HealthScoreResult, SavingsRateAnalysis, SpendingAnalysis } from '../insights/types';
import type { DetectedSubscription } from '../analytics/subscriptions';
import type { EmergencyRunwayResult } from '../savings/types';

export type RecommendationCategory =
  | 'cash-flow'
  | 'spending'
  | 'budget'
  | 'savings'
  | 'emergency-fund'
  | 'subscriptions';

export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';

export type RecommendationIcon =
  | 'alert-triangle'
  | 'bank'
  | 'calendar'
  | 'chart-bar'
  | 'sparkles'
  | 'target'
  | 'trending-down'
  | 'wallet';

export interface RecommendationActionStep {
  readonly title: string;
  readonly description: string;
  readonly href?: string;
}

export interface RecommendationImpact {
  readonly monthlySavingsCents?: number;
  readonly annualSavingsCents?: number;
  readonly currentRunwayMonths?: number;
  readonly targetRunwayMonths?: number;
  readonly monthsToTarget?: number | null;
}

export interface PersonalizedRecommendation {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly explanation: string;
  readonly category: RecommendationCategory;
  readonly priority: RecommendationPriority;
  readonly score: number;
  readonly currencyCode: string;
  readonly icon: RecommendationIcon;
  readonly tags: readonly string[];
  readonly actionLabel?: string;
  readonly actionHref?: string;
  readonly actionSteps: readonly RecommendationActionStep[];
  readonly evidence: readonly string[];
  readonly impact?: RecommendationImpact;
}

export interface RecommendationSummary {
  readonly totalCount: number;
  readonly criticalCount: number;
  readonly highCount: number;
  readonly estimatedMonthlySavingsCents: number;
  readonly lastAnalyzedAt: string;
}

export interface RecommendationEngineResult {
  readonly recommendations: readonly PersonalizedRecommendation[];
  readonly summary: RecommendationSummary;
}

export interface RecommendationEngineOptions {
  readonly maxRecommendations?: number;
}

export interface RecommendationEngineInput {
  readonly accounts: readonly Account[];
  readonly budgets: readonly BudgetWithSpending[];
  readonly categories: readonly Category[];
  readonly goals: readonly Goal[];
  readonly transactions: readonly Transaction[];
  readonly subscriptions?: readonly DetectedSubscription[];
  readonly now?: Date;
}

export interface BudgetPressure {
  readonly budget: BudgetWithSpending;
  readonly usagePercent: number;
  readonly overspentCents: number;
}

export interface PreparedRecommendationContext extends RecommendationEngineInput {
  readonly now: Date;
  readonly currencyCode: string;
  readonly activeBudgets: readonly BudgetWithSpending[];
  readonly budgetPressures: readonly BudgetPressure[];
  readonly currentMonthIncome: number;
  readonly currentMonthExpenses: number;
  readonly currentMonthSavings: number;
  readonly projectedMonthlyExpenses: number;
  readonly liquidFundsCents: number;
  readonly spending: SpendingAnalysis;
  readonly savingsRate: SavingsRateAnalysis;
  readonly healthScore: HealthScoreResult;
  readonly emergencyRunway: EmergencyRunwayResult;
  readonly subscriptions: readonly DetectedSubscription[];
}

export interface RecommendationSignal {
  readonly urgency: number;
  readonly confidence: number;
  readonly specificity: number;
  readonly monthlySavingsCents?: number;
}

export interface RecommendationCandidate {
  readonly recommendation: Omit<PersonalizedRecommendation, 'score'>;
  readonly signal: RecommendationSignal;
}

export type RecommendationRule = (
  context: PreparedRecommendationContext,
) => readonly RecommendationCandidate[];
