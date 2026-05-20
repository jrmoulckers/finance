// SPDX-License-Identifier: BUSL-1.1

/**
 * Family finance & parental controls barrel export.
 *
 * Re-exports all family engine modules for convenient imports.
 *
 * References: #1728, #1729, #1730, #1731, #1796, #1797, #1798, #1799, #1800
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  ParentalRole,
  CaregiverPermission,
  RecurrenceFrequency,
  ApprovalStatus,
  AlertSeverity,
  AlertType,
  LimitPeriod,
  AgeBracket,
  FamilyMember,
  ChildAccount,
  SpendingLimit,
  ApprovalRequest,
  AllowanceSchedule,
  AllowanceTransfer,
  Chore,
  ChoreCompletion,
  ChildGoal,
  GoalContribution,
  GoalMilestone,
  ActivityAlert,
  AlertThresholds,
  EducationLesson,
  LessonProgress,
  ProgressBadge,
  CaregiverAccess,
  CaregiverAuditEntry,
} from './types';

// ---------------------------------------------------------------------------
// Child accounts (#1796)
// ---------------------------------------------------------------------------

export type { AccountFeature } from './child-accounts';
export {
  getAvailableFeatures,
  roleForAge,
  hasFeature,
  createChildAccount,
  createFamilyMember,
  adjustBalance,
  updateVisibility,
  isLinkedToParent,
} from './child-accounts';

// ---------------------------------------------------------------------------
// Spending limits (#1800, #1728)
// ---------------------------------------------------------------------------

export type {
  SpendingTransaction,
  LimitCheckResult,
  PeriodSpendingSummary,
} from './spending-limits';
export {
  getPeriodStart,
  getTransactionsInPeriod,
  calculatePeriodSpending,
  checkSpendingLimits,
  createSpendingLimit,
  createApprovalRequest,
  reviewApprovalRequest,
  overrideLimit,
  buildSpendingSummaries,
} from './spending-limits';

// ---------------------------------------------------------------------------
// Allowance engine (#1797)
// ---------------------------------------------------------------------------

export {
  createAllowanceSchedule,
  pauseSchedule,
  resumeSchedule,
  updateAllowanceAmount,
  calculateNextTransferDate,
  simulateTransfer,
  createBonusTransfer,
  isTransferDue,
  totalAllowancePaid,
  filterTransferHistory,
} from './allowance-engine';

// ---------------------------------------------------------------------------
// Chore rewards (#1798)
// ---------------------------------------------------------------------------

export {
  createChore,
  deactivateChore,
  reassignChore,
  rotateChoreAssignment,
  calculateStreak,
  calculateReward,
  recordCompletion,
  reviewCompletion,
  totalRewardsEarned,
  getCompletionsForMember,
} from './chore-rewards';

// ---------------------------------------------------------------------------
// Child goals (#1799)
// ---------------------------------------------------------------------------

export {
  createChildGoal,
  calculateProgress,
  addContribution,
  generateMilestones,
  getNewlyReachedMilestones,
  getProgressBarData,
  formatCentsForKids,
  calculateParentMatch,
} from './child-goals';

// ---------------------------------------------------------------------------
// Activity alerts (#1731)
// ---------------------------------------------------------------------------

export type { AlertTransaction, CategoryHistory } from './activity-alerts';
export {
  getDefaultThresholds,
  checkAmountThreshold,
  checkFrequencySpike,
  checkCategoryAnomaly,
  evaluateTransaction,
  acknowledgeAlert,
  filterBySeverity,
  getUnacknowledgedAlerts,
} from './activity-alerts';

// ---------------------------------------------------------------------------
// Education feed (#1729)
// ---------------------------------------------------------------------------

export {
  getAgeBracket,
  getLessonsForAge,
  getLessonsByTopic,
  getTopics,
  getNextLesson,
  completeLesson,
  getTopicCompletionPercent,
  getAverageQuizScore,
  getEarnedBadges,
  createBadge,
  getEducationSummary,
} from './education-feed';

// ---------------------------------------------------------------------------
// Caregiver access (#1730)
// ---------------------------------------------------------------------------

export {
  createAccessGrant,
  createEmergencyAccess,
  revokeAccess,
  updatePermission,
  extendAccess,
  isAccessValid,
  canAccessAccount,
  hasWritePermission,
  createAuditEntry,
  getAuditEntriesForGrant,
  getAuditEntriesForAccount,
  getActiveGrantsForAccounts,
} from './caregiver-access';
