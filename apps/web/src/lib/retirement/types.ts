// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared types for the retirement planning and wealth management engines.
 *
 * All monetary values are in integer cents to avoid floating-point errors.
 *
 * References: #1688, #1736, #1737, #1744, #1745, #1775
 */

// ---------------------------------------------------------------------------
// Retirement Account & Tax types (#1688 / #1737)
// ---------------------------------------------------------------------------

/** Tax treatment of a retirement account. */
export type AccountTaxType = 'traditional' | 'roth' | 'taxable';

/** A retirement account with balance and tax treatment. */
export interface RetirementAccount {
  /** Unique identifier. */
  readonly id: string;
  /** Display name (e.g. "401(k)", "Roth IRA"). */
  readonly name: string;
  /** Current balance in cents. */
  readonly balanceCents: number;
  /** Tax treatment of the account. */
  readonly taxType: AccountTaxType;
  /** Owner's current age (for RMD calculation). */
  readonly ownerAge: number;
}

/** A federal tax bracket. */
export interface TaxBracket {
  /** Lower bound of the bracket in cents (inclusive). */
  readonly minCents: number;
  /** Upper bound of the bracket in cents (exclusive, Infinity for top bracket). */
  readonly maxCents: number;
  /** Marginal rate as a decimal (e.g. 0.22 = 22%). */
  readonly rate: number;
}

/** Strategy for ordering withdrawals across account types. */
export type WithdrawalStrategy = 'traditional-first' | 'roth-first' | 'proportional' | 'tax-aware';

/** A single year's withdrawal plan entry. */
export interface WithdrawalYearPlan {
  /** Calendar year. */
  readonly year: number;
  /** Owner's age in this year. */
  readonly age: number;
  /** Withdrawal from traditional accounts in cents. */
  readonly traditionalCents: number;
  /** Withdrawal from Roth accounts in cents. */
  readonly rothCents: number;
  /** Withdrawal from taxable accounts in cents. */
  readonly taxableCents: number;
  /** Total withdrawal in cents. */
  readonly totalCents: number;
  /** Required Minimum Distribution in cents (0 if under RMD age). */
  readonly rmdCents: number;
  /** Estimated federal tax on this year's withdrawals in cents. */
  readonly estimatedTaxCents: number;
  /** After-tax income in cents. */
  readonly afterTaxCents: number;
  /** Remaining traditional balance in cents. */
  readonly remainingTraditionalCents: number;
  /** Remaining Roth balance in cents. */
  readonly remainingRothCents: number;
  /** Remaining taxable balance in cents. */
  readonly remainingTaxableCents: number;
}

/** Result of running the withdrawal optimizer. */
export interface WithdrawalPlan {
  /** Strategy used. */
  readonly strategy: WithdrawalStrategy;
  /** Year-by-year plan. */
  readonly years: readonly WithdrawalYearPlan[];
  /** Total taxes paid over the plan in cents. */
  readonly totalTaxCents: number;
  /** Total withdrawals over the plan in cents. */
  readonly totalWithdrawnCents: number;
  /** Age at which accounts are exhausted (null if they last). */
  readonly exhaustionAge: number | null;
}

/** Result of a Roth conversion analysis for a single year. */
export interface RothConversionYear {
  /** Calendar year. */
  readonly year: number;
  /** Amount to convert in cents. */
  readonly conversionCents: number;
  /** Tax cost of the conversion in cents. */
  readonly taxCostCents: number;
  /** Remaining space in current bracket in cents. */
  readonly bracketSpaceCents: number;
}

// ---------------------------------------------------------------------------
// Guaranteed Income types (#1736)
// ---------------------------------------------------------------------------

/** Social Security claiming age option. */
export type SocialSecurityClaimAge = 62 | 63 | 64 | 65 | 66 | 67 | 68 | 69 | 70;

/** Social Security benefit estimate at a given claiming age. */
export interface SocialSecurityEstimate {
  /** Claiming age. */
  readonly claimAge: SocialSecurityClaimAge;
  /** Monthly benefit in cents. */
  readonly monthlyBenefitCents: number;
  /** Annual benefit in cents. */
  readonly annualBenefitCents: number;
  /** Adjustment factor versus full retirement age (e.g. 0.70 for age 62). */
  readonly adjustmentFactor: number;
  /** Break-even age vs claiming at 62, in years. */
  readonly breakEvenAge: number;
}

