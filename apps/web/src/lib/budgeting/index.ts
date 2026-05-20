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

// Utilities
export { bankersRound } from './utils';
