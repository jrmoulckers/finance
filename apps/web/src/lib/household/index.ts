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

export { buildNetWorthContributionModel } from './net-worth-contribution-model';
export type {
  NetWorthContributionModel,
  NetWorthContributionRow,
} from './net-worth-contribution-model';
export {
  buildNetWorthSnapshotTrendCopy,
  compareNetWorthToMajorLiabilities,
  compareNetWorthToSharedGoals,
  upsertMonthlyNetWorthSnapshot,
} from './net-worth-snapshot-goals';
export type {
  MajorLiabilityComparisonInput,
  NetWorthGoalComparisonRow,
  NetWorthLiabilityComparisonRow,
  NetWorthSnapshotTrendCopy,
  SharedNetWorthGoal,
} from './net-worth-snapshot-goals';
export { buildNetWorthDashboardPanelModel } from './net-worth-dashboard-panel';
export type { NetWorthDashboardPanelModel } from './net-worth-dashboard-panel';

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

export type {
  RedactedBudgetTransaction,
  ReconciliationVisibilitySummary,
  SharedBudgetVisibilitySummary,
  VisibilityRuleChangeActivity,
  VisibilityRuleChangeActivityInput,
} from './spending-visibility-consumers';
export {
  buildVisibilityRuleChangeActivity,
  summarizeReconciliationWithVisibility,
  summarizeSharedBudgetSpendingWithVisibility,
} from './spending-visibility-consumers';

export type {
  HouseholdBudgetFilter,
  HouseholdBudgetMemberLabel,
  HouseholdBudgetPageRow,
} from './budget-ownership-view';
export {
  buildHouseholdBudgetPageRows,
  filterHouseholdBudgetRows,
  getHouseholdBudgetEditControlState,
} from './budget-ownership-view';

export type {
  TeenLearningAction,
  TeenApprovalStatus,
  TeenLearningEnvelope,
  TeenSavingsChallenge,
  TeenLearningAccountInput,
  TeenLearningAccount,
  TeenActionReview,
  TeenActivitySignal,
  TeenActivitySummary,
} from './teen-education';
export {
  buildTeenLearningAccount,
  reviewTeenLearningAction,
  buildTeenActivitySummary,
} from './teen-education';
export type {
  TeenLearningChoreSeed,
  TeenLearningChildSeed,
  TeenLearningLocalRecord,
  TeenLearningPersistencePayload,
} from './teen-learning-local';
export {
  buildTeenLearningRecordFromChild,
  upsertTeenLearningRecord,
  buildTeenLearningPayload,
} from './teen-learning-local';
export type { TeenParentReviewSummary } from './teen-review-summaries';
export {
  TEEN_LEARNING_HOUSEHOLD_COPY,
  buildTeenParentReviewSummary,
} from './teen-review-summaries';

export type {
  PoaScope,
  PoaCapability,
  PoaGrantStatus,
  PoaAccessGrant,
  CreatePoaGrantInput,
  PoaAccessDecision,
  PoaAuditEvent,
} from './poa-access';
export {
  createPoaAccessGrant,
  revokePoaAccessGrant,
  getPoaGrantStatus,
  evaluatePoaAccess,
  buildPoaAuditEvent,
} from './poa-access';
export type { PoaOwnerAuditEntry, PoaRenewalReminder } from './poa-audit-renewal';
export {
  POA_LEGAL_BOUNDARY_ONBOARDING_COPY,
  buildPoaOwnerAuditEntry,
  getPoaRenewalReminder,
  buildPoaImmediateRevokeCopy,
} from './poa-audit-renewal';
export type { PoaLocalAccessSnapshot } from './poa-local-records';
export {
  createPoaLocalAccessSnapshot,
  upsertPoaGrant,
  revokePoaGrantInSnapshot,
  appendPoaAuditEvent,
} from './poa-local-records';

export type {
  SpendingVisibilityLevel,
  SpendingVisibilityRule,
  SpendingVisibilityTransaction,
  SpendingVisibilityDecision,
  SpendingVisibilityPreview,
} from './spending-visibility';
export { evaluateSpendingVisibility, buildSpendingVisibilityPreview } from './spending-visibility';
export type {
  LegacyAccountSharingInput,
  SpendingVisibilityMigrationResult,
} from './spending-visibility-migration';
export {
  migrateAccountSharingToSpendingVisibility,
  summarizeSpendingVisibilityMigration,
} from './spending-visibility-migration';
