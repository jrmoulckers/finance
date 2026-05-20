// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared types for the real estate and property finance suite.
 *
 * All monetary values are in integer cents to avoid floating-point errors.
 * Interest rates use basis points (1 bp = 0.01%).
 * Dates use ISO 8601 strings (YYYY-MM-DD) for calendar dates.
 *
 * References: issues #1678, #1686, #1691, #1581
 */

// ---------------------------------------------------------------------------
// Property & home equity (#1678)
// ---------------------------------------------------------------------------

/** A real estate property with value tracking. */
export interface Property {
  /** Unique identifier. */
  readonly id: string;
  /** Human-readable name (e.g., "123 Main St"). */
  readonly name: string;
  /** Purchase price in cents. */
  readonly purchasePriceCents: number;
  /** Date of purchase (ISO 8601). */
  readonly purchaseDate: string;
  /** Current estimated market value in cents. */
  readonly currentValueCents: number;
  /** Date of the current valuation (ISO 8601). */
  readonly valuationDate: string;
}

/** Mortgage details tied to a property. */
export interface MortgageDetails {
  /** Original loan amount in cents. */
  readonly originalLoanCents: number;
  /** Current outstanding balance in cents. */
  readonly currentBalanceCents: number;
  /** Annual interest rate in basis points (e.g., 650 = 6.50%). */
  readonly annualRateBps: number;
  /** Loan term in months (e.g., 360 for 30-year). */
  readonly termMonths: number;
  /** Monthly payment amount in cents (P&I only). */
  readonly monthlyPaymentCents: number;
  /** Number of payments already made. */
  readonly paymentsMade: number;
  /** Whether PMI is currently required. */
  readonly hasPMI: boolean;
  /** Monthly PMI amount in cents (0 if not applicable). */
  readonly monthlyPMICents: number;
}

/** Result of a home equity calculation. */
export interface HomeEquity {
  /** Current property value in cents. */
  readonly propertyValueCents: number;
  /** Current mortgage balance in cents. */
  readonly mortgageBalanceCents: number;
  /** Equity = value - balance, in cents. */
  readonly equityCents: number;
  /** Loan-to-value ratio as a percentage (0–100+). */
  readonly ltvPercent: number;
  /** Equity as a percentage of property value. */
  readonly equityPercent: number;
}

/** A snapshot of equity at a point in time. */
export interface EquitySnapshot {
  /** Month number (0 = start). */
  readonly month: number;
  /** Property value at this point in cents. */
  readonly propertyValueCents: number;
  /** Mortgage balance at this point in cents. */
  readonly mortgageBalanceCents: number;
  /** Equity at this point in cents. */
  readonly equityCents: number;
}

// ---------------------------------------------------------------------------
// Mortgage amortization (#1691)
// ---------------------------------------------------------------------------

/** A single entry in an amortization schedule. */
export interface AmortizationEntry {
  /** Payment number (1-based). */
  readonly paymentNumber: number;
  /** Total payment amount in cents. */
  readonly paymentCents: number;
  /** Principal portion of the payment in cents. */
  readonly principalCents: number;
  /** Interest portion of the payment in cents. */
  readonly interestCents: number;
  /** Remaining balance after this payment in cents. */
  readonly remainingBalanceCents: number;
  /** Cumulative interest paid through this payment in cents. */
  readonly cumulativeInterestCents: number;
  /** Cumulative principal paid through this payment in cents. */
  readonly cumulativePrincipalCents: number;
}

/** Full amortization schedule result. */
export interface AmortizationSchedule {
  /** All monthly entries. */
  readonly entries: readonly AmortizationEntry[];
  /** Total interest over the life of the loan in cents. */
  readonly totalInterestCents: number;
  /** Total amount paid (principal + interest) in cents. */
  readonly totalPaidCents: number;
  /** Original loan amount in cents. */
  readonly loanAmountCents: number;
  /** Monthly payment in cents. */
  readonly monthlyPaymentCents: number;
}

/** PMI status and removal eligibility. */
export interface PMIStatus {
  /** Whether PMI is currently required. */
  readonly isRequired: boolean;
  /** Current LTV ratio as a percentage. */
  readonly currentLTV: number;
  /** LTV threshold for PMI removal (typically 80%). */
  readonly removalThresholdLTV: number;
  /** Estimated month number when PMI can be removed (null if already eligible). */
  readonly estimatedRemovalMonth: number | null;
  /** Estimated payments remaining until PMI removal (null if already eligible). */
  readonly paymentsUntilRemoval: number | null;
}

/** Result of comparing two mortgage scenarios (e.g., refinance). */
export interface RefinanceComparison {
  /** Current loan total interest in cents. */
  readonly currentTotalInterestCents: number;
  /** New loan total interest in cents. */
  readonly newTotalInterestCents: number;
  /** Interest savings in cents (positive = saves money). */
  readonly interestSavingsCents: number;
  /** Current monthly payment in cents. */
  readonly currentMonthlyPaymentCents: number;
  /** New monthly payment in cents. */
  readonly newMonthlyPaymentCents: number;
  /** Monthly savings in cents. */
  readonly monthlySavingsCents: number;
  /** Months to break even on closing costs. */
  readonly breakEvenMonths: number | null;
}

/** Extra payment impact analysis. */
export interface ExtraPaymentImpact {
  /** Original payoff month count. */
  readonly originalPayoffMonths: number;
  /** New payoff month count with extra payments. */
  readonly newPayoffMonths: number;
  /** Months saved. */
  readonly monthsSaved: number;
  /** Total interest with original schedule in cents. */
  readonly originalTotalInterestCents: number;
  /** Total interest with extra payments in cents. */
  readonly newTotalInterestCents: number;
  /** Interest saved in cents. */
  readonly interestSavedCents: number;
}

