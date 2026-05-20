// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared types for visualization data engines.
 *
 * All monetary values are integer cents to avoid floating-point errors.
 *
 * References: issues #1564, #1579, #1584, #1670, #1724, #1741, #1766
 */

// ---------------------------------------------------------------------------
// Budget Tags & Value Alignment (#1564)
// ---------------------------------------------------------------------------

/** Predefined value tag categories. */
export type BuiltInTag = 'NEEDS' | 'WANTS' | 'SAVINGS';

/** Custom user-defined sentiment tags. */
export type CustomTag = 'JOY' | 'GUILT' | 'NECESSITY' | 'INVESTMENT_IN_SELF';

/** A budget tag — either built-in or custom string. */
export type BudgetTag = BuiltInTag | CustomTag | string;

/** A transaction with its assigned value tag. */
export interface TaggedTransaction {
  /** Transaction identifier. */
  readonly transactionId: string;
  /** Assigned value tag. */
  readonly tag: BudgetTag;
  /** Transaction amount in cents (positive). */
  readonly amountCents: number;
  /** Category identifier for grouping. */
  readonly categoryId: string | null;
  /** ISO date string (YYYY-MM-DD). */
  readonly date: string;
}

/** Spending breakdown by tag. */
export interface TagBreakdown {
  /** The tag label. */
  readonly tag: BudgetTag;
  /** Total spent in cents. */
  readonly totalCents: number;
  /** Percentage of total spending (0–100). */
  readonly percent: number;
  /** Number of transactions with this tag. */
  readonly count: number;
}

/** User-stated values with target percentages. */
export interface ValueTarget {
  /** The tag this target applies to. */
  readonly tag: BudgetTag;
  /** Desired percentage of spending (0–100). */
  readonly targetPercent: number;
}

/** Alignment between actual spending and stated values. */
export interface ValueAlignment {
  /** The tag. */
  readonly tag: BudgetTag;
  /** Target percentage (0–100). */
  readonly targetPercent: number;
  /** Actual percentage (0–100). */
  readonly actualPercent: number;
  /** Deviation: actual - target (positive = over, negative = under). */
  readonly deviationPercent: number;
  /** Whether this tag is misaligned beyond the threshold. */
  readonly isMisaligned: boolean;
}

/** Overall alignment score result. */
export interface AlignmentScore {
  /** Score from 0 to 100 — higher is better aligned. */
  readonly score: number;
  /** Per-tag alignment details. */
  readonly alignments: readonly ValueAlignment[];
  /** Total spending analysed in cents. */
  readonly totalSpendingCents: number;
}

/** Alignment trend for a single period. */
export interface AlignmentTrendPoint {
  /** Period label (e.g. "2024-01"). */
  readonly period: string;
  /** Alignment score for this period (0–100). */
  readonly score: number;
}

/** Alert for significant misalignment. */
export interface MisalignmentAlert {
  /** The misaligned tag. */
  readonly tag: BudgetTag;
  /** Short human-readable message. */
  readonly message: string;
  /** Severity level. */
  readonly severity: 'info' | 'warning' | 'critical';
  /** Deviation percentage (absolute). */
  readonly deviationPercent: number;
}

// ---------------------------------------------------------------------------
// Calendar Heatmap (#1579, #1741)
// ---------------------------------------------------------------------------

/** Spending intensity bucket for color mapping. */
export type IntensityBucket = 'none' | 'low' | 'medium' | 'high' | 'extreme';

/** A single day's data in the heatmap grid. */
export interface HeatmapCell {
  /** ISO date (YYYY-MM-DD). */
  readonly date: string;
  /** Total spending in cents. */
  readonly totalCents: number;
  /** Ratio of this day's spending to the daily average (0 if no avg). */
  readonly intensity: number;
  /** Color bucket derived from intensity. */
  readonly bucket: IntensityBucket;
  /** Number of transactions. */
  readonly transactionCount: number;
}