/** A pension or annuity guaranteed income stream. */
export interface GuaranteedIncomeStream {
  /** Unique identifier. */
  readonly id: string;
  /** Source name (e.g. "State Pension", "MetLife Annuity"). */
  readonly name: string;
  /** Type of income stream. */
  readonly type: 'social-security' | 'pension' | 'annuity';
  /** Monthly payment in cents. */
  readonly monthlyPaymentCents: number;
  /** Start age for payments. */
  readonly startAge: number;
  /** End age (null if lifetime). */
  readonly endAge: number | null;
  /** Annual cost-of-living adjustment as decimal (e.g. 0.02 = 2%). */
  readonly colaRate: number;
}

/** Gap analysis comparing guaranteed income to desired spending. */
export interface IncomeGapAnalysis {
  /** Total guaranteed monthly income in cents at target age. */
  readonly guaranteedMonthlyCents: number;
  /** Desired monthly spending in cents. */
  readonly desiredMonthlyCents: number;
  /** Monthly gap (negative = shortfall) in cents. */
  readonly monthlyGapCents: number;
  /** Annual gap in cents. */
  readonly annualGapCents: number;
  /** Percentage of desired income covered by guaranteed sources. */
  readonly coveragePercent: number;
  /** Per-stream breakdown. */
  readonly streams: readonly GuaranteedIncomeStream[];
}

/** Present value calculation result for a pension. */
export interface PensionPresentValue {
  /** Stream identifier. */
  readonly streamId: string;
  /** Present value in cents. */
  readonly presentValueCents: number;
  /** Total nominal payments in cents. */
  readonly totalNominalCents: number;
  /** Discount rate used as decimal. */
  readonly discountRate: number;
  /** Years of payments. */
  readonly paymentYears: number;
}

// ---------------------------------------------------------------------------
// Wealth Planning types (#1744)
// ---------------------------------------------------------------------------

/** Ownership category for joint planning. */
export type OwnershipType = 'individual-a' | 'individual-b' | 'joint';

/** A wealth-plan asset with ownership assignment. */
export interface WealthPlanAsset {
  /** Unique identifier. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Current value in cents. */
  readonly valueCents: number;
  /** Ownership assignment. */
  readonly ownership: OwnershipType;
  /** Asset category. */
  readonly category: 'cash' | 'investment' | 'property' | 'retirement' | 'other';
}

/** A wealth-plan liability with ownership assignment. */
export interface WealthPlanLiability {
  /** Unique identifier. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Outstanding balance in cents. */
  readonly balanceCents: number;
  /** Ownership assignment. */
  readonly ownership: OwnershipType;
}

/** A shared financial goal between partners. */
export interface SharedGoal {
  /** Unique identifier. */
  readonly id: string;
  /** Goal name. */
  readonly name: string;
  /** Target amount in cents. */
  readonly targetCents: number;
  /** Current progress in cents. */
  readonly currentCents: number;
  /** Partner A contribution in cents. */
  readonly contributionACents: number;
  /** Partner B contribution in cents. */
  readonly contributionBCents: number;
  /** Target date (ISO-8601 or null). */
  readonly targetDate: string | null;
}

/** Aggregated joint net worth breakdown. */
export interface JointNetWorth {
  /** Partner A total assets in cents. */
  readonly assetACents: number;
  /** Partner B total assets in cents. */
  readonly assetBCents: number;
  /** Joint total assets in cents. */
  readonly assetJointCents: number;
  /** Total assets in cents. */
  readonly totalAssetsCents: number;
  /** Partner A total liabilities in cents. */
  readonly liabilityACents: number;
  /** Partner B total liabilities in cents. */
  readonly liabilityBCents: number;
  /** Joint total liabilities in cents. */
  readonly liabilityJointCents: number;
  /** Total liabilities in cents. */
  readonly totalLiabilitiesCents: number;
  /** Net worth (assets - liabilities) in cents. */
  readonly netWorthCents: number;
}

/** Progress report for shared goals. */
export interface SharedGoalProgress {
  /** Goal identifier. */
  readonly goalId: string;
  /** Goal name. */
  readonly goalName: string;
  /** Progress as 0-100 percentage. */
  readonly progressPercent: number;
  /** Remaining amount in cents. */
  readonly remainingCents: number;
  /** Partner A contribution percentage. */
  readonly contributionAPercent: number;
  /** Partner B contribution percentage. */
  readonly contributionBPercent: number;
}

// ---------------------------------------------------------------------------
// Net Worth Timeline types (#1745)
// ---------------------------------------------------------------------------

