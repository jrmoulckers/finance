// SPDX-License-Identifier: BUSL-1.1

/**
 * Types for life event financial planning engines.
 *
 * All monetary values are in integer cents to avoid floating-point errors.
 * Interest / growth rates use basis points (100 bp = 1%) for precision.
 * Dates use ISO-8601 strings (YYYY-MM-DD).
 *
 * References: #1652, #1738, #1763, #1767, #1769, #1771
 */

// ---------------------------------------------------------------------------
// Home Purchase (#1652, #1771)
// ---------------------------------------------------------------------------

/** Input parameters for a home purchase readiness analysis. */
export interface HomePurchaseParams {
  /** Target home price in cents. */
  readonly homePriceCents: number;
  /** Current savings earmarked for the purchase, in cents. */
  readonly currentSavingsCents: number;
  /** Monthly amount the user can save, in cents. */
  readonly monthlySavingsCents: number;
  /** Target date for purchase (ISO-8601). */
  readonly targetDate: string;
  /** Annual mortgage interest rate in basis points (e.g. 700 = 7.00%). */
  readonly mortgageRateBps: number;
  /** Loan term in years (e.g. 30). */
  readonly loanTermYears: number;
  /** Annual property tax rate in basis points of home price (e.g. 120 = 1.20%). */
  readonly propertyTaxRateBps: number;
  /** Annual homeowner's insurance in cents. */
  readonly annualInsuranceCents: number;
  /** Annual gross income in cents (for DTI calculation). */
  readonly annualIncomeCents: number;
  /** Total existing monthly debt payments in cents (for DTI calculation). */
  readonly existingMonthlyDebtCents: number;
  /** Down payment percentage target in basis points (e.g. 2000 = 20.00%). */
  readonly downPaymentBps: number;
  /**
   * Closing cost rate in basis points of home price.
   * Typical range: 200–500 (2%–5%). Defaults to 300 (3%) if omitted.
   */
  readonly closingCostBps?: number;
}

/** Result of a home purchase readiness analysis. */
export interface HomePurchaseResult {
  /** Required down payment in cents. */
  readonly downPaymentCents: number;
  /** Estimated closing costs in cents. */
  readonly closingCostsCents: number;
  /** Total cash needed at closing in cents (down payment + closing costs). */
  readonly totalCashNeededCents: number;
  /** Savings gap (total needed minus current savings), 0 if fully funded. */
  readonly savingsGapCents: number;
  /** Whether PMI is required (down payment < 20%). */
  readonly pmiRequired: boolean;
  /** Estimated monthly PMI cost in cents (0 if not required). */
  readonly monthlyPmiCents: number;
  /** Estimated monthly mortgage payment (principal + interest) in cents. */
  readonly monthlyMortgageCents: number;
  /** Monthly PITI (principal, interest, taxes, insurance) in cents. */
  readonly monthlyPitiCents: number;
  /** Total monthly housing cost (PITI + PMI) in cents. */
  readonly totalMonthlyHousingCents: number;
  /** Front-end DTI ratio in basis points (housing / income). */
  readonly frontEndDtiBps: number;
  /** Back-end DTI ratio in basis points ((housing + debt) / income). */
  readonly backEndDtiBps: number;
  /** Months until savings target is reached (null if already met). */
  readonly monthsToTarget: number | null;
  /** Required monthly savings to hit target date, in cents (null if already met). */
  readonly requiredMonthlySavingsCents: number | null;
  /** Whether the user is on track to meet the target date. */
  readonly onTrack: boolean;
}

// ---------------------------------------------------------------------------
// Education / 529 Planner (#1738, #1763)
// ---------------------------------------------------------------------------

/** Input parameters for education funding projection. */
export interface EducationFundParams {
  /** Current age of the beneficiary in years. */
  readonly beneficiaryAge: number;
  /** Age when education begins (e.g. 18 for college). */
  readonly educationStartAge: number;
  /** Number of years of education to fund (e.g. 4). */
  readonly educationYears: number;
  /** Current annual tuition cost in cents. */
  readonly currentAnnualTuitionCents: number;
  /** Annual tuition inflation rate in basis points (e.g. 500 = 5.00%). */
  readonly tuitionInflationBps: number;
  /** Current 529 balance in cents. */
  readonly currentBalanceCents: number;
  /** Monthly contribution in cents. */
  readonly monthlyContributionCents: number;
  /** Expected annual investment return in basis points (e.g. 700 = 7.00%). */
  readonly annualReturnBps: number;
  /** State tax rate in basis points for tax benefit calculation (e.g. 500 = 5.00%). */
  readonly stateTaxRateBps: number;
}

/** Result of a 529 / education funding projection. */
export interface EducationFundResult {
  /** Total projected cost of education in future cents. */
  readonly totalProjectedCostCents: number;
  /** Projected 529 balance at education start, in cents. */
  readonly projectedBalanceCents: number;
  /** Funding gap (cost - projected balance), 0 if fully funded. */
  readonly fundingGapCents: number;
  /** Funding coverage ratio in basis points (balance / cost × 10000). */
  readonly coverageRatioBps: number;
  /** Monthly contribution needed to fully fund, in cents. */
  readonly requiredMonthlyContributionCents: number;
  /** Year-by-year projection points. */
  readonly projectionPoints: readonly EducationProjectionPoint[];
  /** Annual state tax benefit from contributions, in cents. */
  readonly annualTaxBenefitCents: number;
  /** Suggested allocation based on years to education start. */
  readonly suggestedAllocation: AllocationSuggestion;
}

