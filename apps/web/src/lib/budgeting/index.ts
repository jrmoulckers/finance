// SPDX-License-Identifier: BUSL-1.1

/**
 * Barrel export for the advanced budgeting module.
 *
 * Re-exports all types and engine functions from a single entry point.
 *
 * References: #1559, #1560, #1561, #1562, #1563, #1565, #1568, #1570
 */

// Types
export type {
  BudgetAllocationDiff,
  BudgetHistoryAllocation,
  BudgetId,
  BudgetPeriodDiff,
  BudgetPeriodSnapshot,
  BudgetTemplate,
  ComputedTemplateAllocation,
  Envelope,
  EnvelopeBudgetSummary,
  EnvelopeDetail,
  FlexBucket,
  FlexBucketDetail,
  FlexBudgetSummary,
  ISODateString,
  MonthAheadBufferConfig,
  MonthAheadBufferProgress,
  MonthKey,
  MoveMoneyRequest,
  MoveMoneyResult,
  PayYourselfFirstAllocation,
  PayYourselfFirstResult,
  PayYourselfFirstRule,
  PaycheckConfig,
  PaycheckPeriod,
  SinkingFund,
  SinkingFundSchedule,
  TemplateAllocation,
  TemplateApplicationResult,
} from './advanced-types';

// Enums (must be value exports)
export {
  FlexBucketType,
  PayFrequency,
  SinkingFundCadence,
  TemplatePriority,
} from './advanced-types';

// Engines
export { calculateEnvelopeSummary, envelopeAvailable, moveMoney } from './envelope-engine';

export {
  applyTemplate,
  BUILT_IN_TEMPLATES,
  createCustomTemplate,
  getTemplateById,
  TEMPLATE_50_30_20,
  TEMPLATE_80_20,
  TEMPLATE_BARE_BONES,
} from './budget-templates';

export { allocatePayYourselfFirst } from './pay-yourself-first';

export {
  calculateAllSchedules,
  calculateSinkingFundSchedule,
  monthlyAmortization,
} from './sinking-funds';

export { bucketAvailable, calculateFlexSummary, calculateRollovers } from './flex-budgeting';

export { generatePaycheckPeriods, getNextPayDate } from './paycheck-periods';

export {
  calculateBufferProgress,
  estimateBufferTarget,
  recommendedContribution,
} from './month-ahead-buffer';

export {
  calculatePeriodDiff,
  copyForward,
  createEmptySnapshot,
  findPeriod,
  getAdjacentPeriods,
} from './budget-history';

export { aggregateCategoryTreeMonthlySpend } from './category-tree-spend-aggregation';
export { aggregateDisplayCurrencyAmounts, calculateBudgetDisplayRollup, calculateDashboardDisplayRollup } from './display-currency-rollups';
export { previewFirstBudgetRecords, buildFirstBudgetRollbackPlan } from './first-budget-draft-records';
export { buildFirstBudgetTutorialEntryState, deserializeFirstBudgetTutorialDraft, serializeFirstBudgetTutorialDraft } from './first-budget-tutorial-entry';
export { SINGLE_PARENT_FAMILY_TEMPLATE } from './single-parent-starter-template';
export { buildSinkingFundBudgetListState, buildSinkingFundDetailView } from './sinking-fund-budget-view';
export { createSinkingFundRepository } from './sinking-fund-repository';
export { buildSinkingFundSurfaceState } from './sinking-fund-surface';
export { archiveTripBudgetScope, buildTripBudgetRollup, transactionMatchesTripBudgetScope } from './trip-country-budget-scope';
export { reviewYnabMigrationRows } from './ynab-migration-review';

export type {
  BudgetSuggestionFormState,
  BudgetSuggestionChoice,
  TemplateSuggestionComparison,
} from './budget-suggestion-actions';
export {
  acceptBudgetSuggestion,
  compareSuggestionToStarterTemplate,
  createBudgetSuggestionFormState,
  editBudgetSuggestion,
  ignoreBudgetSuggestion,
} from './budget-suggestion-actions';

export type {
  BudgetScenarioStaleness,
  BudgetScenarioStorageLike,
  StoredBudgetScenarioRecord,
} from './budget-scenario-storage';
export {
  BUDGET_SCENARIO_STORAGE_KEY,
  checkBudgetScenarioBaselineStaleness,
  deleteBudgetScenarioRecord,
  duplicateBudgetScenarioRecord,
  loadBudgetScenarioRecords,
  saveBudgetScenarioRecord,
} from './budget-scenario-storage';

export type {
  BudgetScenarioEditorState,
  BudgetScenarioEntryPoint,
  BudgetScenarioEntryPointDecision,
} from './budget-scenario-editor';
export {
  createScenarioEditorState,
  createScenarioFromCurrentBudget,
  duplicateScenarioDraft,
  editScenarioCategoryAmount,
  editScenarioIncome,
  editScenarioSinkingFundContribution,
  getScenarioEntryPointDecision,
  summarizeScenarioComparison,
} from './budget-scenario-editor';

// Utilities
export { bankersRound } from './utils';