/** A single net worth snapshot in time. */
export interface NetWorthSnapshot {
  /** ISO-8601 date string. */
  readonly date: string;
  /** Total assets in cents. */
  readonly totalAssetsCents: number;
  /** Total liabilities in cents. */
  readonly totalLiabilitiesCents: number;
  /** Net worth in cents. */
  readonly netWorthCents: number;
}

/** Type of life event for milestones. */
export type LifeEventType =
  | 'marriage'
  | 'home-purchase'
  | 'child-born'
  | 'career-change'
  | 'retirement'
  | 'inheritance'
  | 'education'
  | 'business-start'
  | 'other';

/** A life event marker on the net worth timeline. */
export interface LifeEventMilestone {
  /** Unique identifier. */
  readonly id: string;
  /** Event type. */
  readonly type: LifeEventType;
  /** Display label. */
  readonly label: string;
  /** ISO-8601 date. */
  readonly date: string;
  /** Optional net worth at the time of the event in cents. */
  readonly netWorthAtEventCents: number | null;
}

/** Celebration milestone for net worth achievements. */
export interface NetWorthMilestone {
  /** Threshold amount in cents. */
  readonly thresholdCents: number;
  /** Display label (e.g. "First $100K!"). */
  readonly label: string;
  /** Whether this milestone has been reached. */
  readonly reached: boolean;
  /** Date reached (ISO-8601 or null). */
  readonly reachedDate: string | null;
}

/** Growth rate between two time periods. */
export interface GrowthRate {
  /** Start date (ISO-8601). */
  readonly startDate: string;
  /** End date (ISO-8601). */
  readonly endDate: string;
  /** Starting net worth in cents. */
  readonly startCents: number;
  /** Ending net worth in cents. */
  readonly endCents: number;
  /** Absolute change in cents. */
  readonly changeCents: number;
  /** Percentage change (0-based, e.g. 0.15 = 15%). */
  readonly changePercent: number;
  /** Annualized growth rate as decimal. */
  readonly annualizedRate: number;
}

/** Projection of future net worth based on trends. */
export interface NetWorthProjection {
  /** Projected data points. */
  readonly points: readonly NetWorthSnapshot[];
  /** Monthly growth rate used for projection as decimal. */
  readonly monthlyGrowthRate: number;
  /** Confidence description. */
  readonly confidence: 'high' | 'medium' | 'low';
}

// ---------------------------------------------------------------------------
// Financial Wellness Score types (#1775)
// ---------------------------------------------------------------------------

/** Individual component of the wellness score. */
export type WellnessComponent =
  | 'emergency-fund'
  | 'debt-to-income'
  | 'savings-rate'
  | 'retirement-progress'
  | 'insurance-coverage'
  | 'estate-planning';

/** Grade for an individual component or overall. */
export type WellnessGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/** Score and assessment for a single wellness component. */
export interface ComponentScore {
  /** Component identifier. */
  readonly component: WellnessComponent;
  /** Display label. */
  readonly label: string;
  /** Score from 0-100. */
  readonly score: number;
  /** Letter grade. */
  readonly grade: WellnessGrade;
  /** Weight in the composite score (0-1, all weights sum to 1). */
  readonly weight: number;
  /** Improvement suggestion. */
  readonly suggestion: string;
}

/** Input data for computing the wellness score. */
export interface WellnessInput {
  /** Monthly expenses in cents. */
  readonly monthlyExpensesCents: number;
  /** Emergency fund balance in cents. */
  readonly emergencyFundCents: number;
  /** Total monthly debt payments in cents. */
  readonly monthlyDebtPaymentsCents: number;
  /** Gross monthly income in cents. */
  readonly grossMonthlyIncomeCents: number;
  /** Monthly savings (contributions) in cents. */
  readonly monthlySavingsCents: number;
  /** Current retirement savings in cents. */
  readonly retirementSavingsCents: number;
  /** Target retirement savings in cents. */
  readonly targetRetirementCents: number;
  /** Whether the user has adequate insurance (health, life, disability). */
  readonly hasAdequateInsurance: boolean;
  /** Whether the user has a will or estate plan. */
  readonly hasEstatePlan: boolean;
}

/** Composite financial wellness score result. */
export interface WellnessScore {
  /** Overall score from 0-100. */
  readonly overallScore: number;
  /** Overall letter grade. */
  readonly overallGrade: WellnessGrade;
  /** Per-component breakdown. */
  readonly components: readonly ComponentScore[];
  /** Top improvement suggestions (ordered by impact). */
  readonly topSuggestions: readonly string[];
}
