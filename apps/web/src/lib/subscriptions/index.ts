// SPDX-License-Identifier: BUSL-1.1

/**
 * Subscription intelligence module.
 *
 * Re-exports all public types and functions for the subscription
 * intelligence suite: cancellation tracking, price alerts, trial
 * tracking, bill calendar, and portfolio analysis.
 *
 * References: issues #1596, #1598, #1601, #1619, #1629
 */

export type {
  AnomalyResult,
  BillCalendar,
  BillingCycle,
  CancellationPhase,
  CancellationStep,
  CancellationWorkflow,
  CashFlowImpact,
  CategoryBreakdown,
  DuplicateDetection,
  PriceAlert,
  PriceRecord,
  Subscription,
  SubscriptionAnalysis,
  SubscriptionCategory,
  SubscriptionStatus,
  TrialInfo,
  TrialTrackingResult,
  UpcomingBill,
  WeeklyBillDensity,
} from './types';

export {
  buildCancellationSteps,
  calculateCancellationSavings,
  completeStep,
  createCancellationWorkflow,
  cyclesPerYear,
  getWorkflowProgress,
  toAnnualCostCents,
  toMonthlyCostCents,
} from './cancellation-tracker';

export {
  buildPriceTimeline,
  calculatePercentageChange,
  detectAllPriceChanges,
  detectAnomaly,
  detectPriceChange,
  mean,
  scanForPriceAlerts,
  standardDeviation,
} from './price-alerts';

export {
  addDays,
  calculateAutoRenewalRisk,
  classifyUrgency,
  daysBetween,
  getTrialsNeedingReminder,
  trackAllTrials,
  trackTrial,
} from './trial-tracker';

export {
  buildBillCalendar,
  calculateCashFlowImpact,
  calculateWeeklyDensity,
  generateAllUpcomingBills,
  generateBillsForSubscription,
  projectBillingDates,
} from './bill-calendar';

export {
  analyzeSubscriptions,
  calculateCategoryBreakdown,
  detectDuplicates,
} from './subscription-analyzer';
