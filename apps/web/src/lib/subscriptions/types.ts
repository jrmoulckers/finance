// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared types for the subscription intelligence suite.
 *
 * All monetary values are in integer cents to avoid floating-point errors.
 * Dates use ISO 8601 strings (YYYY-MM-DD) for calendar dates.
 *
 * References: issues #1596, #1598, #1601, #1619, #1629
 */

// ---------------------------------------------------------------------------
// Core subscription types
// ---------------------------------------------------------------------------

/** Billing frequency for a subscription. */
export type BillingCycle = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';

/** High-level subscription category. */
export type SubscriptionCategory =
  | 'streaming'
  | 'software'
  | 'gaming'
  | 'news'
  | 'fitness'
  | 'food'
  | 'cloud_storage'
  | 'productivity'
  | 'education'
  | 'finance'
  | 'other';

/** Status of a subscription. */
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'trial' | 'expired';

/** A tracked subscription service. */
export interface Subscription {
  /** Unique identifier. */
  readonly id: string;
  /** Service name (e.g., "Netflix", "Spotify"). */
  readonly name: string;
  /** Current price per billing cycle in cents. */
  readonly priceCents: number;
  /** Billing frequency. */
  readonly billingCycle: BillingCycle;
  /** Category for grouping and analysis. */
  readonly category: SubscriptionCategory;
  /** Current lifecycle status. */
  readonly status: SubscriptionStatus;
  /** Date the subscription started (ISO date). */
  readonly startDate: string;
  /** Next billing date (ISO date). */
  readonly nextBillingDate: string;
  /** Date the subscription was cancelled (ISO date), if applicable. */
  readonly cancelledDate?: string;
  /** Provider/vendor name for display. */
  readonly provider: string;
  /** Historical price records for change detection. */
  readonly priceHistory: readonly PriceRecord[];
  /** Free trial information, if applicable. */
  readonly trial?: TrialInfo;
}

// ---------------------------------------------------------------------------
// Price tracking types
// ---------------------------------------------------------------------------

/** A single historical price record. */
export interface PriceRecord {
  /** Price in cents at this point in time. */
  readonly priceCents: number;
  /** Date this price became effective (ISO date). */
  readonly effectiveDate: string;
}

/** Alert generated when a price change or anomaly is detected. */
export interface PriceAlert {
  /** Subscription ID that triggered the alert. */
  readonly subscriptionId: string;
  /** Subscription name (for display). */
  readonly subscriptionName: string;
  /** Alert severity. */
  readonly severity: 'info' | 'warning' | 'critical';
  /** Type of price alert. */
  readonly type: 'price_increase' | 'price_decrease' | 'anomaly';
  /** Previous price in cents. */
  readonly previousPriceCents: number;
  /** New/current price in cents. */
  readonly currentPriceCents: number;
  /** Absolute change in cents (positive = increase). */
  readonly changeCents: number;
  /** Percentage change (positive = increase). */
  readonly changePercent: number;
  /** Date the change was detected (ISO date). */
  readonly detectedDate: string;
  /** Human-readable message. */
  readonly message: string;
}

