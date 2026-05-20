// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared types for the family finance & parental controls engine.
 *
 * All monetary values are in **integer cents** to avoid floating-point errors.
 *
 * References: #1728, #1729, #1730, #1731, #1796, #1797, #1798, #1799, #1800
 */

// ---------------------------------------------------------------------------
// Core family types
// ---------------------------------------------------------------------------

/** Role a family member can hold. */
export type ParentalRole = 'parent' | 'teen' | 'child' | 'dependent';

/** Permission level for caregiver / guardian access. */
export type CaregiverPermission = 'read-only' | 'limited-edit' | 'full';

/** Frequency for recurring schedules. */
export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly';

/** Approval status for requests and workflows. */
export type ApprovalStatus = 'pending' | 'approved' | 'denied';

/** Severity of an activity alert. */
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Type of unusual activity detected. */
export type AlertType = 'amount-threshold' | 'category-anomaly' | 'frequency-spike';

/** Spending limit period. */
export type LimitPeriod = 'daily' | 'weekly' | 'monthly';

// ---------------------------------------------------------------------------
// Family member & child accounts (#1796)
// ---------------------------------------------------------------------------

/** A member of the family group. */
export interface FamilyMember {
  /** Unique member identifier. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Role within the family group. */
  readonly role: ParentalRole;
  /** Age in years (drives feature gating). */
  readonly age: number;
  /** Parent member ID (null for parents). */
  readonly parentId: string | null;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
}

