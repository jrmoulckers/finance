// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared types for household collaboration engines.
 *
 * All monetary values are in integer cents to avoid floating-point errors.
 * Privacy boundaries are enforced at the type level — private transaction
 * details never appear in shared aggregate views.
 *
 * References: issues #1733, #1782, #1783, #1785, #1787, #1789, #1790
 */

import type { Cents, Instant, LocalDate, SyncId } from '../../kmp/bridge';

// ---------------------------------------------------------------------------
// Privacy marking (#1782)
// ---------------------------------------------------------------------------

/** Privacy visibility level for a transaction. */
export type PrivacyLevel = 'SHARED' | 'PRIVATE';

/** A transaction with an explicit privacy marking. */
export interface PrivateTransaction {
  /** The underlying transaction ID. */
  readonly transactionId: SyncId;
  /** Which household member owns this transaction. */
  readonly memberId: SyncId;
  /** Privacy level — PRIVATE hides from other household members. */
  readonly privacyLevel: PrivacyLevel;
  /** When the privacy level was last changed. */
  readonly markedAt: Instant;
}

/** Input for marking a transaction's privacy level. */
export interface MarkPrivacyInput {
  readonly transactionId: SyncId;
  readonly memberId: SyncId;
  readonly privacyLevel: PrivacyLevel;
}

/** A transaction with its amount, used in privacy-filtered aggregations. */
export interface TransactionWithAmount {
  readonly transactionId: SyncId;
  readonly memberId: SyncId;
  readonly amountCents: number;
  readonly categoryId: SyncId | null;
  readonly date: LocalDate;
}

// ---------------------------------------------------------------------------
// Category permissions (#1783)
// ---------------------------------------------------------------------------

/** Permission level a member has for a specific category. */
export type CategoryPermissionLevel = 'HIDDEN' | 'VIEW' | 'EDIT';

/** Per-member, per-category permission entry. */
export interface CategoryPermission {
  /** The category this permission applies to. */
  readonly categoryId: SyncId;
  /** The household member this permission applies to. */
  readonly memberId: SyncId;
  /** The effective permission level. */
  readonly level: CategoryPermissionLevel;
  /** When this permission was last updated. */
  readonly updatedAt: Instant;
}

/** Input for setting a category permission. */
export interface SetCategoryPermissionInput {
  readonly categoryId: SyncId;
  readonly memberId: SyncId;
  readonly level: CategoryPermissionLevel;
}

/** A complete permission matrix for a household. */
export interface PermissionMatrix {
  /** Map from "memberId:categoryId" to permission level. */
  readonly entries: ReadonlyMap<string, CategoryPermissionLevel>;
}

// ---------------------------------------------------------------------------
// Household dashboard (#1785)
// ---------------------------------------------------------------------------

/** A single account entry visible in the household dashboard. */
export interface DashboardAccount {
  readonly accountId: SyncId;
  readonly name: string;
  readonly balanceCents: number;
  /** Whether this account is shared with the household. */
  readonly isShared: boolean;
}

/** Per-member spending summary in shared categories only. */
export interface MemberSpendingSummary {
  readonly memberId: SyncId;
  readonly memberName: string | null;
  /** Total spent in shared categories (cents). */
  readonly totalSpentCents: number;
  /** Breakdown by category. */
  readonly byCategory: ReadonlyMap<SyncId, number>;
}

/** Privacy-aware household dashboard data. */
export interface HouseholdDashboard {
  /** Total household net worth from shared accounts only (cents). */
  readonly sharedNetWorthCents: number;
  /** Shared accounts visible to all members. */
  readonly sharedAccounts: readonly DashboardAccount[];
  /** Total household spending from shared categories (cents). */
  readonly totalSharedSpendingCents: number;
  /** Per-member spending breakdowns (shared categories only). */
  readonly memberSpending: readonly MemberSpendingSummary[];
}

// ---------------------------------------------------------------------------
// Goal contributions (#1787)
// ---------------------------------------------------------------------------

/** A single contribution to a shared goal by a household member. */
export interface GoalContributionEntry {
  readonly goalId: SyncId;
  readonly memberId: SyncId;
  readonly amountCents: number;
  readonly date: LocalDate;
}

