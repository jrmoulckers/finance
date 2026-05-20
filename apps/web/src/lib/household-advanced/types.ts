// SPDX-License-Identifier: BUSL-1.1

/**
 * Type definitions for the household-advanced collaboration engine.
 *
 * All monetary values are in integer cents. Pure data structures only —
 * no behaviour is attached to these types.
 *
 * References: issues #1722, #1727, #1772, #1791, #1792, #1794, #1795
 */

// ---------------------------------------------------------------------------
// Common / Shared
// ---------------------------------------------------------------------------

/** Universally unique identifier (opaque string). */
export type UserId = string;

/** Universally unique identifier (opaque string). */
export type HouseholdId = string;

/** ISO-8601 date-time string. */
export type ISODateString = string;

/** Status common to many approval workflows. */
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'discussed';

// ---------------------------------------------------------------------------
// Onboarding (#1722)
// ---------------------------------------------------------------------------

/** Recognised household archetypes that influence default configuration. */
export type HouseholdType = 'couple' | 'roommates' | 'family';

/** Identifiers for every step in the onboarding flow. */
export type OnboardingStepId =
  | 'invite_partner'
  | 'set_shared_categories'
  | 'configure_privacy'
  | 'set_budgets'
  | 'review';

/** Metadata for a single onboarding step. */
export interface OnboardingStep {
  readonly id: OnboardingStepId;
  readonly title: string;
  readonly description: string;
  readonly required: boolean;
  readonly completed: boolean;
  readonly skipped: boolean;
}

/** Snapshot of a user's progress through household onboarding. */
export interface OnboardingProgress {
  readonly householdId: HouseholdId;
  readonly householdType: HouseholdType;
  readonly steps: readonly OnboardingStep[];
  readonly currentStepIndex: number;
  readonly startedAt: ISODateString;
  readonly completedAt: ISODateString | null;
}

/** Default values recommended for a given household type. */
export interface OnboardingDefaults {
  readonly householdType: HouseholdType;
  readonly sharedCategories: readonly string[];
  readonly privacySetting: PrivacySetting;
  readonly suggestedBudgetPercent: number;
}

/** Privacy level for shared finances. */
export type PrivacySetting = 'full_visibility' | 'summary_only' | 'masked';

// ---------------------------------------------------------------------------
// Anti-Coercion (#1727)
// ---------------------------------------------------------------------------

/** Trend direction for masked financial views. */
export type TrendDirection = 'up' | 'down' | 'stable';

/** Colour-coded health status replacing raw numbers. */
export type HealthStatus = 'healthy' | 'caution' | 'at_risk';

/** ADP-style masked representation of a financial metric. */
export interface MaskedView {
  /** Human-readable label (e.g. "Savings"). */
  readonly label: string;
  /** Percentage of total (0–100). */
  readonly percentage: number;
  /** Trend direction instead of raw balance. */
  readonly trend: TrendDirection;
  /** Colour-coded status. */
  readonly status: HealthStatus;
}

/** Configuration for coercion safeguards. */
export interface CoercionSafeguard {
  readonly householdId: HouseholdId;
  /** Whether the safe-mode (masked view) is currently active. */
  readonly safeModeActive: boolean;
  /** Maximum permission changes allowed in the detection window. */
  readonly rapidChangeThreshold: number;
  /** Detection window duration in milliseconds. */
  readonly rapidChangeWindowMs: number;
  /** Independent PIN / passphrase required to verify identity. */
  readonly independentAccessEnabled: boolean;
}

/** Immutable audit entry for a permission change. */
export interface PermissionChangeEntry {
  readonly id: string;
  readonly householdId: HouseholdId;
  readonly changedBy: UserId;
  readonly targetUser: UserId;
  readonly changeType: string;
  readonly previousValue: string;
  readonly newValue: string;
  readonly timestamp: ISODateString;
  readonly flaggedAsSuspicious: boolean;
}

// ---------------------------------------------------------------------------
// Relationship Transition (#1772) — premium feature
// ---------------------------------------------------------------------------

/** Step identifiers for the transition wizard. */
export type TransitionStepId =
  | 'separate_accounts'
  | 'divide_goals'
  | 'split_recurring'
  | 'reassign_ownership'
  | 'review_checklist';

/** Status of a single transition step. */
export type TransitionStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

/** A single step in the transition wizard. */
export interface TransitionStep {
  readonly id: TransitionStepId;
  readonly title: string;
  readonly description: string;
  readonly status: TransitionStepStatus;
}

/** Full transition plan for a household. */
export interface TransitionPlan {
  readonly householdId: HouseholdId;
  readonly isPremium: boolean;
  readonly steps: readonly TransitionStep[];
  readonly currentStepIndex: number;
  readonly createdAt: ISODateString;
  readonly completedAt: ISODateString | null;
}

/** Result of an asset division calculation. */
export interface AssetDivision {
  readonly totalCents: number;
  readonly shares: readonly MemberShare[];
  /** True when all shares deviate ≤ 1 cent from equal. */
  readonly isFair: boolean;
}

