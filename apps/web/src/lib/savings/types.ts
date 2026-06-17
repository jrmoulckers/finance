// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared types for the savings & goals suite.
 *
 * All monetary values are in integer cents to avoid floating-point errors.
 * Interest / savings rates use basis points (1 bp = 0.01 %).
 * Dates use ISO 8601 strings (YYYY-MM-DD) for calendar dates.
 *
 * References: issues #1590, #1630, #1640, #1650, #1676, #1788
 */

// ---------------------------------------------------------------------------
// Safe-to-spend (#1590)
// ---------------------------------------------------------------------------

/** Inputs for the safe-to-spend calculation. */
export interface SafeToSpendInput {
  /** Total expected income for the period in cents. */
  readonly incomeCents: number;
  /** Total committed / fixed expenses for the period in cents. */
  readonly committedExpensesCents: number;
  /** Minimum balance floor the user wants to keep in cents. */
  readonly minimumBalanceFloorCents: number;
  /** Number of days remaining in the period (for daily rate). */
  readonly daysRemaining: number;
}

/** Result of a safe-to-spend calculation. */
export interface SafeToSpendResult {
  /** Total safe-to-spend amount for the period in cents. */
  readonly totalCents: number;
  /** Daily safe-to-spend rate in cents. */
  readonly dailyRateCents: number;
  /** Weekly safe-to-spend rate in cents (dailyRate × 7). */
  readonly weeklyRateCents: number;
  /** Warning level based on remaining safe-to-spend. */
  readonly warningLevel: WarningLevel;
}

/** Warning threshold levels for safe-to-spend guardrails. */
export type WarningLevel = 'safe' | 'caution' | 'warning' | 'critical';

// ---------------------------------------------------------------------------
// Round-up savings (#1630)
// ---------------------------------------------------------------------------

/** How to round up each transaction. */
export type RoundUpTarget = 'dollar' | 'five' | 'ten';

/** Configuration for round-up savings automation. */
export interface RoundUpConfig {
  /** Rounding target. */
  readonly target: RoundUpTarget;
  /** Optional multiplier applied to the round-up (e.g. 2× = double round-up). */
  readonly multiplier: number;
}

/** A single transaction amount eligible for round-up. */
export interface RoundUpTransaction {
  /** Transaction amount in cents (positive). */
  readonly amountCents: number;
}

/** Aggregated round-up savings result. */
export interface RoundUpResult {
  /** Total round-up savings in cents. */
  readonly totalCents: number;
  /** Average round-up per transaction in cents. */
  readonly averageCents: number;
  /** Projected annual savings in cents (extrapolated from period). */
  readonly projectedAnnualCents: number;
}

// ---------------------------------------------------------------------------
// Savings challenges (#1640)
// ---------------------------------------------------------------------------

/** Type of savings challenge. */
export type ChallengeType = '52_week' | 'no_spend' | 'custom';

/** A week entry in a 52-week challenge. */
export interface ChallengeWeek {
  /** 1-indexed week number. */
  readonly week: number;
  /** Amount to save this week in cents. */
  readonly amountCents: number;
  /** Whether this week's deposit was completed. */
  readonly completed: boolean;
}

/** Configuration for a custom savings challenge. */
export interface CustomChallengeConfig {
  /** Total number of periods (weeks or days). */
  readonly totalPeriods: number;
  /** Starting amount per period in cents. */
  readonly startAmountCents: number;
  /** Amount to increase each period in cents. */
  readonly incrementCents: number;
}

/** Progress summary for a savings challenge. */
export interface ChallengeProgress {
  /** Challenge type. */
  readonly type: ChallengeType;
  /** Total periods in the challenge. */
  readonly totalPeriods: number;
  /** Periods completed. */
  readonly completedPeriods: number;
  /** Progress percentage (0–100). */
  readonly progressPercent: number;
  /** Total saved so far in cents. */
  readonly savedCents: number;
  /** Total target amount in cents. */
  readonly targetCents: number;
  /** Current streak of consecutive completed periods. */
  readonly currentStreak: number;
  /** Longest streak of consecutive completed periods. */
  readonly longestStreak: number;
}

/** No-spend tracking result. */
export interface NoSpendResult {
  /** Total no-spend days achieved. */
  readonly noSpendDays: number;
  /** Total days tracked. */
  readonly totalDays: number;
  /** No-spend day percentage (0–100). */
  readonly noSpendPercent: number;
  /** Current consecutive no-spend streak. */
  readonly currentStreak: number;
  /** Longest consecutive no-spend streak. */
  readonly longestStreak: number;
}

// ---------------------------------------------------------------------------
// Emergency runway (#1650)
// ---------------------------------------------------------------------------

/** Input for emergency runway calculation. */
export interface EmergencyRunwayInput {
  /** Emergency fund balance in cents. */
  readonly emergencyFundCents: number;
  /** Total monthly expenses in cents. */
  readonly monthlyExpensesCents: number;
  /** Essential-only monthly expenses in cents. */
  readonly essentialExpensesCents: number;
  /** Monthly savings rate in cents (for projection). */
  readonly monthlySavingsRateCents: number;
}

