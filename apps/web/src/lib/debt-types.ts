// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared types for the debt management suite.
 *
 * All monetary values are in integer cents to avoid floating-point errors.
 * Interest rates use basis points (1 bp = 0.01%).
 * Dates use ISO 8601 strings (YYYY-MM-DD) for calendar dates.
 *
 * References: issues #1662, #1685, #1690, #1681, #1761, #1569
 */

// ---------------------------------------------------------------------------
// Core debt types
// ---------------------------------------------------------------------------

/** A single debt obligation (credit card, loan, BNPL, etc.). */
export interface Debt {
  /** Unique identifier. */
  readonly id: string;
  /** Human-readable name (e.g., "Chase Sapphire", "Sallie Mae Loan"). */
  readonly name: string;
  /** Current outstanding balance in cents. */
  readonly balanceCents: number;
  /** Original balance before payoff progress, when known. */
  readonly originalBalanceCents?: number;
  /** Historical interest already paid, when known or manually entered. */
  readonly interestPaidToDateCents?: number;
  /** True when the annual rate is an assumed default rather than a confirmed value. */
  readonly rateEstimated?: boolean;
  /** True when the minimum payment is an assumed default rather than a confirmed value. */
  readonly minimumEstimated?: boolean;
  /** Annual interest rate as basis points (e.g., 1999 = 19.99%). */
  readonly annualRateBps: number;
  /** Minimum monthly payment in cents. */
  readonly minimumPaymentCents: number;
  /** Type of debt for categorization. */
  readonly type: DebtType;
}

/** Supported debt categories. */
export type DebtType =
  | 'credit_card'
  | 'student_loan'
  | 'auto_loan'
  | 'mortgage'
  | 'personal_loan'
  | 'bnpl'
  | 'medical'
  | 'other';

/** Payoff strategy identifier. */
export type PayoffStrategy = 'avalanche' | 'snowball';

// ---------------------------------------------------------------------------
// Amortization types
// ---------------------------------------------------------------------------

/** A single month in the amortization schedule. */
export interface AmortizationEntry {
  /** 1-indexed month number. */
  readonly month: number;
  /** Payment applied this month in cents. */
  readonly paymentCents: number;
  /** Portion of payment going to principal in cents. */
  readonly principalCents: number;
  /** Portion of payment going to interest in cents. */
  readonly interestCents: number;
  /** Remaining balance after this payment in cents. */
  readonly remainingBalanceCents: number;
}

/** Full amortization result for a single debt. */
export interface AmortizationSchedule {
  /** Debt identifier. */
  readonly debtId: string;
  /** Debt name (for display). */
  readonly debtName: string;
  /** Monthly schedule entries. */
  readonly entries: AmortizationEntry[];
  /** Total interest paid across all months in cents. */
  readonly totalInterestCents: number;
  /** Total amount paid (principal + interest) in cents. */
  readonly totalPaidCents: number;
  /** Number of months to payoff. */
  readonly monthsToPayoff: number;
}

// ---------------------------------------------------------------------------
// Strategy comparison types
// ---------------------------------------------------------------------------

/** Summary result for a payoff strategy. */
export interface StrategyResult {
  /** Strategy used. */
  readonly strategy: PayoffStrategy;
  /** Amortization schedule per debt, in payoff order. */
  readonly schedules: AmortizationSchedule[];
  /** Order in which debts are targeted (by id). */
  readonly payoffOrder: string[];
  /** Total interest paid across all debts in cents. */
  readonly totalInterestCents: number;
  /** Total amount paid across all debts in cents. */
  readonly totalPaidCents: number;
  /** Months until all debts are paid off. */
  readonly totalMonths: number;
  /** Month-by-month combined remaining balance for chart display. */
  readonly timelineBalanceCents: number[];
  /**
   * `true` when every debt amortizes to zero within the simulation horizon.
   * `false` when at least one debt never pays off (its payment does not cover
   * its interest), in which case `totalMonths` is the capped horizon rather
   * than a real payoff date and should not be shown as a countdown.
   */
  readonly fullyPaidOff: boolean;
  /**
   * Ids of debts that still carry a balance at the end of the simulation
   * (i.e. non-amortizing debts whose payment never covers interest). Empty
   * when `fullyPaidOff` is `true`.
   */
  readonly unpaidDebtIds: readonly string[];
}