/** A single member's share of an asset division. */
export interface MemberShare {
  readonly userId: UserId;
  readonly amountCents: number;
  /** Percentage of the total (0–100). */
  readonly percentage: number;
}

/** Timeline event for tracking transition progress. */
export interface TransitionTimelineEvent {
  readonly stepId: TransitionStepId;
  readonly status: TransitionStepStatus;
  readonly timestamp: ISODateString;
  readonly note: string;
}

/** Post-transition action items. */
export interface PostTransitionChecklistItem {
  readonly id: string;
  readonly description: string;
  readonly completed: boolean;
}

// ---------------------------------------------------------------------------
// Purchase Requests (#1791)
// ---------------------------------------------------------------------------

/** Threshold configuration for a given category. */
export interface PurchaseThreshold {
  readonly categoryId: string;
  /** Amount in cents above which a request is required. */
  readonly thresholdCents: number;
  /** Whether purchases below the threshold are auto-approved. */
  readonly autoApproveBelow: boolean;
}

/** A purchase discussion request. */
export interface PurchaseRequest {
  readonly id: string;
  readonly householdId: HouseholdId;
  readonly requestedBy: UserId;
  readonly categoryId: string;
  readonly amountCents: number;
  readonly description: string;
  readonly status: ApprovalStatus;
  readonly createdAt: ISODateString;
  readonly resolvedAt: ISODateString | null;
  readonly resolvedBy: UserId | null;
  readonly note: string;
}

// ---------------------------------------------------------------------------
// Expense Groups (#1792)
// ---------------------------------------------------------------------------

/** Supported split calculation methods. */
export type SplitMethod = 'equal' | 'percentage' | 'exact' | 'income_ratio';

/** A flexible expense group. */
export interface ExpenseGroup {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly memberIds: readonly UserId[];
  readonly splitMethod: SplitMethod;
  readonly createdAt: ISODateString;
}

/** A single expense within a group. */
export interface GroupExpense {
  readonly id: string;
  readonly groupId: string;
  readonly paidBy: UserId;
  readonly amountCents: number;
  readonly description: string;
  readonly date: ISODateString;
  readonly splits: readonly ExpenseSplit[];
}

/** One member's share of a group expense. */
export interface ExpenseSplit {
  readonly userId: UserId;
  readonly amountCents: number;
}

/** Running balance for a member within a group. */
export interface MemberBalance {
  readonly userId: UserId;
  /** Positive = owed money, negative = owes money. */
  readonly balanceCents: number;
}

/** A settlement suggestion between two members. */
export interface Settlement {
  readonly from: UserId;
  readonly to: UserId;
  readonly amountCents: number;
}

// ---------------------------------------------------------------------------
// Shared / Recurring Expenses (#1794)
// ---------------------------------------------------------------------------

/** Recurrence cadence for shared expenses. */
export type RecurrenceCadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually';

/** A recurring shared expense definition. */
export interface SharedExpense {
  readonly id: string;
  readonly householdId: HouseholdId;
  readonly description: string;
  readonly amountCents: number;
  readonly cadence: RecurrenceCadence;
  readonly splitMethod: SplitMethod;
  readonly memberIds: readonly UserId[];
  readonly startDate: ISODateString;
  readonly endDate: ISODateString | null;
  readonly active: boolean;
}

/** A single occurrence of a shared expense that was auto-split. */
export interface SharedExpenseOccurrence {
  readonly id: string;
  readonly sharedExpenseId: string;
  readonly date: ISODateString;
  readonly splits: readonly ExpenseSplit[];
  readonly adjustmentNote: string | null;
}

/** Annual summary of shared expenses. */
export interface SharedExpenseAnnualSummary {
  readonly year: number;
  readonly totalCents: number;
  readonly occurrenceCount: number;
  readonly perMember: readonly { readonly userId: UserId; readonly totalCents: number }[];
}

// ---------------------------------------------------------------------------
// Advisor / Coach Access (#1795)
// ---------------------------------------------------------------------------

/** Role for external access. */
export type AdvisorRole = 'advisor' | 'coach';

/** Read-only advisor/coach access configuration. */
export interface AdvisorAccess {
  readonly id: string;
  readonly householdId: HouseholdId;
  readonly advisorUserId: UserId;
  readonly role: AdvisorRole;
  readonly visibleAccountIds: readonly string[];
  readonly visibleCategoryIds: readonly string[];
  readonly grantedAt: ISODateString;
  readonly expiresAt: ISODateString;
  readonly revokedAt: ISODateString | null;
  readonly grantedBy: UserId;
}

/** Immutable audit entry for advisor access events. */
export interface AdvisorAccessLogEntry {
  readonly id: string;
  readonly advisorAccessId: string;
  readonly action: 'granted' | 'accessed' | 'scope_changed' | 'renewed' | 'revoked';
  readonly performedBy: UserId;
  readonly timestamp: ISODateString;
  readonly detail: string;
}