/** Weekly summary row within a heatmap. */
export interface HeatmapWeek {
  /** ISO week number (1–53). */
  readonly weekNumber: number;
  /** Cells for each day of the week (0 = Sunday, 6 = Saturday). */
  readonly days: readonly (HeatmapCell | null)[];
  /** Total spending for the week in cents. */
  readonly totalCents: number;
}

/** Complete heatmap dataset for a date range. */
export interface HeatmapData {
  /** All cells indexed by date. */
  readonly cells: readonly HeatmapCell[];
  /** Weekly groupings. */
  readonly weeks: readonly HeatmapWeek[];
  /** Monthly totals. */
  readonly monthlyTotals: readonly MonthlyTotal[];
  /** Daily average spending in cents across the range. */
  readonly dailyAverageCents: number;
  /** Detected spending streaks. */
  readonly streaks: readonly SpendingStreak[];
}

/** Monthly total for heatmap summary. */
export interface MonthlyTotal {
  /** Month label (YYYY-MM). */
  readonly month: string;
  /** Total spending in cents. */
  readonly totalCents: number;
  /** Number of days with transactions. */
  readonly activeDays: number;
}

/** A streak of consecutive days meeting a spending threshold. */
export interface SpendingStreak {
  /** Type of streak. */
  readonly type: 'low_spend' | 'high_spend' | 'no_spend';
  /** First date (YYYY-MM-DD). */
  readonly startDate: string;
  /** Last date (YYYY-MM-DD). */
  readonly endDate: string;
  /** Number of consecutive days. */
  readonly days: number;
}

/** Year-over-year comparison for a single calendar day. */
export interface YearOverYearDay {
  /** Month-day label (MM-DD). */
  readonly monthDay: string;
  /** Spending in the current year in cents. */
  readonly currentYearCents: number;
  /** Spending in the prior year in cents. */
  readonly priorYearCents: number;
  /** Change in cents (current - prior). */
  readonly changeCents: number;
  /** Change as a percentage (null if prior was 0). */
  readonly changePercent: number | null;
}

// ---------------------------------------------------------------------------
// Sankey Money Flow (#1584, #1724)
// ---------------------------------------------------------------------------

/** A node in a Sankey diagram. */
export interface SankeyNode {
  /** Unique node identifier. */
  readonly id: string;
  /** Display label. */
  readonly label: string;
  /** Which column/level the node belongs to. */
  readonly level: number;
  /** Node type for styling. */
  readonly type: 'income' | 'account' | 'category' | 'subcategory' | 'savings';
  /** Total value flowing through this node in cents. */
  readonly valueCents: number;
}

/** A directional link between two Sankey nodes. */
export interface SankeyLink {
  /** Source node id. */
  readonly source: string;
  /** Target node id. */
  readonly target: string;
  /** Flow amount in cents. */
  readonly valueCents: number;
  /** Percentage of source's total outflow (0–100). */
  readonly percentOfSource: number;
}

/** Complete Sankey diagram data. */
export interface SankeyDiagram {
  /** All nodes. */
  readonly nodes: readonly SankeyNode[];
  /** All links between nodes. */
  readonly links: readonly SankeyLink[];
  /** Total income flowing in (cents). */
  readonly totalIncomeCents: number;
  /** Total expenses flowing out (cents). */
  readonly totalExpensesCents: number;
  /** Net flow: income - expenses (cents). */
  readonly netFlowCents: number;
}

/** Aggregation period for Sankey data. */
export type SankeyPeriod = 'monthly' | 'quarterly' | 'annual';

// ---------------------------------------------------------------------------
// Peer Benchmarks (#1670)
// ---------------------------------------------------------------------------

/** A BLS Consumer Expenditure Survey category. */
export interface BenchmarkCategory {
  /** Category key (e.g. "housing", "transportation"). */
  readonly key: string;
  /** Human-readable label. */
  readonly label: string;
  /** National average percentage of total spending. */
  readonly nationalAveragePercent: number;
}

/** Life stage for benchmark comparison. */
export type LifeStage =
  | 'single_young_professional'
  | 'couple_no_kids'
  | 'family_young_kids'
  | 'family_teens'
  | 'empty_nester'
  | 'retiree';

