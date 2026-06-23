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
export {
  DEFAULT_FIRE_SCENARIOS,
  calculateFirePlan,
  compareFirePlans,
  getFirePlanningWarnings,
} from './fire-planning';
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

// #2466, #2467, #2469 — Net-worth projection view helpers
export {
  DEFAULT_NET_WORTH_PROJECTION_ASSUMPTIONS,
  buildNetWorthProjectionInput,
  buildNetWorthProjectionResults,
  buildProjectedMilestoneRows,
  buildProjectionTableRows,
  loadNetWorthProjectionAssumptions,
  normalizeNetWorthProjectionAssumptions,
  resetNetWorthProjectionAssumptions,
  saveNetWorthProjectionAssumptions,
  toProjectionMilestones,
} from './net-worth-projection-view';
export type {
  NetWorthProjectionAssumptions,
  NetWorthProjectionTableRow,
  ProjectedMilestoneRow,
} from './net-worth-projection-view';

// #2471, #2472, #2473 — FIRE planning view helpers
export {
  DEFAULT_FIRE_PLANNING_ASSUMPTIONS,
  FIRE_PLANNING_DISCLAIMER,
  FIRE_VIEW_SCENARIOS,
  buildCoastFireCard,
  buildFireScenarioCards,
  deriveFirePlanningDefaults,
  loadFirePlanningAssumptions,
  normalizeFirePlanningAssumptions,
  resetFirePlanningAssumptions,
  saveFirePlanningAssumptions,
} from './fire-planning-view';
export type {
  FireDefaultSources,
  FirePlanningAssumptions,
  FirePlanningDefaults,
  FireScenarioCard,
} from './fire-planning-view';

// #2474, #2475, #2476 — Net-worth report view helpers
export {
  NET_WORTH_REPORT_RANGES,
  buildNetWorthReportViewModel,
  clearNetWorthSnapshots,
  loadNetWorthSnapshots,
  persistCurrentNetWorthSnapshot,
  saveNetWorthSnapshots,
  snapshotFromCurrentNetWorth,
  upsertMonthlyNetWorthSnapshot,
} from './net-worth-report-view';
export type { NetWorthReportTableRow, NetWorthReportViewModel } from './net-worth-report-view';

// #2477, #2478, #2479 — DCA plan view helpers
export {
  buildDCADashboardViewModel,
  buildDCAPlanFromDraft,
  clearDCAPlans,
  deleteDCAPlan,
  loadDCAPlans,
  mapInvestmentLotsToDCAPurchases,
  saveDCAPlans,
  upsertDCAPlan,
  validateDCAPlanDraft,
} from './dca-plan-view';
export type {
  DCADashboardRow,
  DCADashboardViewModel,
  DCAReminderRow,
  DCAPlanDraft,
  DCAPlanValidationResult,
} from './dca-plan-view';

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
export { buildCashFlowSankeyPresentation } from './cash-flow-sankey-presentation';
export type {
  CashFlowSankeyChartNode,
  CashFlowSankeyColorToken,
  CashFlowSankeyLegendItem,
  CashFlowSankeyPresentation,
  CashFlowSankeyTableRow,
} from './cash-flow-sankey-presentation';
export {
  buildCashFlowSankeyRangeReport,
  resolveCashFlowSankeyDateRange,
} from './cash-flow-sankey-integration';
export type {
  CashFlowSankeyDateRange,
  CashFlowSankeyOtherGroup,
  CashFlowSankeyRangePreset,
  CashFlowSankeyRangeReport,
  CashFlowSankeyTransaction,
} from './cash-flow-sankey-integration';

// #2248 — Benchmark comparison
export { calculateModifiedDietzReturn, comparePortfolioToBenchmark } from './benchmark-comparison';
export type {
  BenchmarkComparisonInput,
  BenchmarkComparisonResult,
  BenchmarkPoint,
  PortfolioPerformancePoint,
} from './benchmark-comparison';
export { buildBenchmarkComparisonPresentation } from './benchmark-comparison-presentation';
export type {
  BenchmarkComparisonChartDatum,
  BenchmarkComparisonPresentation,
  BenchmarkMetricRow,
} from './benchmark-comparison-presentation';
export {
  buildPortfolioBenchmarkComparison,
  resolveBenchmarkRange,
} from './portfolio-benchmark-adapter';
export type {
  BenchmarkRangeKey,
  BenchmarkSourceAttribution,
  PortfolioBenchmarkAdapterResult,
  PortfolioCashFlowEvent,
  PortfolioValuationSnapshot,
} from './portfolio-benchmark-adapter';

// #2694 — DeFi position presentation
export { buildDefiPortfolioPresentation } from './defi-position-presentation';
export type {
  DefiExposureKind,
  DefiExposureRow,
  DefiPortfolioPresentation,
  DefiPositionInput,
  DefiValuationStatus,
} from './defi-position-presentation';

// #2637, #2638, #2124 — Live cross-broker market data, intraday P&L, and price sources
export {
  DEFAULT_FRESHNESS_POLICY,
  evaluateQuoteFreshness,
  ManualMarketDataProvider,
} from './market-data';
export type {
  AssetKind,
  EvaluatedQuote,
  FreshnessPolicy,
  MarketDataProvider,
  MarketSessionStatus,
  QuoteFreshness,
  QuoteRequest,
  QuoteSnapshot,
} from './market-data';

export { computeIntradayPnl } from './intraday-pnl';
export type {
  CashMovement,
  IntradayPnlInput,
  IntradayPnlReport,
  IntradayPosition,
  PnlAssetClass,
  PnlBreakdown,
  RealizedPnlEvent,
} from './intraday-pnl';

export { ManualPriceSource, PollingPriceSource, SimulatedMarketDataProvider } from './price-source';
export type {
  PollingPriceSourceOptions,
  PriceListener,
  PriceSource,
  PriceUpdate,
  SimulatedProviderOptions,
  SimulatedSeed,
  TimerApi,
} from './price-source';

export { buildLivePnlView, formatRelativeAge, pnlIndicator } from './live-pnl';
export type {
  BaseAccountBalance,
  LivePnlView,
  LivePnlViewInput,
  PnlDirection,
  PnlIndicator,
  StalenessSummary,
  StalenessTone,
} from './live-pnl';

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