/** Side-by-side strategy comparison. */
export interface StrategyComparison {
  readonly avalanche: StrategyResult;
  readonly snowball: StrategyResult;
  /** Interest savings of avalanche over snowball in cents. */
  readonly interestSavingsCents: number;
  /** Time savings of avalanche over snowball in months. */
  readonly timeSavingsMonths: number;
}

/** Recommendation copy for the avalanche/snowball optimizer. */
export interface PayoffStrategyRecommendation {
  readonly recommendedStrategy: PayoffStrategy;
  readonly recommendationReason: string;
  readonly snowballMotivationNote: string;
  readonly interestSavingsCents: number;
  readonly monthsSaved: number;
}

/** Impact of a modeled extra-payment amount versus minimum payments only. */
export interface ExtraPaymentImpactScenario {
  readonly extraPaymentCents: number;
  readonly totalInterestCents: number;
  readonly totalPaidCents: number;
  readonly totalMonths: number;
  readonly monthsSaved: number;
  readonly interestSavedCents: number;
  readonly incrementalInterestSavedCents: number;
  readonly isDiminishingReturn: boolean;
  readonly payoffOrder: string[];
}

/** Payoff milestone reached as principal is paid down. */
export interface DebtMilestone {
  /** Milestone threshold percentage. */
  readonly thresholdPercent: 10 | 25 | 50 | 75 | 100;
  /** Whether the user has reached this threshold. */
  readonly isReached: boolean;
}

/** Aggregate milestone progress across all debts. */
export interface DebtMilestoneSummary {
  /** Total original debt used as the baseline. */
  readonly totalOriginalDebtCents: number;
  /** Current outstanding debt. */
  readonly currentDebtCents: number;
  /** Principal paid off so far. */
  readonly paidOffCents: number;
  /** Historical interest paid to date, including manual entries. */
  readonly totalInterestPaidToDateCents: number;
  /** Percent of original debt paid off, rounded to one decimal. */
  readonly percentPaidOff: number;
  /** Milestone badges. */
  readonly milestones: DebtMilestone[];
}

/** Lender-style DTI threshold status for a point in time. */
export interface DebtToIncomeThresholdStatus {
  readonly thresholdPercent: number;
  readonly isAtOrBelow: boolean;
}

/** First month when a DTI threshold is reached. */
export interface DebtToIncomeThresholdCrossing {
  readonly thresholdPercent: number;
  readonly month: number | null;
}

/** Manual income change used in DTI projections. */
export interface DebtToIncomeIncomeChange {
  readonly month: number;
  readonly monthlyIncomeCents: number;
}

/** Options for DTI trend projection. */
export interface DebtToIncomeTrendOptions {
  readonly targetRatioPercent?: number;
  readonly annualRaiseBps?: number;
  readonly incomeChanges?: readonly DebtToIncomeIncomeChange[];
  readonly paymentBasis?: 'minimum' | 'planned';
}

/** A single month in the debt-to-income payoff trend. */
export interface DebtToIncomeTrendPoint {
  /** Month number, with 0 representing today. */
  readonly month: number;
  /** Required monthly debt payments still active in this month. */
  readonly requiredDebtPaymentCents: number;
  /** Monthly income used for this projected point. */
  readonly monthlyIncomeCents: number;
  /** Debt-to-income ratio as a percent, rounded to one decimal. */
  readonly ratioPercent: number;
  /** Threshold status for common and user-selected thresholds. */
  readonly thresholdStatuses: DebtToIncomeThresholdStatus[];
}

/** Debt-to-income summary and trend. */
export interface DebtToIncomeSummary {
  /** Current debt-to-income ratio as a percent. */
  readonly currentRatioPercent: number;
  /** Final projected ratio once debts are paid off. */
  readonly projectedFinalRatioPercent: number;
  /** Whether projected required debt payments decline over time. */
  readonly isImproving: boolean;
  /** Thresholds tracked in the projection. */
  readonly thresholds: number[];
  /** First month where each threshold is reached, if any. */
  readonly thresholdCrossings: DebtToIncomeThresholdCrossing[];
  /** Whether ratios use minimum required payments or planned payments. */
  readonly paymentBasis: 'minimum' | 'planned';
  /** Month-by-month DTI trend. */
  readonly trend: DebtToIncomeTrendPoint[];
}