/** Per-member contribution summary for a shared goal. */
export interface MemberContribution {
  readonly memberId: SyncId;
  readonly memberName: string | null;
  /** Total contributed (cents). */
  readonly totalCents: number;
  /** Percentage of the total goal contributions from this member. */
  readonly percentageOfTotal: number;
}

/** Fair-share calculation result for a shared goal. */
export interface FairShareResult {
  readonly memberId: SyncId;
  /** The member's expected fair share (cents). */
  readonly expectedCents: number;
  /** The member's actual contribution (cents). */
  readonly actualCents: number;
  /** Difference: actual − expected. Positive = over, negative = under. */
  readonly differenceCents: number;
}

// ---------------------------------------------------------------------------
// Collaboration & review (#1789, #1790)
// ---------------------------------------------------------------------------

/** A note or comment attached to a transaction. */
export interface CollaborationNote {
  readonly id: SyncId;
  readonly transactionId: SyncId;
  readonly authorId: SyncId;
  readonly authorName: string | null;
  readonly content: string;
  readonly createdAt: Instant;
}

/** Status of a review item. */
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** A transaction flagged for partner review. */
export interface ReviewItem {
  readonly id: SyncId;
  readonly transactionId: SyncId;
  /** Who flagged this for review. */
  readonly flaggedBy: SyncId;
  /** Who should review it. */
  readonly assignedTo: SyncId;
  readonly status: ReviewStatus;
  /** Optional reason for flagging. */
  readonly reason: string | null;
  readonly createdAt: Instant;
  readonly resolvedAt: Instant | null;
}

/** Input for tagging a transaction for review. */
export interface TagForReviewInput {
  readonly transactionId: SyncId;
  readonly flaggedBy: SyncId;
  readonly assignedTo: SyncId;
  readonly reason: string | null;
}

/** A thread of notes on a single transaction. */
export interface CollaborationThread {
  readonly transactionId: SyncId;
  readonly notes: readonly CollaborationNote[];
  readonly reviewItem: ReviewItem | null;
}

// ---------------------------------------------------------------------------
// Offboarding (#1733)
// ---------------------------------------------------------------------------

/** Ownership transfer instruction for a single account. */
export interface AccountTransfer {
  readonly accountId: SyncId;
  /** The member who currently owns this account. */
  readonly fromMemberId: SyncId;
  /** The member who will receive ownership. */
  readonly toMemberId: SyncId;
}

/** How to handle a shared account during offboarding. */
export type SharedAccountAction = 'TRANSFER' | 'SPLIT' | 'KEEP';

/** Per-account offboarding decision. */
export interface AccountOffboardingDecision {
  readonly accountId: SyncId;
  readonly action: SharedAccountAction;
  /** Target member for TRANSFER action, null for SPLIT/KEEP. */
  readonly transferTo: SyncId | null;
}

/** Complete offboarding plan for a departing member. */
export interface OffboardingPlan {
  /** The member who is leaving the household. */
  readonly departingMemberId: SyncId;
  /** Per-account decisions. */
  readonly accountDecisions: readonly AccountOffboardingDecision[];
  /** IDs of shared goals to be unlinked from the departing member. */
  readonly goalsToUnlink: readonly SyncId[];
  /** IDs of review items to be reassigned. */
  readonly reviewItemsToReassign: readonly SyncId[];
}

/** Summary of a shared-history export. */
export interface SharedHistoryExport {
  /** The departing member. */
  readonly memberId: SyncId;
  /** Date range of the export. */
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  /** Number of shared transactions included. */
  readonly transactionCount: number;
  /** Total amount across exported transactions (cents, absolute). */
  readonly totalAmountCents: number;
  /** Exported at timestamp. */
  readonly exportedAt: Instant;
}

/** Input for generating a shared-history export. */
export interface SharedHistoryExportInput {
  readonly memberId: SyncId;
  readonly householdId: SyncId;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Construct a Cents object from an integer amount.
 *
 * @param amount - Integer amount in smallest currency unit
 * @returns A Cents value object
 */
export function cents(amount: number): Cents {
  return { amount: Math.round(amount) };
}
