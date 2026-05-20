// SPDX-License-Identifier: BUSL-1.1

/**
 * Life event planning barrel export.
 *
 * Re-exports all life event planning engine modules.
 *
 * References: #1652, #1738, #1763, #1767, #1769, #1771
 */

// Types
export type {
  HomePurchaseParams,
  HomePurchaseResult,
  EducationFundParams,
  EducationFundResult,
  EducationProjectionPoint,
  AllocationSuggestion,
  HsaCoverageType,
  HsaPlanParams,
  HsaPlanResult,
  HsaProjectionPoint,
  JobLossRunwayParams,
  JobLossRunwayResult,
  RunwayProjectionPoint,
  RunwayRecommendation,
  LifeEventType,
  LifeEvent,
  LifeEventMilestone,
  LifeEventAnalysis,
  MultiEventAnalysis,
} from './types';

// Home purchase engine
export {
  calculateDownPayment,
  calculateClosingCosts,
  calculateMonthlyMortgage,
  calculateMonthlyPmi,
  calculateDti,
  calculateRequiredMonthlySavings as calculateHomeSavingsNeeded,
  analyzeHomePurchase,
} from './home-purchase';

// Education planner
export {
  projectTotalCost,
  projectBalance,
  calculateRequiredContribution,
  calculateTaxBenefit,
  suggestAllocation,
  generateProjectionPoints,
  analyzeEducationFund,
} from './education-planner';

// HSA planner
export {
  getContributionLimits,
  calculateTripleTaxSavings,
  generateHsaProjection,
  analyzeHsaPlan,
} from './hsa-planner';

// Job loss runway
export {
  calculateEssentialBurnRate,
  calculateFullBurnRate,
  calculateMonthlyIncome,
  generateMonthlyProjection,
  calculateRunwayMonths,
  generateRecommendations,
  analyzeJobLossRunway,
} from './job-loss-runway';

// Life event framework
export {
  calculateSavingsGap,
  calculateProgressBps,
  calculateRequiredMonthlySavings,
  generateMilestones,
  analyzeEvent,
  analyzeMultipleEvents,
  createLifeEvent,
} from './life-event-framework';