/** Result of anomaly detection on a subscription's price history. */
export interface AnomalyResult {
  /** Subscription ID. */
  readonly subscriptionId: string;
  /** Whether an anomaly was detected. */
  readonly isAnomaly: boolean;
  /** Current price in cents. */
  readonly currentPriceCents: number;
  /** Mean price from history in cents. */
  readonly meanPriceCents: number;
  /** Standard deviation in cents. */
  readonly stdDevCents: number;
  /** Number of standard deviations from the mean. */
  readonly zScore: number;
  /** Human-readable explanation. */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Cancellation types
// ---------------------------------------------------------------------------

/** Phase of the cancellation workflow. */
export type CancellationPhase =
  | 'confirm_intent'
  | 'check_contract'
  | 'execute_cancellation'
  | 'verify_cancelled'
  | 'follow_up';

/** A single step in a guided cancellation workflow. */
export interface CancellationStep {
  /** Step phase identifier. */
  readonly phase: CancellationPhase;
  /** Human-readable title. */
  readonly title: string;
  /** Detailed instruction. */
  readonly description: string;
  /** Whether the step has been completed. */
  readonly completed: boolean;
  /** Date the step was completed (ISO date), if applicable. */
  readonly completedDate?: string;
}

/** Full cancellation workflow for a subscription. */
export interface CancellationWorkflow {
  /** Subscription ID being cancelled. */
  readonly subscriptionId: string;
  /** Subscription name (for display). */
  readonly subscriptionName: string;
  /** Ordered list of cancellation steps. */
  readonly steps: readonly CancellationStep[];
  /** Current active phase. */
  readonly currentPhase: CancellationPhase;
  /** Whether the entire workflow is complete. */
  readonly isComplete: boolean;
  /** Estimated monthly savings from cancellation in cents. */
  readonly estimatedMonthlySavingsCents: number;
  /** Estimated annual savings from cancellation in cents. */
  readonly estimatedAnnualSavingsCents: number;
}

// ---------------------------------------------------------------------------
// Free trial types
// ---------------------------------------------------------------------------

/** Free trial details for a subscription. */
export interface TrialInfo {
  /** Trial start date (ISO date). */
  readonly startDate: string;
  /** Trial end date (ISO date). */
  readonly endDate: string;
  /** Whether the subscription auto-renews after trial ends. */
  readonly autoRenews: boolean;
  /** Price after trial in cents (may differ from introductory rate). */
  readonly postTrialPriceCents: number;
}

/** Tracking result for a free trial. */
export interface TrialTrackingResult {
  /** Subscription ID. */
  readonly subscriptionId: string;
  /** Subscription name (for display). */
  readonly subscriptionName: string;
  /** Trial start date (ISO date). */
  readonly startDate: string;
  /** Trial end date (ISO date). */
  readonly endDate: string;
  /** Total trial duration in days. */
  readonly totalDays: number;
  /** Days remaining in the trial. */
  readonly daysRemaining: number;
  /** Whether the trial has expired. */
  readonly isExpired: boolean;
  /** Whether auto-renewal is enabled (risk of unexpected charge). */
  readonly autoRenewRisk: boolean;
  /** Price that will be charged after trial in cents. */
  readonly postTrialPriceCents: number;
  /** Suggested reminder date (ISO date) — 3 days before end. */
  readonly reminderDate: string;
  /** Urgency level based on remaining days. */
  readonly urgency: 'none' | 'low' | 'medium' | 'high' | 'expired';
}

// ---------------------------------------------------------------------------
// Bill calendar types
// ---------------------------------------------------------------------------

/** A single upcoming bill entry. */
export interface UpcomingBill {
  /** Subscription ID. */
  readonly subscriptionId: string;
  /** Subscription name. */
  readonly subscriptionName: string;
  /** Bill due date (ISO date). */
  readonly dueDate: string;
  /** Amount due in cents. */
  readonly amountCents: number;
  /** Subscription category. */
  readonly category: SubscriptionCategory;
  /** Whether the bill is overdue. */
  readonly isOverdue: boolean;
  /** Days until due (negative = overdue). */
  readonly daysUntilDue: number;
}

/** Weekly density summary for bill clustering analysis. */
export interface WeeklyBillDensity {
  /** Week start date (ISO date, Monday). */
  readonly weekStart: string;
  /** Week end date (ISO date, Sunday). */
  readonly weekEnd: string;
  /** Number of bills due this week. */
  readonly billCount: number;
  /** Total amount due this week in cents. */
  readonly totalAmountCents: number;
}

/** Cash flow impact for a specific period. */
export interface CashFlowImpact {
  /** Period start date (ISO date). */
  readonly periodStart: string;
  /** Period end date (ISO date). */
  readonly periodEnd: string;
  /** Total subscription outflow in cents. */
  readonly totalOutflowCents: number;
  /** Breakdown by category. */
  readonly byCategory: ReadonlyMap<SubscriptionCategory, number>;
}

/** Full bill calendar result. */
export interface BillCalendar {
  /** All upcoming bills in the requested window. */
  readonly upcomingBills: readonly UpcomingBill[];
  /** Weekly density breakdown. */
  readonly weeklyDensity: readonly WeeklyBillDensity[];
  /** Total amount due in the window in cents. */
  readonly totalAmountCents: number;
  /** Number of overdue bills. */
  readonly overdueCount: number;
  /** Cash flow impact per week. */
  readonly cashFlowByWeek: readonly CashFlowImpact[];
}

// ---------------------------------------------------------------------------
// Subscription analysis types
// ---------------------------------------------------------------------------

/** Category-level spending breakdown. */
export interface CategoryBreakdown {
  /** Category name. */
  readonly category: SubscriptionCategory;
  /** Monthly cost for this category in cents. */
  readonly monthlyCostCents: number;
  /** Annual cost for this category in cents. */
  readonly annualCostCents: number;
  /** Number of subscriptions in this category. */
  readonly count: number;
  /** Percentage of total subscription spend. */
  readonly percentOfTotal: number;
}

/** A detected potential duplicate or overlapping service. */
export interface DuplicateDetection {
  /** IDs of subscriptions that may overlap. */
  readonly subscriptionIds: readonly string[];
  /** Names of the overlapping subscriptions. */
  readonly subscriptionNames: readonly string[];
  /** Shared category. */
  readonly category: SubscriptionCategory;
  /** Combined monthly cost in cents. */
  readonly combinedMonthlyCostCents: number;
  /** Human-readable reason for flagging. */
  readonly reason: string;
}

/** Full subscription portfolio analysis. */
export interface SubscriptionAnalysis {
  /** Total monthly subscription cost in cents. */
  readonly totalMonthlyCostCents: number;
  /** Total annual subscription cost in cents. */
  readonly totalAnnualCostCents: number;
  /** Breakdown by category. */
  readonly categoryBreakdown: readonly CategoryBreakdown[];
  /** Potential duplicate/overlapping services. */
  readonly duplicates: readonly DuplicateDetection[];
  /** Number of active subscriptions. */
  readonly activeCount: number;
  /** Number of trial subscriptions. */
  readonly trialCount: number;
  /** Most expensive subscription (by monthly cost). */
  readonly mostExpensive: Subscription | null;
  /** Average monthly cost per subscription in cents. */
  readonly averageMonthlyCostCents: number;
}