// ---------------------------------------------------------------------------
// BNPL types
// ---------------------------------------------------------------------------

/** A Buy Now Pay Later obligation. */
export interface BnplObligation {
  /** Unique identifier. */
  readonly id: string;
  /** Merchant/provider name. */
  readonly merchantName: string;
  /** Original purchase amount in cents. */
  readonly originalAmountCents: number;
  /** Remaining balance in cents. */
  readonly remainingBalanceCents: number;
  /** Total number of installments. */
  readonly totalInstallments: number;
  /** Number of installments already paid. */
  readonly paidInstallments: number;
  /** Amount per installment in cents. */
  readonly installmentAmountCents: number;
  /** Annual interest/fee rate in basis points (0 for interest-free). */
  readonly annualRateBps: number;
  /** Total fees charged in cents. */
  readonly totalFeesCents: number;
  /** Due dates for remaining installments (ISO date strings). */
  readonly upcomingDueDates: string[];
}

/** Summary of all BNPL obligations. */
export interface BnplSummary {
  /** Total outstanding BNPL balance in cents. */
  readonly totalOutstandingCents: number;
  /** Total original amount across all obligations in cents. */
  readonly totalOriginalCents: number;
  /** Total fees/interest across all obligations in cents. */
  readonly totalFeesCents: number;
  /** Number of active obligations. */
  readonly activeCount: number;
  /** Cost difference: total paid vs. paying upfront in cents. */
  readonly costVsUpfrontCents: number;
  /** Total monthly BNPL commitment in cents. */
  readonly monthlyCommitmentCents: number;
}

/** Alert for BNPL payment collisions or risk. */
export interface BnplAlert {
  /** Alert severity. */
  readonly level: 'info' | 'warning' | 'critical';
  /** Alert type. */
  readonly type: 'collision' | 'stacking' | 'threshold';
  /** Human-readable alert message. */
  readonly message: string;
  /** Date(s) affected (ISO strings). */
  readonly dates: string[];
  /** IDs of obligations involved. */
  readonly obligationIds: string[];
  /** Total amount due on collision dates in cents. */
  readonly totalDueCents: number;
}

/** BNPL risk score result. */
export interface BnplRiskScore {
  /** Numeric risk score 0-100 (higher = riskier). */
  readonly score: number;
  /** Risk category. */
  readonly category: 'low' | 'moderate' | 'high' | 'critical';
  /** Contributing risk factors. */
  readonly factors: string[];
}

// ---------------------------------------------------------------------------
// Student loan types
// ---------------------------------------------------------------------------

/** Income-driven repayment plan type. */
export type IdrPlanType = 'IBR' | 'PAYE' | 'REPAYE' | 'ICR';

/** Supported student loan repayment states. */
export type StudentLoanStatus = 'in_repayment' | 'in_grace' | 'deferred' | 'forbearance';

/** Student loan details. */
export interface StudentLoan {
  /** Unique identifier. */
  readonly id: string;
  /** Human-readable loan name. */
  readonly name: string;
  /** Loan servicer. */
  readonly servicer: string;
  /** Outstanding balance in cents. */
  readonly balanceCents: number;
  /** Annual interest rate in basis points. */
  readonly annualRateBps: number;
  /** Minimum monthly payment in cents. */
  readonly minimumPaymentCents: number;
  /** Current repayment status. */
  readonly status: StudentLoanStatus;
  /** Original loan amount in cents. */
  readonly originalBalanceCents: number;
  /** Whether this is a federal loan (eligible for IDR/PSLF). */
  readonly isFederal: boolean;
  /** Whether this loan qualifies for PSLF. */
  readonly isPslfEligible: boolean;
  /** Number of qualifying PSLF payments already made. */
  readonly pslfPaymentsMade: number;
}

/** Simple payoff metrics for a student-loan portfolio. */
export interface StudentLoanPayoffMetrics {
  /** Monthly payment used for the estimate. */
  readonly monthlyPaymentCents: number;
  /** Whole months remaining until payoff, if amortizing. */
  readonly monthsToPayoff: number | null;
  /** Estimated payoff date as an ISO date string. */
  readonly estimatedPayoffDate: string | null;
  /** Total remaining interest paid before payoff. */
  readonly totalInterestCents: number;
}

