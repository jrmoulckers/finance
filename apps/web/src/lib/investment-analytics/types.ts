// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared types for investment analytics engines.
 *
 * All monetary values are integer cents. Percentages that require precision
 * use basis points (1 bp = 0.01%). Dates are ISO-8601 strings.
 *
 * References: issues #1592, #1609, #1617, #1694, #1698, #1702, #1746
 */

// ---------------------------------------------------------------------------
// Primitive aliases
// ---------------------------------------------------------------------------

/** Integer cents — never floating-point dollars. */
export type Cents = number;

/** Basis points — 1 bp = 0.01%. */
export type BasisPoints = number;

/** ISO-8601 date string (YYYY-MM-DD). */
export type ISODate = string;

/** Percentage as a number (e.g., 7 means 7%). */
export type Percent = number;

// ---------------------------------------------------------------------------
// Trade import (#1592)
// ---------------------------------------------------------------------------

/** Supported trade action types. */
export type TradeAction = 'BUY' | 'SELL' | 'DIVIDEND' | 'TRANSFER_IN' | 'TRANSFER_OUT';

/** A single brokerage trade record. */
export interface Trade {
  readonly id: string;
  readonly date: ISODate;
  readonly symbol: string;
  readonly action: TradeAction;
  readonly shares: number;
  /** Total amount in cents. */
  readonly amountCents: Cents;
  /** Per-share price in cents. */
  readonly pricePerShareCents: Cents;
  /** Commission/fee in cents. */
  readonly commissionCents: Cents;
  readonly accountName?: string;
}

/** Raw brokerage CSV row before parsing. */
export interface TradeImportRow {
  readonly date: string;
  readonly symbol: string;
  readonly action: string;
  readonly shares: string;
  readonly amount: string;
  readonly price: string;
  readonly commission: string;
  readonly account?: string;
}

/** Duplicate detection key fields. */
export interface TradeFingerprint {
  readonly date: ISODate;
  readonly symbol: string;
  readonly amountCents: Cents;
  readonly action: TradeAction;
}

/** Result of reconciling imported trades against existing holdings. */
export interface ReconciliationResult {
  readonly newTrades: readonly Trade[];
  readonly duplicates: readonly Trade[];
  readonly matched: readonly Trade[];
  readonly totalImported: number;
  readonly newCount: number;
  readonly duplicateCount: number;
  readonly matchedCount: number;
}

// ---------------------------------------------------------------------------
// Benchmark comparison (#1609, #1698)
// ---------------------------------------------------------------------------

/** A standard or custom benchmark definition. */
export interface Benchmark {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly components: readonly BenchmarkComponent[];
}

/** A weighted component of a blended benchmark. */
export interface BenchmarkComponent {
  readonly indexId: string;
  readonly name: string;
  /** Weight as a percentage (0–100). */
  readonly weightPercent: Percent;
}

/** Return data for a single period. */
export interface PeriodReturn {
  readonly label: string;
  readonly months: number;
  /** Return as percentage. */
  readonly returnPercent: Percent;
}

/** Side-by-side benchmark vs portfolio comparison. */
export interface BenchmarkComparison {
  readonly benchmarkName: string;
  readonly periods: readonly PeriodComparisonEntry[];
  /** Alpha = portfolio return − benchmark return (annualized). */
  readonly alphaBps: BasisPoints;
  /** Beta — sensitivity to benchmark movements. */
  readonly beta: number;
  /** Tracking error in basis points. */
  readonly trackingErrorBps: BasisPoints;
  /** Information ratio = alpha / tracking error. */
  readonly informationRatio: number;
}

/** A single period in a benchmark comparison. */
export interface PeriodComparisonEntry {
  readonly label: string;
  readonly months: number;
  readonly portfolioReturnPercent: Percent;
  readonly benchmarkReturnPercent: Percent;
  readonly differencePercent: Percent;
}

// ---------------------------------------------------------------------------
// Risk analytics (#1617, #1698)
// ---------------------------------------------------------------------------

/** Comprehensive risk metrics for a portfolio. */
export interface RiskMetrics {
  /** Annualized standard deviation (percentage). */
  readonly standardDeviationPercent: Percent;
  /** Sharpe ratio = (return − risk-free) / std dev. */
  readonly sharpeRatio: number;
  /** Sortino ratio = (return − risk-free) / downside deviation. */
  readonly sortinoRatio: number;
  /** Maximum drawdown as a percentage (negative). */
  readonly maxDrawdownPercent: Percent;
  /** Value at Risk at 95% confidence (cents loss). */
  readonly var95Cents: Cents;
  /** Value at Risk at 99% confidence (cents loss). */
  readonly var99Cents: Cents;
  /** Portfolio beta relative to benchmark. */
  readonly beta: number;
}

/** A correlation entry between two holdings. */
export interface CorrelationEntry {
  readonly symbolA: string;
  readonly symbolB: string;
  /** Pearson correlation coefficient (−1 to 1). */
  readonly correlation: number;
}

/** Named stress test scenario. */
export interface StressScenario {
  readonly name: string;
  readonly description: string;
  /** Expected portfolio impact as a percentage (negative = loss). */
  readonly impactPercent: Percent;
  /** Estimated portfolio value after the scenario in cents. */
  readonly estimatedValueCents: Cents;
  /** Estimated loss in cents. */
  readonly estimatedLossCents: Cents;
}

/** Result from running all stress tests. */
export interface StressTestResult {
  readonly currentValueCents: Cents;
  readonly scenarios: readonly StressScenario[];
}

// ---------------------------------------------------------------------------
// Asset allocation and rebalancing (#1694)
// ---------------------------------------------------------------------------