/** Emergency runway calculation result. */
export interface EmergencyRunwayResult {
  /** Months of total expenses covered. */
  readonly totalExpenseMonths: number;
  /** Months of essential expenses covered. */
  readonly essentialExpenseMonths: number;
  /** Runway health status. */
  readonly status: RunwayStatus;
  /** Months until target is reached at current savings rate (null if already met or no savings). */
  readonly monthsToTarget: number | null;
}

/** Runway health status based on months covered. */
export type RunwayStatus = 'critical' | 'insufficient' | 'adequate' | 'strong';

// ---------------------------------------------------------------------------
// Debt paydown goals (#1676)
// ---------------------------------------------------------------------------

/** A debt-paydown goal linked to a liability account. */
export interface DebtPaydownGoal {
  /** Goal identifier. */
  readonly id: string;
  /** Linked liability account identifier. */
  readonly accountId: string;
  /** Original debt balance when goal was created in cents. */
  readonly originalBalanceCents: number;
  /** Current debt balance in cents. */
  readonly currentBalanceCents: number;
  /** Monthly payment amount in cents. */
  readonly monthlyPaymentCents: number;
  /** Annual interest rate in basis points. */
  readonly annualRateBps: number;
}

/** Result of a debt paydown goal calculation. */
export interface DebtPaydownResult {
  /** Goal completion percentage (0–100). */
  readonly completionPercent: number;
  /** Amount paid off so far in cents. */
  readonly paidOffCents: number;
  /** Remaining balance in cents. */
  readonly remainingCents: number;
  /** Estimated months until payoff at current rate. */
  readonly monthsToPayoff: number;
  /** Estimated payoff date (ISO date string). */
  readonly estimatedPayoffDate: string;
  /** Total interest remaining in cents. */
  readonly totalInterestRemainingCents: number;
}

/** Impact of an extra monthly payment on a debt paydown goal. */
export interface ExtraPaymentImpact {
  /** Extra monthly payment amount in cents. */
  readonly extraPaymentCents: number;
  /** New months to payoff with extra payment. */
  readonly newMonthsToPayoff: number;
  /** Months saved compared to current rate. */
  readonly monthsSaved: number;
  /** Interest saved in cents. */
  readonly interestSavedCents: number;
  /** New estimated payoff date (ISO date string). */
  readonly newPayoffDate: string;
}

// ---------------------------------------------------------------------------
// Goal projections & milestones (#1788)
// ---------------------------------------------------------------------------

/** A savings goal with a target and current progress. */
export interface SavingsGoal {
  /** Goal identifier. */
  readonly id: string;
  /** Goal name. */
  readonly name: string;
  /** Target amount in cents. */
  readonly targetCents: number;
  /** Current saved amount in cents. */
  readonly currentCents: number;
  /** Monthly contribution in cents. */
  readonly monthlyContributionCents: number;
  /** Goal start date (ISO date string). */
  readonly startDate: string;
  /** Optional target date (ISO date string). */
  readonly targetDate?: string;
}

/** On-track status for a savings goal. */
export type GoalStatus = 'ahead' | 'on_track' | 'behind' | 'completed';

/** Goal projection result. */
export interface GoalProjection {
  /** Projected completion date (ISO date string). */
  readonly projectedDate: string;
  /** Goal status relative to target date. */
  readonly status: GoalStatus;
  /** Completion percentage (0–100). */
  readonly completionPercent: number;
  /** Months remaining until projected completion. */
  readonly monthsRemaining: number;
  /** Required monthly contribution to hit target date in cents (null if no target date). */
  readonly requiredMonthlyCents: number | null;
}

/** A milestone in goal progress. */
export interface Milestone {
  /** Milestone label (e.g. "25%", "50%"). */
  readonly label: string;
  /** Milestone percentage (0–100). */
  readonly percent: number;
  /** Amount at this milestone in cents. */
  readonly amountCents: number;
  /** Whether this milestone has been reached. */
  readonly reached: boolean;
  /** Projected date to reach this milestone (ISO date string), null if already reached. */
  readonly projectedDate: string | null;
}

// ---------------------------------------------------------------------------
// AI-suggested savings goals & nudges (#1748)
// ---------------------------------------------------------------------------

/** Goal categories surfaced by the savings suggestion engine. */
export type SuggestedGoalType =
  | 'emergency-fund'
  | 'discretionary-savings'
  | 'big-purchase'
  | 'retirement'
  | 'debt-payoff';

/** Contribution cadence for a suggested plan. */
export type ContributionFrequency = 'weekly' | 'biweekly' | 'monthly';

/** Priority assigned to a savings suggestion. */
export type SuggestedGoalPriority = 'high' | 'medium' | 'low';

