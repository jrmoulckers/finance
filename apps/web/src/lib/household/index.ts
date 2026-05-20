// SPDX-License-Identifier: BUSL-1.1

/**
 * Household collaboration engines — barrel export.
 *
 * Re-exports all types, calculation engines, and utility functions
 * for household collaboration features.
 *
 * References: issues #1733, #1782, #1783, #1785, #1787, #1789, #1790
 */

export type {
  // Privacy marking (#1782)
  PrivacyLevel,
  PrivateTransaction,
  MarkPrivacyInput,
  TransactionWithAmount,
  // Category permissions (#1783)
  CategoryPermissionLevel,
  CategoryPermission,
  SetCategoryPermissionInput,
  PermissionMatrix,
  // Dashboard (#1785)
  DashboardAccount,
  MemberSpendingSummary,
  HouseholdDashboard,
  // Goal contributions (#1787)
  GoalContributionEntry,
  MemberContribution,
  FairShareResult,
  // Collaboration (#1789, #1790)
  CollaborationNote,
  ReviewStatus,
  ReviewItem,
  TagForReviewInput,
  CollaborationThread,
  // Offboarding (#1733)
  AccountTransfer,
  SharedAccountAction,
  AccountOffboardingDecision,
  OffboardingPlan,
  SharedHistoryExport,
  SharedHistoryExportInput,
} from './types';

export {
  markTransactionPrivacy,
  getPrivacyLevel,
  filterVisibleTransactions,
  calculateSharedTotal,
  getPrivateMarkings,
  countPrivateTransactions,
} from './privacy-marking';

export {
  permissionKey,
  buildPermissionMatrix,
  getEffectivePermission,
  setCategoryPermission,
  canViewCategory,
  canEditCategory,
  getVisibleCategories,
  getEditableCategories,
  getMemberPermissions,
  getCategoryPermissions,
  removeMemberPermissions,
} from './category-permissions';

export {
  calculateSharedNetWorth,
  getSharedAccounts,
  calculateTotalSharedSpending,
  buildMemberSpendingBreakdown,
  buildHouseholdDashboard,
} from './household-dashboard';

export {
  bankersRound,
  totalGoalContributions,
  buildMemberContributions,
  calculateFairShares,
  getMemberContributionHistory,
  memberContributionPercentage,
} from './goal-contributions';

export {
  addNote,
  getTransactionNotes,
  countTransactionNotes,
  tagForReview,
  resolveReview,
  getReviewQueue,
  getPendingReviews,
  countPendingReviews,
  getTransactionReview,
  buildCollaborationThread,
  getTransactionsWithCollaboration,
} from './collaboration';

export {
  generateSharedHistoryExport,
  validateOffboardingPlan,
  splitAccountBalance,
  resolveAccountTransfers,
  reassignReviewItems,
  calculateDepartingMemberContributions,
  buildDepartingContributionSummary,
} from './offboarding';
