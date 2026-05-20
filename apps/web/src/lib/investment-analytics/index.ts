// SPDX-License-Identifier: BUSL-1.1

/**
 * Public API for the investment analytics engines.
 *
 * Re-exports trade import, benchmark builder, risk analytics, allocation
 * engine, fee analyzer, and recession simulator modules.
 *
 * References: issues #1592, #1609, #1617, #1694, #1698, #1702, #1746
 */

// Types
export type {
  AllocationDrift,
  AllocationHolding,
  AllocationTarget,
  AssetClassName,
  BasisPoints,
  Benchmark,
  BenchmarkComparison,
  BenchmarkComponent,
  Cents,
  CorrelationEntry,
  FeeAnalysisResult,
  FeeBreakdown,
  FeeComparison,
  FeeDragProjection,
  HoldingRecessionImpact,
  ISODate,
  Percent,
  PeriodComparisonEntry,
  PeriodReturn,
  RebalanceResult,
  RebalanceTrade,
  RecessionSimResult,
  RecessionTemplate,
  ReconciliationResult,
  RiskMetrics,
  SectorImpact,
  StressScenario,
  StressTestResult,
  Trade,
  TradeAction,
  TradeFingerprint,
  TradeImportRow,
} from './types';

// Trade import (#1592)
export {
  bankersRound,
  createFingerprint,
  normalizeDate,
  parseDollarsToCents,
  parseTradeAction,
  parseTradeRow,
  parseTradeRows,
  reconcileTrades,
  safeDivide,
  tradeToFingerprint,
} from './trade-import';

// Benchmark builder (#1609, #1698)
export {
  BALANCED_60_40_BENCHMARK,
  buildBenchmarkComparison,
  buildCustomBenchmark,
  computeAlpha,
  computeBenchmarkPeriodReturns,
  computeBeta,
  computeBlendedReturn,
  computeInformationRatio,
  computeTrackingError,
  SP500_BENCHMARK,
  STANDARD_BENCHMARKS,
  STANDARD_PERIODS,
  TOTAL_MARKET_BENCHMARK,
  validateBenchmarkWeights,
} from './benchmark-builder';

// Risk analytics (#1617, #1698)
export {
  buildCorrelationMatrix,
  computeMaxDrawdown,
  computeRiskMetrics,
  computeSharpeRatio,
  computeSortinoRatio,
  computeVaR,
  downsideDeviation,
  mean,
  pearsonCorrelation,
  runStressTests,
  standardDeviation,
  STRESS_SCENARIOS,
} from './risk-analytics';

// Allocation engine (#1694)
export {
  computeAllocationDrift,
  computeRebalanceAnalysis,
  filterTaxAwareTrades,
  generateCashFlowRebalanceTrades,
  generateRebalanceTrades,
  validateAllocationTargets,
} from './allocation-engine';

// Fee analyzer (#1702)
export {
  analyze401kFees,
  bpsToDollarsCents,
  compareFees,
  computeWeightedExpenseRatio,
  createFeeBreakdown,
  dollarsCentsToBps,
  projectFeeDragAnalytics,
  projectFeeDragMultiYear as projectFeeDragMultiYearAnalytics,
} from './fee-analyzer';

// Recession simulator (#1746)
export {
  COVID_RECESSION,
  DOT_COM_RECESSION,
  estimateAssetClassDecline,
  estimateRecoveryMonths,
  generateDefensiveSuggestions,
  GFC_2008_RECESSION,
  RECESSION_TEMPLATES,
  simulateAllRecessions,
  simulateHoldingImpacts,
  simulateRecession,
} from './recession-sim';
