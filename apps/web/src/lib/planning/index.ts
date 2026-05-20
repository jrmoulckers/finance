// SPDX-License-Identifier: BUSL-1.1

/**
 * Planning library barrel export.
 *
 * Re-exports all planning engine modules for convenient imports.
 *
 * References: #1743, #1735, #1721, #1679, #1644, #1635
 */

// Types
export type {
  ScenarioAdjustment,
  Scenario,
  ProjectionPoint,
  ScenarioProjection,
  RetirementParams,
  MonteCarloIteration,
  MonteCarloResult,
  RetirementReadiness,
  RetirementFactor,
  LinkedGoal,
  GoalContribution,
  GoalMilestone,
  SweepRuleType,
  SweepRule,
  SweepEvaluation,
  SweepLogEntry,
} from './types';

// Monte Carlo engine
export {
  normalRandom,
  projectSavings,
  calculateTargetNestEgg,
  runMonteCarlo,
  calculateContributionGap,
  assessRetirementReadiness,
} from './monte-carlo';

// Scenario modeler
export type { BaselineSnapshot } from './scenario-modeler';
export {
  projectScenario,
  projectBaselineScenario,
  compareScenarios,
  createEmptyScenario,
  createAdjustment,
  addAdjustment,
  removeAdjustment,
  duplicateScenario,
} from './scenario-modeler';

// Savings goals
export {
  calculateProgress,
  generateMilestones,
  calculateMonthlyPace,
  projectCompletionDate,
  buildLinkedGoal,
} from './savings-goals';

// Sweep engine
export type { SweepAccountData, RecentTransaction, SweepContext } from './sweep-engine';
export {
  evaluateRule,
  evaluateAllRules,
  createLogEntry,
  createRoundUpRule,
  createPercentRule,
  createThresholdRule,
  createFixedAmountRule,
} from './sweep-engine';