/** Asset class categories. */
export type AssetClassName =
  | 'US_STOCKS'
  | 'INTERNATIONAL_STOCKS'
  | 'BONDS'
  | 'REAL_ESTATE'
  | 'COMMODITIES'
  | 'CASH'
  | 'CRYPTO'
  | 'OTHER';

/** A holding for allocation analysis. */
export interface AllocationHolding {
  readonly symbol: string;
  readonly assetClass: AssetClassName;
  /** Current market value in cents. */
  readonly marketValueCents: Cents;
  /** Unrealized gain in cents (positive = gain, negative = loss). */
  readonly unrealizedGainCents?: Cents;
  /** Tax lot count for tax-aware rebalancing. */
  readonly lotCount?: number;
}

/** Target allocation for an asset class. */
export interface AllocationTarget {
  readonly assetClass: AssetClassName;
  /** Target as a percentage (0–100). */
  readonly targetPercent: Percent;
}

/** Comparison of current vs target for one asset class. */
export interface AllocationDrift {
  readonly assetClass: AssetClassName;
  readonly targetPercent: Percent;
  readonly actualPercent: Percent;
  readonly driftPercent: Percent;
  readonly currentValueCents: Cents;
  readonly targetValueCents: Cents;
  /** Positive = need to buy; negative = need to sell. */
  readonly deltaValueCents: Cents;
}

/** A suggested rebalance trade. */
export interface RebalanceTrade {
  readonly symbol: string;
  readonly assetClass: AssetClassName;
  readonly action: 'BUY' | 'SELL';
  readonly amountCents: Cents;
  /** If true, this trade may trigger taxable gain. */
  readonly hasTaxImplication: boolean;
}

/** Full rebalancing analysis result. */
export interface RebalanceResult {
  readonly drifts: readonly AllocationDrift[];
  readonly trades: readonly RebalanceTrade[];
  readonly totalPortfolioValueCents: Cents;
  readonly isTargetValid: boolean;
  /** Number of trades required. */
  readonly tradeCount: number;
}

// ---------------------------------------------------------------------------
// Fee analysis (#1702)
// ---------------------------------------------------------------------------

/** Fee breakdown for a fund or 401(k) plan. */
export interface FeeBreakdown {
  /** Fund expense ratio in basis points. */
  readonly expenseRatioBps: BasisPoints;
  /** Administrative fee in basis points. */
  readonly adminFeeBps: BasisPoints;
  /** Advisory fee in basis points. */
  readonly advisoryFeeBps: BasisPoints;
  /** Total all-in fee in basis points. */
  readonly totalFeeBps: BasisPoints;
}

/** Result of fee drag projection over time. */
export interface FeeDragProjection {
  readonly years: number;
  /** Portfolio value without any fees (cents). */
  readonly valueWithoutFeesCents: Cents;
  /** Portfolio value with fees deducted (cents). */
  readonly valueWithFeesCents: Cents;
  /** Total fees paid over the period (cents). */
  readonly totalFeesPaidCents: Cents;
  /** Fees as percentage of growth. */
  readonly feeDragPercent: Percent;
}

/** Comparison of two fee structures. */
export interface FeeComparison {
  readonly currentLabel: string;
  readonly alternativeLabel: string;
  readonly currentTotalBps: BasisPoints;
  readonly alternativeTotalBps: BasisPoints;
  /** Savings at 10, 20, 30 years in cents. */
  readonly savingsAtYears: readonly FeeDragProjection[];
}

/** Full 401(k) fee analysis result. */
export interface FeeAnalysisResult {
  readonly breakdown: FeeBreakdown;
  readonly projections: readonly FeeDragProjection[];
  readonly comparisons: readonly FeeComparison[];
  /** Weighted average expense ratio in basis points. */
  readonly weightedExpenseRatioBps: BasisPoints;
  /** Total annual fees in cents. */
  readonly totalAnnualFeesCents: Cents;
  /** Portfolio value in cents. */
  readonly portfolioValueCents: Cents;
}

// ---------------------------------------------------------------------------
// Recession simulator (#1746)
// ---------------------------------------------------------------------------

/** A historical recession template. */
export interface RecessionTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly startDate: ISODate;
  readonly endDate: ISODate;
  /** Peak-to-trough market decline as a percentage (negative). */
  readonly peakDeclinePercent: Percent;
  /** Months from trough to full recovery. */
  readonly recoveryMonths: number;
  /** Sector-level impacts. */
  readonly sectorImpacts: readonly SectorImpact[];
}

/** Impact on a specific sector during a recession. */
export interface SectorImpact {
  readonly sector: string;
  /** Decline as a percentage (negative). */
  readonly declinePercent: Percent;
}

/** Result of running a recession simulation on a portfolio. */
export interface RecessionSimResult {
  readonly scenarioName: string;
  readonly currentValueCents: Cents;
  /** Estimated trough value (cents). */
  readonly troughValueCents: Cents;
  /** Estimated drawdown as a percentage. */
  readonly drawdownPercent: Percent;
  /** Estimated months to recover to current value. */
  readonly estimatedRecoveryMonths: number;
  /** Per-holding breakdown. */
  readonly holdingImpacts: readonly HoldingRecessionImpact[];
  /** Defensive allocation suggestions. */
  readonly suggestions: readonly string[];
}

/** Impact on a single holding during recession simulation. */
export interface HoldingRecessionImpact {
  readonly symbol: string;
  readonly assetClass: AssetClassName;
  readonly currentValueCents: Cents;
  readonly estimatedValueCents: Cents;
  readonly declinePercent: Percent;
}