// ---------------------------------------------------------------------------
// Rental property (#1686)
// ---------------------------------------------------------------------------

/** Rental property financial details. */
export interface RentalProperty {
  /** Unique identifier. */
  readonly id: string;
  /** Property name. */
  readonly name: string;
  /** Purchase price in cents. */
  readonly purchasePriceCents: number;
  /** Down payment amount in cents. */
  readonly downPaymentCents: number;
  /** Closing costs in cents. */
  readonly closingCostsCents: number;
  /** Current market value in cents. */
  readonly currentValueCents: number;
}

/** Monthly rental income and expenses. */
export interface RentalExpenses {
  /** Monthly gross rental income in cents. */
  readonly monthlyRentCents: number;
  /** Monthly mortgage payment in cents (P&I). */
  readonly monthlyMortgageCents: number;
  /** Monthly property tax in cents. */
  readonly monthlyTaxCents: number;
  /** Monthly insurance in cents. */
  readonly monthlyInsuranceCents: number;
  /** Monthly maintenance/repairs in cents. */
  readonly monthlyMaintenanceCents: number;
  /** Monthly property management fee in cents. */
  readonly monthlyManagementCents: number;
  /** Monthly HOA or condo fees in cents. */
  readonly monthlyHOACents: number;
  /** Vacancy rate as a percentage (0–100). */
  readonly vacancyRatePercent: number;
}

/** Cash flow analysis result. */
export interface RentalCashFlow {
  /** Monthly gross income in cents. */
  readonly monthlyGrossIncomeCents: number;
  /** Effective monthly income (adjusted for vacancy) in cents. */
  readonly monthlyEffectiveIncomeCents: number;
  /** Total monthly expenses in cents. */
  readonly monthlyExpensesCents: number;
  /** Monthly net cash flow in cents. */
  readonly monthlyNetCashFlowCents: number;
  /** Annual gross income in cents. */
  readonly annualGrossIncomeCents: number;
  /** Annual effective income in cents. */
  readonly annualEffectiveIncomeCents: number;
  /** Annual total expenses in cents. */
  readonly annualExpensesCents: number;
  /** Annual net cash flow in cents. */
  readonly annualNetCashFlowCents: number;
}

/** ROI metrics for a rental property. */
export interface RentalROI {
  /** Cash-on-cash return as a percentage. */
  readonly cashOnCashPercent: number;
  /** Cap rate as a percentage. */
  readonly capRatePercent: number;
  /** Gross rent multiplier (years). */
  readonly grossRentMultiplier: number;
  /** Whether the property passes the 1% rule. */
  readonly passesOnePercentRule: boolean;
  /** The 1% rule ratio (monthly rent / purchase price × 100). */
  readonly onePercentRuleRatio: number;
  /** Total cash invested in cents (down payment + closing costs). */
  readonly totalCashInvestedCents: number;
}

/** Tax deduction categories for a rental property. */
export interface RentalTaxDeductions {
  /** Annual depreciation deduction in cents (straight-line over 27.5 years). */
  readonly annualDepreciationCents: number;
  /** Depreciable basis in cents (purchase price - land value). */
  readonly depreciableBasisCents: number;
  /** Annual mortgage interest deduction in cents. */
  readonly annualMortgageInterestCents: number;
  /** Annual property tax deduction in cents. */
  readonly annualPropertyTaxCents: number;
  /** Annual insurance deduction in cents. */
  readonly annualInsuranceCents: number;
  /** Annual maintenance deduction in cents. */
  readonly annualMaintenanceCents: number;
  /** Annual management fee deduction in cents. */
  readonly annualManagementCents: number;
  /** Annual HOA deduction in cents. */
  readonly annualHOACents: number;
  /** Total annual deductions in cents. */
  readonly totalAnnualDeductionsCents: number;
}

// ---------------------------------------------------------------------------
// Manual assets (#1581)
// ---------------------------------------------------------------------------

/** Supported manual asset categories. */
export type ManualAssetCategory =
  | 'real_estate'
  | 'vehicle'
  | 'collectible'
  | 'jewelry'
  | 'art'
  | 'precious_metal'
  | 'business_equity'
  | 'other';

/** A value entry with a timestamp. */
export interface AssetValueEntry {
  /** Value in cents. */
  readonly valueCents: number;
  /** Date of this valuation (ISO 8601). */
  readonly date: string;
  /** Optional note about the valuation source. */
  readonly note?: string;
}

/** A manually tracked asset. */
export interface ManualAsset {
  /** Unique identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Asset category. */
  readonly category: ManualAssetCategory;
  /** Purchase price in cents (if known). */
  readonly purchasePriceCents: number | null;
  /** Date acquired (ISO 8601, if known). */
  readonly acquiredDate: string | null;
  /** Value history, most recent first. */
  readonly valueHistory: readonly AssetValueEntry[];
}

/** Breakdown of portfolio by asset category. */
export interface AssetCategoryBreakdown {
  /** Asset category. */
  readonly category: ManualAssetCategory;
  /** Total value in cents for this category. */
  readonly totalValueCents: number;
  /** Number of assets in this category. */
  readonly assetCount: number;
  /** Percentage of total portfolio. */
  readonly percentOfTotal: number;
}

/** Summary of the manual asset portfolio. */
export interface ManualAssetPortfolio {
  /** Total value of all manual assets in cents. */
  readonly totalValueCents: number;
  /** Number of assets. */
  readonly assetCount: number;
  /** Breakdown by category. */
  readonly categoryBreakdown: readonly AssetCategoryBreakdown[];
}