/** Summary stats for the student-loan dashboard. */
export interface StudentLoanDashboardSummary extends StudentLoanPayoffMetrics {
  /** Total outstanding balance across all loans. */
  readonly totalBalanceCents: number;
  /** Total original principal across all loans. */
  readonly totalOriginalBalanceCents: number;
  /** Weighted average annual interest rate in basis points. */
  readonly weightedAverageRateBps: number;
  /** Percent of original principal already paid off. */
  readonly percentPaidOff: number;
}

/** Impact of paying extra toward student loans each month. */
export interface StudentLoanWhatIfScenario {
  /** Extra monthly payment being modeled. */
  readonly extraPaymentCents: number;
  /** New total monthly payment. */
  readonly newMonthlyPaymentCents: number;
  /** Estimated interest saved versus the baseline payment. */
  readonly interestSavedCents: number;
  /** Estimated months saved versus the baseline payment. */
  readonly monthsSaved: number;
  /** Estimated payoff date with the extra payment. */
  readonly acceleratedPayoffDate: string | null;
}

/** Input parameters for IDR calculation. */
export interface IdrInput {
  /** Annual gross income in cents. */
  readonly annualIncomeCents: number;
  /** Family size (affects poverty level threshold). */
  readonly familySize: number;
  /** State of residence (for state-specific adjustments). */
  readonly state: string;
  /** Filing status for tax purposes. */
  readonly filingStatus: 'single' | 'married_filing_jointly' | 'married_filing_separately';
  /** Spouse's federal loan balance in cents (for REPAYE). */
  readonly spouseLoanBalanceCents?: number;
  /** Spouse's annual income in cents (for REPAYE/married filing jointly). */
  readonly spouseIncomeCents?: number;
}

/** Result of an IDR plan calculation. */
export interface IdrPlanResult {
  /** Plan type. */
  readonly planType: IdrPlanType | 'STANDARD';
  /** Estimated monthly payment in cents. */
  readonly monthlyPaymentCents: number;
  /** Total amount paid over repayment period in cents. */
  readonly totalPaidCents: number;
  /** Total interest paid in cents. */
  readonly totalInterestCents: number;
  /** Months until forgiveness (or full payoff for standard). */
  readonly monthsToForgiveness: number;
  /** Amount forgiven in cents. */
  readonly forgivenAmountCents: number;
  /** Whether forgiven amount is taxable. */
  readonly isForgivenessTaxable: boolean;
  /** Estimated tax liability on forgiven amount in cents (if taxable). */
  readonly estimatedTaxOnForgivenessCents: number;
}

/** PSLF tracking result. */
export interface PslfTracker {
  /** Total qualifying payments made. */
  readonly qualifyingPayments: number;
  /** Payments remaining until forgiveness (120 total required). */
  readonly paymentsRemaining: number;
  /** Estimated forgiveness date (ISO date string). */
  readonly estimatedForgivenessDate: string;
  /** Projected forgiven amount in cents. */
  readonly projectedForgivenAmountCents: number;
  /** Whether forgiveness is tax-free (PSLF = yes). */
  readonly isTaxFree: boolean;
  /** Progress percentage (0-100). */
  readonly progressPercent: number;
}

/** Comparison across all repayment plan options. */
export interface RepaymentComparison {
  /** Standard 10-year repayment result. */
  readonly standard: IdrPlanResult;
  /** IDR plan results. */
  readonly idrPlans: IdrPlanResult[];
  /** PSLF result (if eligible). */
  readonly pslf: PslfTracker | null;
  /** Cheapest overall option (plan type or 'PSLF'). */
  readonly recommendedPlan: IdrPlanType | 'STANDARD' | 'PSLF';
  /** Savings of recommended plan vs. standard in cents. */
  readonly savingsVsStandardCents: number;
}

/** Scenario editor comparison types for student-loan planning. */
export type StudentLoanScenarioType = 'idr' | 'pslf' | 'refinance' | 'salary_raise';