/** A child or teen sub-account linked to a parent. */
export interface ChildAccount {
  /** Unique account identifier. */
  readonly id: string;
  /** Owning family member ID. */
  readonly memberId: string;
  /** Parent account ID this is linked to. */
  readonly parentAccountId: string;
  /** Display name for the account. */
  readonly name: string;
  /** Account role (child or teen). */
  readonly role: 'child' | 'teen';
  /** Current balance in cents. */
  readonly balanceCents: number;
  /** Whether the child can view transaction history. */
  readonly canViewTransactions: boolean;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Spending limits & approval (#1800, #1728)
// ---------------------------------------------------------------------------

/** Category-based spending limit for a dependent. */
export interface SpendingLimit {
  /** Unique limit identifier. */
  readonly id: string;
  /** Account ID this limit applies to. */
  readonly accountId: string;
  /** Category the limit applies to (null = all categories). */
  readonly categoryId: string | null;
  /** Category name for display. */
  readonly categoryName: string;
  /** Maximum amount in cents for the period. */
  readonly maxAmountCents: number;
  /** Limit period. */
  readonly period: LimitPeriod;
  /** Per-transaction maximum in cents (0 = no per-txn limit). */
  readonly perTransactionMaxCents: number;
  /** Whether this limit is active. */
  readonly enabled: boolean;
}

/** A request from a child/teen to approve spending beyond limits. */
export interface ApprovalRequest {
  /** Unique request identifier. */
  readonly id: string;
  /** Account ID of the requestor. */
  readonly accountId: string;
  /** Requestor's name. */
  readonly requestorName: string;
  /** Amount in cents being requested. */
  readonly amountCents: number;
  /** Category of the spend. */
  readonly categoryId: string | null;
  /** Description / reason for the request. */
  readonly description: string;
  /** Current approval status. */
  readonly status: ApprovalStatus;
  /** ID of parent who reviewed (null if pending). */
  readonly reviewedBy: string | null;
  /** Reason provided for approval or denial. */
  readonly reviewReason: string;
  /** ISO-8601 request timestamp. */
  readonly requestedAt: string;
  /** ISO-8601 review timestamp (empty if pending). */
  readonly reviewedAt: string;
}

// ---------------------------------------------------------------------------
// Allowance (#1797)
// ---------------------------------------------------------------------------

/** Recurring allowance schedule. */
export interface AllowanceSchedule {
  /** Unique schedule identifier. */
  readonly id: string;
  /** Target child account ID. */
  readonly accountId: string;
  /** Recipient name. */
  readonly recipientName: string;
  /** Allowance amount in cents. */
  readonly amountCents: number;
  /** Recurrence frequency. */
  readonly frequency: RecurrenceFrequency;
  /** Day of period to transfer (1-based; for monthly = day-of-month 1-28). */
  readonly dayOfPeriod: number;
  /** Whether the schedule is currently active. */
  readonly active: boolean;
  /** ISO-8601 date of next scheduled transfer. */
  readonly nextTransferDate: string;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
}

/** A single allowance transfer record. */
export interface AllowanceTransfer {
  /** Unique transfer identifier. */
  readonly id: string;
  /** Schedule ID this transfer belongs to. */
  readonly scheduleId: string;
  /** Amount in cents. */
  readonly amountCents: number;
  /** Type of transfer. */
  readonly type: 'regular' | 'bonus';
  /** Note / reason. */
  readonly note: string;
  /** ISO-8601 transfer timestamp. */
  readonly transferredAt: string;
}

// ---------------------------------------------------------------------------
// Chore rewards (#1798)
// ---------------------------------------------------------------------------

/** A chore that can earn rewards. */
export interface Chore {
  /** Unique chore identifier. */
  readonly id: string;
  /** Chore title. */
  readonly title: string;
  /** Description of the chore. */
  readonly description: string;
  /** Reward amount in cents on completion. */
  readonly rewardCents: number;
  /** Assigned member ID. */
  readonly assignedTo: string;
  /** Recurrence (null = one-time). */
  readonly recurrence: RecurrenceFrequency | null;
  /** Whether the chore is active. */
  readonly active: boolean;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
}

/** Record of a chore completion. */
export interface ChoreCompletion {
  /** Unique completion identifier. */
  readonly id: string;
  /** Chore ID. */
  readonly choreId: string;
  /** Member ID who completed it. */
  readonly completedBy: string;
  /** Approval status. */
  readonly status: ApprovalStatus;
  /** Reward amount in cents (may include streak bonus). */
  readonly rewardCents: number;
  /** Whether a streak bonus was applied. */
  readonly streakBonusApplied: boolean;
  /** ISO-8601 completion timestamp. */
  readonly completedAt: string;
  /** ISO-8601 review timestamp (empty if pending). */
  readonly reviewedAt: string;
}

// ---------------------------------------------------------------------------
// Child savings goals (#1799)
// ---------------------------------------------------------------------------

/** A child-friendly savings goal. */
export interface ChildGoal {
  /** Unique goal identifier. */
  readonly id: string;
  /** Account ID this goal belongs to. */
  readonly accountId: string;
  /** Goal name (e.g. "New Bicycle"). */
  readonly name: string;
  /** Target amount in cents. */
  readonly targetCents: number;
  /** Current saved amount in cents. */
  readonly currentCents: number;
  /** Progress percentage (0-100). */
  readonly progressPercent: number;
  /** Whether the goal is completed. */
  readonly completed: boolean;
  /** Parent matching rate (e.g. 0.5 = 50% match). */
  readonly parentMatchRate: number;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
}

/** A contribution to a child savings goal. */
export interface GoalContribution {
  /** Unique contribution identifier. */
  readonly id: string;
  /** Goal ID. */
  readonly goalId: string;
  /** Amount in cents. */
  readonly amountCents: number;
  /** Source of contribution. */
  readonly source: 'child' | 'parent-match' | 'reward' | 'bonus';
  /** ISO-8601 timestamp. */
  readonly contributedAt: string;
}

/** A milestone for kid-friendly progress UX. */
export interface GoalMilestone {
  /** Milestone percentage (e.g. 25, 50, 75, 100). */
  readonly percent: number;
  /** Celebration label. */
  readonly label: string;
  /** Whether this milestone has been reached. */
  readonly reached: boolean;
  /** ISO-8601 date reached (empty if not yet). */
  readonly reachedDate: string;
}

// ---------------------------------------------------------------------------
// Activity alerts (#1731)
// ---------------------------------------------------------------------------

/** An alert about unusual dependent activity. */
export interface ActivityAlert {
  /** Unique alert identifier. */
  readonly id: string;
  /** Account ID that triggered the alert. */
  readonly accountId: string;
  /** Type of anomaly detected. */
  readonly type: AlertType;
  /** Severity level. */
  readonly severity: AlertSeverity;
  /** Human-readable alert message. */
  readonly message: string;
  /** Transaction amount in cents that triggered it (if applicable). */
  readonly triggerAmountCents: number;
  /** Whether a parent has acknowledged this alert. */
  readonly acknowledged: boolean;
  /** ISO-8601 timestamp of alert creation. */
  readonly createdAt: string;
  /** ISO-8601 timestamp of acknowledgment (empty if not ack'd). */
  readonly acknowledgedAt: string;
}

/** Configuration for activity monitoring thresholds. */
export interface AlertThresholds {
  /** Amount in cents above which a single transaction triggers an alert. */
  readonly amountThresholdCents: number;
  /** Number of transactions per day that triggers a frequency spike. */
  readonly dailyTransactionLimit: number;
  /** Percentage increase in category spending to flag as anomaly (0-100). */
  readonly categoryAnomalyPercent: number;
}

// ---------------------------------------------------------------------------
// Education feed (#1729)
// ---------------------------------------------------------------------------

/** Age bracket for lesson targeting. */
export type AgeBracket = 'under-8' | '8-12' | '13-17';

/** A financial literacy lesson. */
export interface EducationLesson {
  /** Unique lesson identifier. */
  readonly id: string;
  /** Lesson title. */
  readonly title: string;
  /** Lesson content / body text. */
  readonly content: string;
  /** Topic category. */
  readonly topic: string;
  /** Target age bracket. */
  readonly ageBracket: AgeBracket;
  /** Order within the topic sequence (1-based). */
  readonly sequenceOrder: number;
  /** Estimated duration in minutes. */
  readonly durationMinutes: number;
}

/** Progress on a lesson for a specific member. */
export interface LessonProgress {
  /** Lesson ID. */
  readonly lessonId: string;
  /** Member ID. */
  readonly memberId: string;
  /** Whether the lesson is completed. */
  readonly completed: boolean;
  /** Quiz score (0-100, -1 if not attempted). */
  readonly quizScore: number;
  /** ISO-8601 completion timestamp (empty if not completed). */
  readonly completedAt: string;
}

/** A badge earned for education progress. */
export interface ProgressBadge {
  /** Unique badge identifier. */
  readonly id: string;
  /** Badge name. */
  readonly name: string;
  /** Badge description. */
  readonly description: string;
  /** Topic this badge relates to. */
  readonly topic: string;
  /** Number of lessons required to earn this badge. */
  readonly requiredLessons: number;
}

// ---------------------------------------------------------------------------
// Caregiver access (#1730)
// ---------------------------------------------------------------------------

/** A caregiver / guardian access grant. */
export interface CaregiverAccess {
  /** Unique access grant identifier. */
  readonly id: string;
  /** Caregiver's name. */
  readonly caregiverName: string;
  /** Caregiver's contact (email or phone). */
  readonly caregiverContact: string;
  /** Permission level. */
  readonly permission: CaregiverPermission;
  /** Account IDs this caregiver can access. */
  readonly accountIds: readonly string[];
  /** ISO-8601 start date of access. */
  readonly validFrom: string;
  /** ISO-8601 end date (empty for indefinite). */
  readonly validUntil: string;
  /** Whether this is an emergency access grant. */
  readonly isEmergency: boolean;
  /** Whether this grant is currently active. */
  readonly active: boolean;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
}

/** An audit log entry for caregiver actions. */
export interface CaregiverAuditEntry {
  /** Unique entry identifier. */
  readonly id: string;
  /** Caregiver access grant ID. */
  readonly accessId: string;
  /** Action performed. */
  readonly action: string;
  /** Account ID accessed. */
  readonly accountId: string;
  /** ISO-8601 timestamp. */
  readonly timestamp: string;
  /** Additional details. */
  readonly details: string;
}