/** Existing goals reclassified for local savings analysis. */
export interface ExistingSavingsGoal {
  readonly id: string;
  readonly name: string;
  readonly targetCents: number;
  readonly currentCents: number;
  readonly targetDate: string | null;
  readonly classification: 'emergency-fund' | 'retirement' | 'debt-payoff' | 'wishlist';
}

/** A reducible spending category discovered from local spending history. */
export interface SpendingCategoryTrend {
  readonly categoryId: string | null;
  readonly categoryName: string;
  readonly monthlySpendCents: number;
  readonly previousMonthlySpendCents: number;
  readonly shareOfSpendingPercent: number;
  readonly essential: boolean;
}

/** Wishlist-style item used to recommend big-purchase timelines. */
export interface WishlistItem {
  readonly id: string;
  readonly name: string;
  readonly targetCents: number;
  readonly currentCents: number;
  readonly targetDate: string | null;
  readonly linkedGoalId: string | null;
}

/** Liability snapshot used for debt-payoff nudges. */
export interface DebtSnapshot {
  readonly accountId: string;
  readonly name: string;
  readonly balanceCents: number;
}

/** Consolidated local-only financial snapshot for the savings engine. */
export interface SavingsAnalysisSnapshot {
  readonly currencyCode: string;
  readonly monthlyIncomeCents: number;
  readonly monthlyExpensesCents: number;
  readonly monthlySurplusCents: number;
  readonly annualizedIncomeCents: number;
  readonly liquidSavingsCents: number;
  readonly retirementSavingsCents: number;
  readonly monthlyRetirementContributionCents: number;
  readonly currentYearRetirementContributionCents: number;
  readonly currentWeeklySavingsCents: number;
  readonly previousWeeklySavingsCents: number;
  readonly discretionaryCategories: readonly SpendingCategoryTrend[];
  readonly discretionaryRedirectCents: number;
  readonly existingGoals: readonly ExistingSavingsGoal[];
  readonly wishlistItems: readonly WishlistItem[];
  readonly debtAccounts: readonly DebtSnapshot[];
}

/** Input for building contribution schedules for a suggestion. */
export interface ContributionScheduleInput {
  readonly targetCents: number;
  readonly currentCents: number;
  readonly monthlyCapacityCents: number;
  readonly desiredMonthlyContributionCents?: number;
}

/** A contribution schedule option for a specific cadence. */
export interface ContributionPlanOption {
  readonly frequency: ContributionFrequency;
  readonly contributionCents: number;
  readonly monthlyEquivalentCents: number;
  readonly percentOfSurplus: number;
}

/** The recommended contribution plan for a suggested goal. */
export interface ContributionPlan {
  readonly recommendedFrequency: ContributionFrequency;
  readonly recommendedMonthlyContributionCents: number;
  readonly minimumMonthlyContributionCents: number;
  readonly stretchMonthlyContributionCents: number;
  readonly estimatedMonths: number;
  readonly options: readonly ContributionPlanOption[];
}

/** A single savings goal suggestion generated locally from spending patterns. */
export interface SuggestedSavingsGoal {
  readonly id: string;
  readonly type: SuggestedGoalType;
  readonly title: string;
  readonly reason: string;
  readonly reasoning: readonly string[];
  readonly priority: SuggestedGoalPriority;
  readonly targetCents: number;
  readonly currentCents: number;
  readonly shortfallCents: number;
  readonly targetDate: string | null;
  readonly linkedGoalId: string | null;
  readonly redirectCategoryNames: readonly string[];
  readonly contributionPlan: ContributionPlan;
}

/** A point in the contribution trajectory for a suggestion. */
export interface SuggestedGoalProjectionPoint {
  readonly date: string;
  readonly amountCents: number;
}

/** Projection result for a suggested goal. */
export interface SuggestedGoalProjection {
  readonly projectedCompletionDate: string | null;
  readonly monthsToGoal: number | null;
  readonly completionPercent: number;
  readonly onTrack: boolean;
  readonly milestoneDates: readonly {
    readonly label: string;
    readonly date: string | null;
  }[];
  readonly trajectory: readonly SuggestedGoalProjectionPoint[];
}

/** Nudge categories emitted by the local suggestion engine. */
export type SavingsNudgeType =
  | 'spending-drift'
  | 'redirect-opportunity'
  | 'retirement-gap'
  | 'debt-push'
  | 'goal-momentum';

/** A contextual nudge built from recent spending and savings momentum. */
export interface SavingsNudge {
  readonly id: string;
  readonly type: SavingsNudgeType;
  readonly tone: 'info' | 'warning' | 'success';
  readonly title: string;
  readonly message: string;
  readonly actionLabel: string;
  readonly linkedSuggestionId: string | null;
}

/** Input needed to generate contextual savings nudges. */
export interface SavingsNudgeContext {
  readonly currencyCode: string;
  readonly monthlySurplusCents: number;
  readonly currentWeeklySavingsCents: number;
  readonly previousWeeklySavingsCents: number;
  readonly topDiscretionaryCategory: SpendingCategoryTrend | null;
  readonly suggestions: readonly SuggestedSavingsGoal[];
}
