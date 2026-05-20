// SPDX-License-Identifier: BUSL-1.1

/**
 * Household Advanced — collaboration engines for shared finance.
 *
 * Re-exports all public types and functions from the sub-modules.
 */

// Types
export type {
  AdvisorAccess,
  AdvisorAccessLogEntry,
  AdvisorRole,
  ApprovalStatus,
  AssetDivision,
  CoercionSafeguard,
  ExpenseGroup,
  ExpenseSplit,
  GroupExpense,
  HealthStatus,
  HouseholdId,
  HouseholdType,
  ISODateString,
  MaskedView,
  MemberBalance,
  MemberShare,
  OnboardingDefaults,
  OnboardingProgress,
  OnboardingStep,
  OnboardingStepId,
  PermissionChangeEntry,
  PostTransitionChecklistItem,
  PrivacySetting,
  PurchaseRequest,
  PurchaseThreshold,
  RecurrenceCadence,
  Settlement,
  SharedExpense,
  SharedExpenseAnnualSummary,
  SharedExpenseOccurrence,
  SplitMethod,
  TransitionPlan,
  TransitionStep,
  TransitionStepId,
  TransitionStepStatus,
  TransitionTimelineEvent,
  TrendDirection,
  UserId,
} from './types';

// Onboarding Assistant (#1722)
export {
  createOnboardingProgress,
  getDefaultsForType,
  completeStep,
  skipStep,
  resumeOnboarding,
  getCompletionPercent,
  isOnboardingComplete,
  getCurrentStep,
  getStepIds,
} from './onboarding-assistant';

// Anti-Coercion Safeguards (#1727)
export {
  deriveTrend,
  deriveHealthStatus,
  computePercentage,
  buildMaskedView,
  buildMaskedViews,
  detectRapidChanges,
  flagAsSuspicious,
  createDefaultSafeguard,
  activateSafeMode,
  deactivateSafeMode,
  enableIndependentAccess,
  createPermissionChangeEntry,
  getEntriesForUser,
  getSuspiciousEntries,
} from './anti-coercion';

// Relationship Transition Wizard (#1772)
export {
  createTransitionPlan,
  advanceStep,
  getCurrentTransitionStep,
  isTransitionComplete,
  divideAssets,
  divideAssetsByWeight,
  createTimelineEvent,
  getDefaultChecklist,
  toggleChecklistItem,
  isChecklistComplete,
  hasPremiumAccess,
} from './transition-wizard';

// Purchase Requests (#1791)
export {
  createThreshold,
  requiresDiscussion,
  shouldAutoApprove,
  createPurchaseRequest,
  resolveRequest,
  approveRequest,
  denyRequest,
  markForDiscussion,
  filterByStatus,
  filterByHousehold,
  getPendingRequests,
  totalPendingAmount,
} from './purchase-requests';

// Expense Groups (#1792)
export {
  createExpenseGroup,
  splitEqual,
  splitByPercentage,
  splitExact,
  splitByIncomeRatio,
  createGroupExpense,
  computeBalances,
  computeSettlements,
  getExpensesByGroup,
  computeGroupTotal,
} from './expense-groups';

// Shared / Recurring Expenses (#1794)
export {
  createSharedExpense,
  deactivateSharedExpense,
  updateSharedExpenseAmount,
  generateOccurrence,
  generateOccurrenceWithData,
  adjustOccurrence,
  getOccurrencesForExpense,
  computeMemberTotal,
  computeAnnualSummary,
  computeNextOccurrenceDate,
} from './shared-expenses';

// Advisor / Coach Access (#1795)
export {
  grantAccess,
  revokeAccess,
  isAccessValid,
  isAccountVisible,
  isCategoryVisible,
  updateVisibleAccounts,
  updateVisibleCategories,
  renewAccess,
  createAccessLogEntry,
  getLogEntriesForAccess,
  getActiveGrants,
} from './advisor-access';
