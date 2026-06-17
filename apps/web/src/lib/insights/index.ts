// SPDX-License-Identifier: BUSL-1.1

export { calculateHealthScore, isLiquidAccountType, type HealthScoreInput } from './healthScore';
export { generatePersonalizedInsights } from './insightGenerator';
export { calculateNetWorthTrend } from './netWorthTracker';
export { analyzeSavingsRate } from './savingsRate';
export { analyzeSpendingByCategory } from './spendingAnalysis';
export type {
  DigestPeriod,
  GeneratedInsight,
  GoalProgressUpdate,
  HealthScoreResult,
  NetWorthTrend,
  SavingsRateAnalysis,
  SpendingAnalysis,
  WealthDigest,
} from './types';