/** A year-by-year data point for education fund projection. */
export interface EducationProjectionPoint {
  /** Year offset from today (0 = current year). */
  readonly yearOffset: number;
  /** Projected balance at end of year, in cents. */
  readonly balanceCents: number;
  /** Total contributions made through this year, in cents. */
  readonly totalContributionsCents: number;
  /** Investment earnings through this year, in cents. */
  readonly earningsCents: number;
}

/** Age-based allocation suggestion for 529 plans. */
export interface AllocationSuggestion {
  /** Percentage in equities (0-100). */
  readonly equityPercent: number;
  /** Percentage in bonds (0-100). */
  readonly bondPercent: number;
  /** Percentage in cash/money-market (0-100). */
  readonly cashPercent: number;
  /** Description of the allocation strategy. */
  readonly description: string;
}

// ---------------------------------------------------------------------------
// HSA Planner (#1738)
// ---------------------------------------------------------------------------

/** HSA coverage type for contribution limit determination. */
export type HsaCoverageType = 'individual' | 'family';

/** Input parameters for HSA planning. */
export interface HsaPlanParams {
  /** Coverage type (individual or family). */
  readonly coverageType: HsaCoverageType;
  /** Current HSA balance in cents. */
  readonly currentBalanceCents: number;
  /** Annual contribution in cents. */
  readonly annualContributionCents: number;
  /** Current age in years. */
  readonly currentAge: number;
  /** Expected annual investment return in basis points (e.g. 600 = 6.00%). */
  readonly annualReturnBps: number;
  /** Marginal federal tax rate in basis points (e.g. 2200 = 22.00%). */
  readonly federalTaxRateBps: number;
  /** Marginal state tax rate in basis points (e.g. 500 = 5.00%). */
  readonly stateTaxRateBps: number;
  /** FICA tax rate in basis points (e.g. 765 = 7.65%). */
  readonly ficaTaxRateBps: number;
  /** Annual medical expenses expected in cents. */
  readonly annualMedicalExpensesCents: number;
  /** Whether to invest contributions (vs. keeping as cash). */
  readonly investContributions: boolean;
}

/** Result of an HSA plan projection. */
export interface HsaPlanResult {
  /** 2024 contribution limit in cents. */
  readonly contributionLimitCents: number;
  /** Catch-up contribution amount in cents (0 if under 55). */
  readonly catchUpAmountCents: number;
  /** Maximum possible annual contribution in cents (limit + catch-up). */
  readonly maxContributionCents: number;
  /** Whether current contribution exceeds the limit. */
  readonly exceedsLimit: boolean;
  /** Annual triple tax savings in cents (federal + state + FICA). */
  readonly annualTaxSavingsCents: number;
  /** Breakdown: federal tax savings in cents. */
  readonly federalTaxSavingsCents: number;
  /** Breakdown: state tax savings in cents. */
  readonly stateTaxSavingsCents: number;
  /** Breakdown: FICA tax savings in cents. */
  readonly ficaTaxSavingsCents: number;
  /** Projected balance at age 65, in cents. */
  readonly projectedBalanceAt65Cents: number;
  /** Years until Medicare eligibility (age 65). */
  readonly yearsToMedicare: number;
  /** Year-by-year projection. */
  readonly projectionPoints: readonly HsaProjectionPoint[];
}

/** Year-by-year HSA projection data point. */
export interface HsaProjectionPoint {
  /** Age at this point. */
  readonly age: number;
  /** Projected balance in cents. */
  readonly balanceCents: number;
  /** Cumulative contributions in cents. */
  readonly cumulativeContributionsCents: number;
  /** Cumulative investment earnings in cents. */
  readonly cumulativeEarningsCents: number;
  /** Cumulative tax savings in cents. */
  readonly cumulativeTaxSavingsCents: number;
}

// ---------------------------------------------------------------------------
// Job Loss Runway (#1767)
// ---------------------------------------------------------------------------

/** Input parameters for job loss financial runway calculation. */
export interface JobLossRunwayParams {
  /** Total liquid savings in cents (checking + savings + accessible investments). */
  readonly liquidSavingsCents: number;
  /** Monthly essential expenses in cents (rent, utilities, food, insurance). */
  readonly monthlyEssentialExpensesCents: number;
  /** Monthly non-essential expenses in cents (subscriptions, dining out, etc.). */
  readonly monthlyNonEssentialExpensesCents: number;
  /** Monthly severance payment in cents (0 if none). */
  readonly severanceMonthlyPayCents: number;
  /** Number of months severance will last. */
  readonly severanceMonths: number;
  /** Monthly COBRA health insurance cost in cents (0 if not applicable). */
  readonly cobraMonthlyPremiumCents: number;
  /** Previous monthly health insurance premium in cents (for comparison). */
  readonly previousHealthPremiumCents: number;
  /** Estimated monthly unemployment benefit in cents (0 if not eligible). */
  readonly unemploymentBenefitCents: number;
  /** Maximum months of unemployment benefits. */
  readonly unemploymentMaxMonths: number;
  /** Other monthly income in cents (side gig, spouse, etc.). */
  readonly otherMonthlyIncomeCents: number;
}

