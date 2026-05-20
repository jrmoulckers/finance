// SPDX-License-Identifier: BUSL-1.1

/**
 * Barrel re-export for visualization data engines.
 *
 * References: issues #1564, #1579, #1584, #1670, #1724, #1741, #1766
 */

// Types
export type {
  BudgetTag,
  BuiltInTag,
  CustomTag,
  TaggedTransaction,
  TagBreakdown,
  ValueTarget,
  ValueAlignment,
  AlignmentScore,
  AlignmentTrendPoint,
  MisalignmentAlert,
  IntensityBucket,
  HeatmapCell,
  HeatmapWeek,
  HeatmapData,
  MonthlyTotal,
  SpendingStreak,
  YearOverYearDay,
  SankeyNode,
  SankeyLink,
  SankeyDiagram,
  SankeyPeriod,
  BenchmarkCategory,
  LifeStage,
  LifeStageDefinition,
  PeerComparison,
  PeerBenchmarkReport,
  CategoryMapping,
  InsightType,
  InsightPriority,
  SpendingInsight,
  InsightInput,
  BudgetForInsight,
} from './types';

// Budget tags (#1564)
export {
  bankersRound,
  safePercent,
  assignTag,
  assignTagsByCategory,
  computeTagBreakdown,
  computeAlignment,
  computeAlignmentTrend,
  detectMisalignmentAlerts,
} from './budget-tags';

// Heatmap data (#1579, #1741)
export {
  intensityToBucket,
  aggregateDaily,
  buildHeatmapCells,
  groupByWeek,
  computeMonthlyTotals,
  detectStreaks,
  compareYearOverYear,
  buildHeatmapData,
} from './heatmap-data';
export type { HeatmapTransaction } from './heatmap-data';

// Sankey data (#1584, #1724)
export {
  filterByPeriod,
  buildSankeyDiagram,
  computeAccountNetFlows,
  DEFAULT_SANKEY_CONFIG,
} from './sankey-data';
export type { SankeyTransaction, SankeyConfig } from './sankey-data';

// Peer benchmarks (#1670)
export {
  BLS_CATEGORIES,
  LIFE_STAGES,
  getBenchmarkPercent,
  getLifeStageDefinition,
  estimatePercentile,
  aggregateByBenchmarkCategory,
  generateBenchmarkReport,
} from './peer-benchmarks';
export type { UserSpending } from './peer-benchmarks';

// Spending insights (#1766)
export {
  detectUnusualSpending,
  generateCategoryTrends,
  generateBudgetPaceAlerts,
  detectSpendingStreakInsights,
  detectMilestoneInsights,
  generateInsights,
  sumTransactions,
} from './spending-insights';