/** Life stage definition with benchmark adjustments. */
export interface LifeStageDefinition {
  /** Life stage key. */
  readonly stage: LifeStage;
  /** Human-readable label. */
  readonly label: string;
  /** Adjusted benchmark percentages by category key. */
  readonly adjustments: Readonly<Record<string, number>>;
}

/** Comparison of user spending to benchmark for a single category. */
export interface PeerComparison {
  /** Category key. */
  readonly categoryKey: string;
  /** Category label. */
  readonly categoryLabel: string;
  /** Benchmark percentage for the user's life stage. */
  readonly benchmarkPercent: number;
  /** User's actual percentage. */
  readonly actualPercent: number;
  /** Difference: actual - benchmark (positive = over). */
  readonly differencePercent: number;
  /** Estimated percentile (0–100) among peers. */
  readonly estimatedPercentile: number;
  /** User spending in cents. */
  readonly userAmountCents: number;
  /** Benchmark amount in cents (based on user total). */
  readonly benchmarkAmountCents: number;
}

/** Full peer benchmark report. */
export interface PeerBenchmarkReport {
  /** Life stage used for comparison. */
  readonly lifeStage: LifeStage;
  /** Per-category comparisons. */
  readonly comparisons: readonly PeerComparison[];
  /** Total user spending in cents. */
  readonly totalSpendingCents: number;
  /** Categories where user is significantly over benchmark. */
  readonly overSpending: readonly PeerComparison[];
  /** Categories where user is significantly under benchmark. */
  readonly underSpending: readonly PeerComparison[];
}

// ---------------------------------------------------------------------------
// Spending Insights (#1766)
// ---------------------------------------------------------------------------

/** Type of contextual spending insight. */
export type InsightType =
  | 'unusual_spending'
  | 'category_trend'
  | 'budget_pace'
  | 'streak'
  | 'milestone'
  | 'peer_comparison';

/** Priority level for insight ranking. */
export type InsightPriority = 'high' | 'medium' | 'low';

/** A single contextual spending insight. */
export interface SpendingInsight {
  /** Unique identifier for deduplication. */
  readonly id: string;
  /** Insight type. */
  readonly type: InsightType;
  /** Priority for display ordering. */
  readonly priority: InsightPriority;
  /** Short human-readable title. */
  readonly title: string;
  /** Longer narrative description. */
  readonly description: string;
  /** Optional category this insight relates to. */
  readonly categoryId: string | null;
  /** Optional amount in cents relevant to the insight. */
  readonly amountCents: number | null;
  /** Optional percentage relevant to the insight. */
  readonly percentChange: number | null;
  /** ISO date when the insight was generated. */
  readonly generatedAt: string;
}

/** Input data for insight generation. */
export interface InsightInput {
  /** Current period transactions. */
  readonly currentTransactions: readonly TaggedTransaction[];
  /** Prior period transactions for comparison. */
  readonly priorTransactions: readonly TaggedTransaction[];
  /** Budget allocations for pace alerts. */
  readonly budgets: readonly BudgetForInsight[];
  /** Current date (ISO YYYY-MM-DD). */
  readonly today: string;
  /** Day of the month (1–31). */
  readonly dayOfMonth: number;
  /** Days in the current month. */
  readonly daysInMonth: number;
}

/** Minimal budget info needed for insight generation. */
export interface BudgetForInsight {
  /** Category identifier. */
  readonly categoryId: string;
  /** Category name. */
  readonly categoryName: string;
  /** Budget amount in cents. */
  readonly budgetCents: number;
  /** Spent so far in cents. */
  readonly spentCents: number;
}

// ---------------------------------------------------------------------------
// Category mapping (used across modules)
// ---------------------------------------------------------------------------

/** Mapping from category IDs to benchmark category keys. */
export interface CategoryMapping {
  /** Category identifier. */
  readonly categoryId: string;
  /** Benchmark category key (e.g. "housing", "food"). */
  readonly benchmarkKey: string;
}
