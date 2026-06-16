// SPDX-License-Identifier: BUSL-1.1

/**
 * Public API for the investment calculation engines.
 *
 * Re-exports cost-basis, allocation, fee analysis, rebalancing, dividends,
 * DRIP projections, FIRE calculator, retirement score, and Monte Carlo modules.
 *
 * References: issues #1585, #1588, #1595, #1600, #1625, #1631, #1639,
 *             #1675, #1683, #1715, #1726
 */

export {
  computeLotGainLoss,
  computeAllLotGainLoss,
  selectLotsForSale,
  computeAverageCostBasis,
  detectWashSales,
} from './cost-basis';

export {
  classifyGainTerm,
  matchSaleLots,
  detectWashSaleGuardrails,
  computeTaxSummary,
  computeUnrealizedTaxLots,
} from './tax-center';
export type {
  HoldingPeriodTerm,
  TaxLotMatchingMethod,
  TaxLot,
  TaxSaleInput,
  ClosedTaxLot,
  LotMatchResult,
  WashSaleReplacementLot,
  WashSaleGuardrail,
  TaxSummary,
  UnrealizedTaxLot,
} from './tax-center';

export {
  DEFAULT_ASSET_CLASS_MAP,
  ALLOCATION_PRESETS,
  validateTargets,
  computeAllocation,
  getRebalancingSuggestions,
} from './allocation';
export type { HoldingWithClass, AllocationPreset } from './allocation';

export {
  computeFeeSummary,
  projectFeeDrag,
  projectFeeDragMultiYear,
  generateFeeComparisons,
  analyzeFees,
  formatExpenseRatio,
  DEFAULT_FEE_COMPARISON_SCENARIOS,
} from './fee-analysis';
export type { FeeHoldingInput } from './fee-analysis';

// #1600 — Rebalancing planner
export {
  bankersRound,
  computeDrift,
  generateRebalanceActions,
  generateTaxAwareRebalanceActions,
  hasDriftAlert,
} from './rebalancing';

// #1631 — Dividend calendar
export {
  detectDividendFrequency,
  paymentsPerYear,
  buildDividendCalendar,
  estimateForwardIncome,
  getUpcomingExDates,
} from './dividends';
export type { DividendHoldingInput } from './dividends';

// #1639 — DRIP projections
export { calculateYieldOnCost, simulateDRIP, projectPassiveIncome } from './drip-projections';

// #1675, #1715 — FIRE calculator
export {
  calculateFINumber,
  calculateFIPercent,
  calculateCoastFI,
  calculateSavingsRate,
  calculateYearsToFI,
  calculateFIREMetrics,
} from './fire-calculator';

// #1683 — Retirement readiness score
export {
  calculatePIA,
  calculateSSAdjustmentFactor,
  estimateSocialSecurity,
  projectPortfolioAtRetirement,
  calculateRequiredPortfolio,
  calculateRetirementScore,
} from './retirement-score';

// #1726 — Monte Carlo simulation
export {
  createSeededRng,
  normalRandom,
  runMonteCarloSimulation,
  runRecessionSimulation,
  DEFAULT_RECESSION_SCENARIO,
  SEVERE_RECESSION_SCENARIO,
} from './monte-carlo';

// #2236 — Net-worth growth projections
export {
  DEFAULT_NET_WORTH_PROJECTION_SCENARIOS,
  deriveProjectionScenarios,
  projectNetWorthGrowth,
} from './net-worth-projections';
export type {
  NetWorthProjectionInput,
  NetWorthProjectionMilestone,
  NetWorthProjectionPoint,
  NetWorthProjectionResult,
  NetWorthProjectionScenario,
  ProjectedMilestone,
} from './net-worth-projections';

// #2239 — FIRE planning scenarios
export { DEFAULT_FIRE_SCENARIOS, calculateFirePlan, compareFirePlans, getFirePlanningWarnings } from './fire-planning';
export type { FirePlanningInput, FirePlanResult, FireScenarioOverride } from './fire-planning';

// #2243 — Net-worth over time report
export { buildNetWorthOverTimeReport, exportNetWorthTimelineCsv } from './net-worth-report';
export type {
  NetWorthAccountClassValue,
  NetWorthOverTimeReport,
  NetWorthReportRange,
  NetWorthSnapshot,
  NetWorthTimelineMilestone,
  NetWorthTimelinePoint,
  NetWorthContributionChange,
} from './net-worth-report';

// #2245 — DCA tracking
export { analyzeDCAPlan, analyzeDCAPlans } from './dca-tracking';
export type {
  DCACadence,
  DCAPeriodProgress,
  DCAPeriodStatus,
  DCAPurchaseLot,
  DCAPlan,
  DCAPlanAmountOverride,
  DCAPlanAnalysis,
} from './dca-tracking';

// #2247 — Cash-flow Sankey report
export { buildCashFlowSankey, exportCashFlowSankeyCsv } from './cash-flow-sankey';
export type {
  CashFlowSankeyInput,
  CashFlowSankeyLine,
  CashFlowSankeyLink,
  CashFlowSankeyNode,
  CashFlowSankeyReport,
  SankeyLineKind,
} from './cash-flow-sankey';

// #2248 — Benchmark comparison
export { calculateModifiedDietzReturn, comparePortfolioToBenchmark } from './benchmark-comparison';
export type {
  BenchmarkComparisonInput,
  BenchmarkComparisonResult,
  BenchmarkPoint,
  PortfolioPerformancePoint,
} from './benchmark-comparison';

// Types
export type {
  PortfolioHolding,
  AssetAllocationTarget,
  DriftAnalysis,
  RebalanceAction,
  TaxAwareRebalanceAction,
  DividendFrequency,
  DividendEvent,
  DividendIncomeEstimate,
  HoldingDividendEstimate,
  DRIPInput,
  DRIPYearResult,
  DRIPProjection,
  FIREInput,
  FIREMetrics,
  RetirementInput,
  RetirementScore,
  RetirementIncomeSources,
  SocialSecurityInput,
  SocialSecurityEstimate,
  MonteCarloInput,
  MonteCarloRun,
  MonteCarloResult,
  MonteCarloPercentiles,
  RecessionScenario,
  MonteCarloRecessionResult,
  SeededRng,
} from './types';
