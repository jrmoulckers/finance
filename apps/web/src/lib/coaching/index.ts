// SPDX-License-Identifier: BUSL-1.1

export { analyzeSpendingVelocity } from './spendingVelocity';
export { projectCashFlow } from './cashFlowProjection';
export { detectSpendingAnomalies } from './anomalyDetection';
export { generateCoachSuggestions } from './suggestions';
export type {
  CoachSeverity,
  CoachAlertType,
  RecurrenceCadence,
  BudgetVelocity,
  CashFlowProjection,
  RecurringCashFlowItem,
  SpendingAnomaly,
  CoachAlert,
  CoachSuggestion,
  CoachAnalysis,
  BudgetWithMonthlyContext,
  SpendingVelocityInput,
  CashFlowProjectionInput,
  AnomalyDetectionInput,
  SuggestionInput,
} from './types';
