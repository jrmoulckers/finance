// SPDX-License-Identifier: BUSL-1.1

/**
 * Public API for the retirement planning and wealth management engines.
 *
 * Re-exports withdrawal optimizer, guaranteed income, wealth planning,
 * net worth timeline, and wellness score modules.
 *
 * References: #1688, #1736, #1737, #1744, #1745, #1775
 */

// Types
export type {
  AccountTaxType,
  ComponentScore,
  GrowthRate,
  GuaranteedIncomeStream,
  IncomeGapAnalysis,
  JointNetWorth,
  LifeEventMilestone,
  LifeEventType,
  NetWorthMilestone,
  NetWorthProjection,
  NetWorthSnapshot,
  OwnershipType,
  PensionPresentValue,
  RetirementAccount,
  RothConversionYear,
  SharedGoal,
  SharedGoalProgress,
  SocialSecurityClaimAge,
  SocialSecurityEstimate,
  TaxBracket,
  WealthPlanAsset,
  WealthPlanLiability,
  WellnessComponent,
  WellnessGrade,
  WellnessInput,
  WellnessScore,
  WithdrawalPlan,
  WithdrawalStrategy,
  WithdrawalYearPlan,
} from './types';

// Withdrawal Optimizer (#1688, #1737)
export {
  bankersRound,
  safeDivide,
  getDistributionPeriod,
  calculateRMD,
  calculateTax,
  findBracketSpace,
  generateWithdrawalPlan,
  analyzeRothConversionLadder,
  RMD_START_AGE,
  FEDERAL_TAX_BRACKETS_2024,
} from './withdrawal-optimizer';
export type { WithdrawalOptimizerInput } from './withdrawal-optimizer';

// Guaranteed Income (#1736)
export {
  estimateSocialSecurityBenefit,
  estimateAllClaimingAges,
  calculatePensionPresentValue,
  calculateGuaranteedMonthlyIncome,
  analyzeIncomeGap,
  FULL_RETIREMENT_AGE,
} from './guaranteed-income';

// Wealth Planning (#1744)
export {
  calculateJointNetWorth,
  calculateSharedGoalProgress,
  calculateAllSharedGoalProgress,
  getReachedMilestones,
  getNextMilestone,
  getMilestoneProgress,
  calculatePartnerContributions,
  WEALTH_MILESTONES_CENTS,
} from './wealth-planning';

// Net Worth Timeline (#1745)
export {
  detectMilestones,
  findNewMilestones,
  calculateGrowthRate,
  calculatePeriodicGrowthRates,
  calculateMonthlyGrowthRate,
  projectNetWorth,
  annotateLifeEvents,
  CELEBRATION_THRESHOLDS,
} from './net-worth-timeline';

// Wellness Score (#1775)
export {
  scoreToGrade,
  scoreEmergencyFund,
  scoreDebtToIncome,
  scoreSavingsRate,
  scoreRetirementProgress,
  scoreInsuranceCoverage,
  scoreEstatePlanning,
  getSuggestion,
  calculateWellnessScore,
  DEFAULT_WEIGHTS,
} from './wellness-score';