/** Editable scenario inputs for student loan comparisons. */
export interface StudentLoanScenarioConfig {
  readonly id: string;
  readonly label: string;
  readonly type: StudentLoanScenarioType;
  readonly idrPlan?: IdrPlanType;
  readonly idrInput?: IdrInput;
  readonly pslfQualifyingPayments?: number;
  readonly refinanceAnnualRateBps?: number;
  readonly refinanceTermMonths?: number;
  readonly salaryRaiseAnnualCents?: number;
}

/** Normalized scenario comparison output for the UI. */
export interface StudentLoanScenarioResult {
  readonly id: string;
  readonly label: string;
  readonly type: StudentLoanScenarioType;
  readonly monthlyPaymentCents: number;
  readonly totalPaidCents: number;
  readonly totalInterestCents: number;
  readonly monthsToPayoff: number | null;
  readonly estimatedEndDate: string | null;
  readonly forgivenAmountCents: number;
  readonly estimatedTaxCents: number;
  readonly note: string;
}

// ---------------------------------------------------------------------------
// Credit card reservation types
// ---------------------------------------------------------------------------

/** Credit card with balance and payment tracking. */
export interface CreditCard {
  /** Unique identifier. */
  readonly id: string;
  /** Card name. */
  readonly name: string;
  /** Current balance in cents (positive = amount owed). */
  readonly balanceCents: number;
  /** Credit limit in cents. */
  readonly creditLimitCents?: number;
  /** Minimum payment due in cents. */
  readonly minimumPaymentCents: number;
  /** Payment due date (ISO date string). */
  readonly dueDate: string;
  /** Annual interest rate in basis points. */
  readonly annualRateBps: number;
  /** Statement closing date (ISO date string). */
  readonly statementDate: string;
}

export type CreditUtilizationStatus = 'unknown_limit' | 'low' | 'warning' | 'high' | 'critical';

/** Configurable credit-utilization thresholds. */
export interface CreditUtilizationThresholds {
  readonly warningPercent: number;
  readonly highPercent: number;
  readonly criticalPercent: number;
}

/** Per-card utilization result. */
export interface CardUtilization {
  readonly cardId: string;
  readonly cardName: string;
  readonly balanceCents: number;
  readonly creditLimitCents: number | null;
  readonly utilizationPercent: number | null;
  readonly status: CreditUtilizationStatus;
  readonly statementDate: string;
  readonly message: string;
}

/** Aggregate credit-utilization summary. */
export interface CreditUtilizationSummary {
  readonly cards: CardUtilization[];
  readonly aggregateBalanceCents: number;
  readonly aggregateCreditLimitCents: number;
  readonly aggregateUtilizationPercent: number | null;
  readonly aggregateStatus: CreditUtilizationStatus;
  readonly unknownLimitCount: number;
  readonly thresholds: CreditUtilizationThresholds;
}

/** Payment reservation for a credit card. */
export interface PaymentReservation {
  /** Credit card ID. */
  readonly cardId: string;
  /** Card name (for display). */
  readonly cardName: string;
  /** Reserved amount in cents. */
  readonly reservedAmountCents: number;
  /** Due date for this payment (ISO date string). */
  readonly dueDate: string;
  /** Whether this is auto-calculated or manually set. */
  readonly isAutoCalculated: boolean;
}

/** Summary of account balance after reservations. */
export interface ReservationSummary {
  /** Checking account balance in cents. */
  readonly checkingBalanceCents: number;
  /** Total reserved for credit card payments in cents. */
  readonly totalReservedCents: number;
  /** Available balance after reservations in cents. */
  readonly availableAfterReservationsCents: number;
  /** Individual reservations. */
  readonly reservations: PaymentReservation[];
  /** Payment due date alerts. */
  readonly alerts: PaymentAlert[];
}

/** Payment reminder alert. */
export interface PaymentAlert {
  /** Alert type. */
  readonly type: 'due_soon' | 'due_today' | 'overdue';
  /** Card name. */
  readonly cardName: string;
  /** Card ID. */
  readonly cardId: string;
  /** Due date (ISO date string). */
  readonly dueDate: string;
  /** Amount due in cents. */
  readonly amountDueCents: number;
  /** Days until due (negative = overdue). */
  readonly daysUntilDue: number;
  /** Human-readable message. */
  readonly message: string;
}
