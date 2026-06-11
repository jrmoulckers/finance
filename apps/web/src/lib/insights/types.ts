// SPDX-License-Identifier: BUSL-1.1

import type { GoalStatus } from '../../kmp/bridge';
import type { AlignmentSpendingSnapshot } from '../alignment';

export type DigestPeriod = 'weekly' | 'monthly';
export type TrendDirection = 'up' | 'down' | 'flat';
export type InsightTone = 'info' | 'warning' | 'success';
export type InsightIcon =
  | 'alert-triangle'
  | 'bank'
  | 'chart-bar'
  | 'check-circle'
  | 'sparkles'
  | 'target'
  | 'trending-down'
  | 'trending-up'
  | 'wallet';

export interface MetricChange {
  readonly amount: number;
  readonly percent: number;
  readonly direction: TrendDirection;
}

export interface PeriodSnapshot {
  readonly label: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly netWorth: number;
  readonly income: number;
  readonly spending: number;
  readonly savingsRate: number;
}

export interface NetWorthTrend {
  readonly current: number;
  readonly previous: number;
  readonly assets: number;
  readonly liabilities: number;
  readonly change: MetricChange;
  readonly history: readonly PeriodSnapshot[];
}

export interface SpendingCategoryInsight {
  readonly categoryId: string | null;
  readonly categoryName: string;
  readonly currentAmount: number;
  readonly previousAmount: number;
  readonly shareOfSpending: number;
  readonly change: MetricChange;
}

export interface SpendingAnalysis {
  readonly totalCurrentSpending: number;
  readonly totalPreviousSpending: number;
  readonly change: MetricChange;
  readonly topCategories: readonly SpendingCategoryInsight[];
}

export interface SavingsRatePeriod {
  readonly label: string;
  readonly income: number;
  readonly spending: number;
  readonly savings: number;
  readonly rate: number;
}

export interface SavingsRateAnalysis {
  readonly currentRate: number;
  readonly previousRate: number;
  readonly rateChangePoints: number;
  readonly change: MetricChange;
  readonly currentIncome: number;
  readonly currentSpending: number;
  readonly currentSavings: number;
  readonly history: readonly SavingsRatePeriod[];
}

export interface GoalProgressUpdate {
  readonly id: string;
  readonly name: string;
  readonly status: GoalStatus;
  readonly progressPercent: number;
  readonly targetAmount: number;
  readonly currentAmount: number;
  readonly remainingAmount: number;
  readonly targetDate: string | null;
  readonly pace: 'ahead' | 'on-track' | 'needs-attention' | 'completed';
  readonly monthlyContributionNeeded: number | null;
}

export interface HealthScoreBreakdown {
  readonly savingsRate: number;
  readonly budgetAdherence: number;
  readonly emergencyFund: number;
  readonly debtToIncome: number;
}

export interface HealthScoreMetrics {
  readonly savingsRate: number;
  readonly onTrackBudgetRatio: number;
  readonly monthsOfExpensesSaved: number;
  readonly debtToIncomeRatio: number;
}

export interface HealthScoreResult {
  readonly score: number;
  readonly label: 'Excellent' | 'Strong' | 'Stable' | 'Needs attention';
  readonly breakdown: HealthScoreBreakdown;
  readonly metrics: HealthScoreMetrics;
}

export interface GeneratedInsight {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly tone: InsightTone;
  readonly icon: InsightIcon;
  readonly actionLabel?: string;
  readonly actionHref?: string;
}

export interface WealthDigest {
  readonly period: DigestPeriod;
  readonly currencyCode: string;
  readonly generatedAt: string;
  readonly netWorth: NetWorthTrend;
  readonly spending: SpendingAnalysis;
  readonly savingsRate: SavingsRateAnalysis;
  readonly goals: readonly GoalProgressUpdate[];
  readonly healthScore: HealthScoreResult;
  readonly alignmentSnapshot: AlignmentSpendingSnapshot;
  readonly highlights: readonly GeneratedInsight[];
}
