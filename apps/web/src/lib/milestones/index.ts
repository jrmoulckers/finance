// SPDX-License-Identifier: BUSL-1.1

export { buildMilestoneSnapshot, calculateSavingsStreakMonths, detectMilestones } from './detector';
export {
  loadMilestoneStorageState,
  mergeDebtBaselines,
  notifyMilestoneDataChanged,
  saveMilestoneStorageState,
  MILESTONE_DATA_CHANGED_EVENT,
} from './storage';
export {
  DEBT_REDUCTION_THRESHOLDS,
  GOAL_PROGRESS_THRESHOLDS,
  NET_WORTH_THRESHOLDS,
  SAVINGS_STREAK_THRESHOLDS,
} from './thresholds';
export type {
  DebtBaselineState,
  DetectMilestonesInput,
  DetectedMilestone,
  GoalSnapshot,
  LiabilitySnapshot,
  MilestoneCategory,
  MilestoneSnapshot,
  MilestoneStorageState,
} from './types';