/** Result of a job loss runway analysis. */
export interface JobLossRunwayResult {
  /** Monthly burn rate at essential-only spending, in cents. */
  readonly essentialBurnRateCents: number;
  /** Monthly burn rate at full spending, in cents. */
  readonly fullBurnRateCents: number;
  /** Net monthly burn (expenses - income sources), essential only, in cents. */
  readonly netEssentialBurnCents: number;
  /** Net monthly burn (expenses - income sources), full spending, in cents. */
  readonly netFullBurnCents: number;
  /** Months of runway at essential-only spending. */
  readonly essentialRunwayMonths: number;
  /** Months of runway at full spending. */
  readonly fullRunwayMonths: number;
  /** COBRA cost increase vs. previous coverage, in cents per month. */
  readonly cobraCostIncreaseCents: number;
  /** Total income from all sources over the runway period, in cents. */
  readonly totalIncomeOverRunwayCents: number;
  /** Month-by-month runway projection. */
  readonly monthlyProjection: readonly RunwayProjectionPoint[];
  /** Recommended actions based on runway length. */
  readonly recommendations: readonly RunwayRecommendation[];
}

/** Month-by-month runway projection data point. */
export interface RunwayProjectionPoint {
  /** Month index (0 = month of job loss). */
  readonly month: number;
  /** Remaining savings at end of month, in cents. */
  readonly remainingSavingsCents: number;
  /** Income for this month in cents (severance + unemployment + other). */
  readonly incomeCents: number;
  /** Expenses for this month in cents. */
  readonly expensesCents: number;
  /** Whether severance is still active. */
  readonly severanceActive: boolean;
  /** Whether unemployment benefits are still active. */
  readonly unemploymentActive: boolean;
}

/** A recommendation based on runway analysis. */
export interface RunwayRecommendation {
  /** Priority level. */
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
  /** Short action label. */
  readonly label: string;
  /** Detailed description. */
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Life Event Framework (#1769)
// ---------------------------------------------------------------------------

/** Supported life event types. */
export type LifeEventType =
  | 'home-purchase'
  | 'education'
  | 'job-loss'
  | 'wedding'
  | 'baby'
  | 'retirement'
  | 'relocation'
  | 'custom';

/** A generic life event with financial implications. */
export interface LifeEvent {
  /** Unique identifier. */
  readonly id: string;
  /** User-given name for this event. */
  readonly name: string;
  /** Event type. */
  readonly type: LifeEventType;
  /** Target date (ISO-8601). */
  readonly targetDate: string;
  /** Estimated total cost in cents. */
  readonly estimatedCostCents: number;
  /** Current savings toward this event in cents. */
  readonly currentSavingsCents: number;
  /** Monthly savings allocated to this event in cents. */
  readonly monthlySavingsCents: number;
  /** Priority ranking (1 = highest). */
  readonly priority: number;
  /** Optional notes / description. */
  readonly notes: string;
  /** ISO-8601 creation date. */
  readonly createdAt: string;
}

/** A milestone checkpoint within a life event plan. */
export interface LifeEventMilestone {
  /** Milestone label. */
  readonly label: string;
  /** Target amount in cents. */
  readonly targetCents: number;
  /** Whether this milestone is reached. */
  readonly reached: boolean;
  /** Projected date to reach this milestone (ISO-8601 or null). */
  readonly projectedDate: string | null;
}

/** Result of analyzing a single life event. */
export interface LifeEventAnalysis {
  /** The event being analyzed. */
  readonly event: LifeEvent;
  /** Savings gap in cents (0 if fully funded). */
  readonly savingsGapCents: number;
  /** Progress as basis points (0–10000). */
  readonly progressBps: number;
  /** Months until target date (negative if past). */
  readonly monthsToTarget: number;
  /** Required monthly savings to meet target date, in cents. */
  readonly requiredMonthlySavingsCents: number;
  /** Whether current pace meets the target date. */
  readonly onTrack: boolean;
  /** Milestones with projected dates. */
  readonly milestones: readonly LifeEventMilestone[];
}

/** Result of analyzing multiple concurrent life events. */
export interface MultiEventAnalysis {
  /** Individual event analyses sorted by priority. */
  readonly events: readonly LifeEventAnalysis[];
  /** Total monthly savings needed across all events, in cents. */
  readonly totalMonthlySavingsNeededCents: number;
  /** Total monthly savings currently allocated, in cents. */
  readonly totalMonthlyAllocatedCents: number;
  /** Monthly shortfall (needed - allocated), 0 if sufficient. */
  readonly monthlyShortfallCents: number;
  /** Events that cannot be met at current savings rate. */
  readonly atRiskEvents: readonly LifeEvent[];
}
