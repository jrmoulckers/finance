// SPDX-License-Identifier: BUSL-1.1

/**
 * Advanced tax tracking types.
 *
 * Covers HSA/FSA tracking, tax-location optimization, and expat/foreign
 * account compliance. All monetary values are in integer cents.
 *
 * References: issues #1657, #1660, #1707, #1714, #1776
 */

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

/**
 * Coverage type for HSA contribution limits.
 */
export enum HSACoverageType {
  INDIVIDUAL = 'INDIVIDUAL',
  FAMILY = 'FAMILY',
}

/**
 * Filing status for expat thresholds.
 */
export enum ExpatFilingStatus {
  SINGLE = 'SINGLE',
  MARRIED_FILING_JOINTLY = 'MARRIED_FILING_JOINTLY',
}

/**
 * Account tax treatment for asset-location optimization.
 */
export enum AccountTaxType {
  /** Traditional IRA, 401(k) — tax-deferred. */
  TAX_DEFERRED = 'TAX_DEFERRED',
  /** Roth IRA, Roth 401(k) — tax-free growth. */
  TAX_FREE = 'TAX_FREE',
  /** Brokerage account — taxable. */
  TAXABLE = 'TAXABLE',
}

/**
 * Broad asset class for tax-location placement.
 */
export enum AssetClass {
  US_STOCKS = 'US_STOCKS',
  INTERNATIONAL_STOCKS = 'INTERNATIONAL_STOCKS',
  BONDS = 'BONDS',
  REITS = 'REITS',
  HIGH_YIELD_BONDS = 'HIGH_YIELD_BONDS',
  TIPS = 'TIPS',
  MUNICIPAL_BONDS = 'MUNICIPAL_BONDS',
  COMMODITIES = 'COMMODITIES',
}

/**
 * Tax efficiency classification for an asset class.
 */
export enum TaxEfficiency {
  /** Low turnover, qualified dividends — stocks, index funds. */
  HIGH = 'HIGH',
  /** Moderate distributions. */
  MODERATE = 'MODERATE',
  /** Interest income, high turnover — bonds, REITs. */
  LOW = 'LOW',
}

/**
 * IRS Publication 502 qualified expense categories.
 */
export enum QualifiedExpenseCategory {
  MEDICAL_SERVICES = 'MEDICAL_SERVICES',
  DENTAL = 'DENTAL',
  VISION = 'VISION',
  PRESCRIPTIONS = 'PRESCRIPTIONS',
  MENTAL_HEALTH = 'MENTAL_HEALTH',
  PHYSICAL_THERAPY = 'PHYSICAL_THERAPY',
  MEDICAL_EQUIPMENT = 'MEDICAL_EQUIPMENT',
  HOSPITAL = 'HOSPITAL',
  LABORATORY = 'LABORATORY',
  PREVENTIVE_CARE = 'PREVENTIVE_CARE',
  OTHER_QUALIFIED = 'OTHER_QUALIFIED',
}

/**
 * Compliance status for expat account thresholds.
 */
export enum ComplianceStatus {
  COMPLIANT = 'COMPLIANT',
  WARNING = 'WARNING',
  ACTION_REQUIRED = 'ACTION_REQUIRED',
}

// ---------------------------------------------------------------------------
// HSA / FSA types (#1657)
// ---------------------------------------------------------------------------

/**
 * HSA account with contribution tracking.
 */
export interface HSAAccount {
  /** Unique identifier. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Coverage type determining contribution limits. */
  readonly coverageType: HSACoverageType;
  /** Current account balance (cents). */
  readonly balanceCents: number;
  /** Year-to-date contributions (cents). */
  readonly ytdContributionsCents: number;
  /** Year-to-date employer contributions (cents). */
  readonly employerContributionsCents: number;
  /** Account holder age (for catch-up eligibility at 55+). */
  readonly holderAge: number;
  /** Tax year. */
  readonly taxYear: number;
}

/**
 * FSA account with annual tracking.
 */
export interface FSAAccount {
  /** Unique identifier. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Annual election amount (cents). */
  readonly electionCents: number;
  /** Year-to-date contributions (cents). */
  readonly ytdContributionsCents: number;
  /** Year-to-date reimbursements (cents). */
  readonly ytdReimbursementsCents: number;
  /** Whether employer offers rollover (up to $640). */
  readonly rolloverEnabled: boolean;
  /** Prior-year rollover amount (cents). */
  readonly rolloverAmountCents: number;
  /** Plan year end date (ISO 8601). */
  readonly planYearEnd: string;
  /** Grace period end date, if applicable (ISO 8601). */
  readonly gracePeriodEnd: string | null;
  /** Tax year. */
  readonly taxYear: number;
}

/**
 * A qualified medical expense for HSA/FSA reimbursement.
 */
export interface QualifiedExpense {
  /** Unique identifier. */
  readonly id: string;
  /** Expense category per IRS Pub 502. */
  readonly category: QualifiedExpenseCategory;
  /** Description of the expense. */
  readonly description: string;
  /** Amount (cents). */
  readonly amountCents: number;
  /** Date incurred (ISO 8601). */
  readonly dateIncurred: string;
  /** Whether already reimbursed. */
  readonly reimbursed: boolean;
  /** Associated account ID (HSA or FSA). */
  readonly accountId: string;
  /** Whether receipt has been attached / verified. */
  readonly receiptVerified: boolean;
}

/**
 * HSA contribution limit details for a given year.
 */
export interface HSAContributionLimits {
  /** Base limit (cents). */
  readonly baseLimitCents: number;
  /** Catch-up contribution (cents), $0 if under 55. */
  readonly catchUpCents: number;
  /** Total limit including catch-up (cents). */
  readonly totalLimitCents: number;
  /** Employer contributions (cents). */
  readonly employerContributionsCents: number;
  /** Remaining personal contribution room (cents). */
  readonly remainingCents: number;
}

/**
 * HSA triple tax advantage breakdown.
 */
export interface HSATripleTaxAdvantage {
  /** Tax savings from deductible contributions (cents). */
  readonly contributionTaxSavingsCents: number;
  /** Estimated growth that is tax-free (cents). */
  readonly taxFreeGrowthCents: number;
  /** Tax-free withdrawal value for qualified expenses (cents). */
  readonly taxFreeWithdrawalCents: number;
  /** Total estimated tax advantage (cents). */
  readonly totalAdvantageCents: number;
}

/**
 * FSA deadline alert.
 */
export interface FSADeadlineAlert {
  /** Account ID. */
  readonly accountId: string;
  /** Days until plan year end. */
  readonly daysUntilPlanYearEnd: number;
  /** Days until grace period end (null if no grace period). */
  readonly daysUntilGracePeriodEnd: number | null;
  /** Unused funds at risk of forfeiture (cents). */
  readonly atRiskCents: number;
  /** Whether the deadline is urgent (<=30 days). */
  readonly isUrgent: boolean;
}

// ---------------------------------------------------------------------------
// Tax-location & asset-placement types (#1660, #1707)
// ---------------------------------------------------------------------------

/**
 * An investment holding in a specific account.
 */
export interface AssetHolding {
  /** Asset identifier / ticker. */
  readonly assetId: string;
  /** Display name. */
  readonly name: string;
  /** Asset class. */
  readonly assetClass: AssetClass;
  /** Current market value (cents). */
  readonly valueCents: number;
  /** Annual yield / distribution rate as decimal (0.03 = 3%). */
  readonly annualYield: number;
  /** Cost basis (cents). */
  readonly costBasisCents: number;
  /** Account ID where held. */
  readonly accountId: string;
  /** Tax type of the containing account. */
  readonly accountTaxType: AccountTaxType;
}

/**
 * A tax-advantaged or taxable account for placement analysis.
 */
export interface TaxLocation {
  /** Account identifier. */
  readonly accountId: string;
  /** Display name. */
  readonly name: string;
  /** Account tax treatment. */
  readonly taxType: AccountTaxType;
  /** Total account value (cents). */
  readonly totalValueCents: number;
  /** Available capacity for new placements (cents). */
  readonly availableCapacityCents: number;
}

/**
 * Placement recommendation for a single asset.
 */
export interface AssetPlacement {
  /** Asset identifier. */
  readonly assetId: string;
  /** Asset display name. */
  readonly name: string;
  /** Asset class. */
  readonly assetClass: AssetClass;
  /** Tax efficiency of this asset class. */
  readonly taxEfficiency: TaxEfficiency;
  /** Current account ID. */
  readonly currentAccountId: string;
  /** Current account tax type. */
  readonly currentAccountTaxType: AccountTaxType;
  /** Recommended account tax type. */
  readonly recommendedAccountTaxType: AccountTaxType;
  /** Whether asset is optimally placed. */
  readonly isOptimal: boolean;
  /** Estimated annual tax savings from optimal placement (cents). */
  readonly estimatedAnnualSavingsCents: number;
  /** Explanation of the recommendation. */
  readonly reason: string;
}

/**
 * Tax-equivalent yield comparison.
 */
export interface TaxEquivalentYield {
  /** Nominal yield as decimal (0.03 = 3%). */
  readonly nominalYield: number;
  /** Tax-equivalent yield as decimal. */
  readonly taxEquivalentYield: number;
  /** Marginal tax rate used (decimal). */
  readonly marginalRate: number;
  /** Whether the tax-exempt yield is better after adjustment. */
  readonly isTaxExemptBetter: boolean;
}

/**
 * Summary of tax-location optimization.
 */
export interface TaxLocationSummary {
  /** All placement recommendations. */
  readonly placements: readonly AssetPlacement[];
  /** Number of optimally placed assets. */
  readonly optimalCount: number;
  /** Number of sub-optimally placed assets. */
  readonly suboptimalCount: number;
  /** Total estimated annual tax savings (cents). */
  readonly totalAnnualSavingsCents: number;
}

// ---------------------------------------------------------------------------
// Expat / foreign account types (#1714, #1776)
// ---------------------------------------------------------------------------

/**
 * A foreign financial account for FBAR / FATCA tracking.
 */
export interface ExpatAccount {
  /** Unique identifier. */
  readonly id: string;
  /** Financial institution name. */
  readonly institutionName: string;
  /** Country of the account. */
  readonly country: string;
  /** ISO 4217 currency code (e.g. "EUR", "GBP"). */
  readonly currencyCode: string;
  /** Current balance in foreign currency minor units (cents/pence). */
  readonly balanceForeignCents: number;
  /** Current balance converted to USD (cents). */
  readonly balanceUsdCents: number;
  /** Maximum balance during the year in USD (cents). */
  readonly maxBalanceUsdCents: number;
  /** Account type description. */
  readonly accountType: string;
  /** Whether the account is jointly held. */
  readonly isJoint: boolean;
}

/**
 * FBAR (FinCEN 114) threshold tracking.
 */
export interface FBARThreshold {
  /** Aggregate of all foreign account max balances (cents). */
  readonly aggregateMaxBalanceCents: number;
  /** Threshold amount (cents) — $10,000. */
  readonly thresholdCents: number;
  /** Whether filing is required. */
  readonly filingRequired: boolean;
  /** Filing deadline (ISO 8601). */
  readonly filingDeadline: string;
  /** Extended deadline (ISO 8601). */
  readonly extendedDeadline: string;
  /** Number of reportable accounts. */
  readonly reportableAccountCount: number;
}

/**
 * FATCA (Form 8938) reporting thresholds.
 */
export interface FATCAThreshold {
  /** Filing status. */
  readonly filingStatus: ExpatFilingStatus;
  /** Whether filer resides abroad. */
  readonly residesAbroad: boolean;
  /** End-of-year threshold (cents). */
  readonly endOfYearThresholdCents: number;
  /** Mid-year (any time) threshold (cents). */
  readonly midYearThresholdCents: number;
  /** Aggregate end-of-year balance (cents). */
  readonly aggregateEndOfYearCents: number;
  /** Maximum aggregate balance at any point (cents). */
  readonly aggregateMaxCents: number;
  /** Whether Form 8938 filing is required. */
  readonly filingRequired: boolean;
}

/**
 * Foreign Earned Income Exclusion (FEIE) calculation.
 */
export interface FEIEResult {
  /** Total foreign earned income (cents). */
  readonly foreignEarnedIncomeCents: number;
  /** Maximum exclusion amount for the tax year (cents). */
  readonly maxExclusionCents: number;
  /** Excluded amount (cents). */
  readonly excludedAmountCents: number;
  /** Remaining taxable foreign income (cents). */
  readonly taxableRemainderCents: number;
  /** Tax year. */
  readonly taxYear: number;
}

/**
 * Foreign tax credit estimation.
 */
export interface ForeignTaxCredit {
  /** Total foreign taxes paid (cents). */
  readonly foreignTaxesPaidCents: number;
  /** Estimated credit limit (cents). */
  readonly creditLimitCents: number;
  /** Usable credit (cents). */
  readonly usableCreditCents: number;
  /** Excess credit carried forward (cents). */
  readonly excessCreditCents: number;
}

/**
 * Compliance status dashboard for a single account.
 */
export interface ExpatComplianceAlert {
  /** Account ID. */
  readonly accountId: string;
  /** Institution name. */
  readonly institutionName: string;
  /** Compliance status. */
  readonly status: ComplianceStatus;
  /** Alert message. */
  readonly message: string;
  /** Required action, if any. */
  readonly requiredAction: string | null;
  /** Deadline (ISO 8601), if applicable. */
  readonly deadline: string | null;
}

/**
 * Full expat compliance dashboard.
 */
export interface ExpatComplianceDashboard {
  /** Overall compliance status. */
  readonly overallStatus: ComplianceStatus;
  /** FBAR threshold details. */
  readonly fbar: FBARThreshold;
  /** FATCA threshold details. */
  readonly fatca: FATCAThreshold;
  /** Per-account alerts. */
  readonly alerts: readonly ExpatComplianceAlert[];
  /** FEIE result, if applicable. */
  readonly feie: FEIEResult | null;
  /** Foreign tax credit estimate. */
  readonly foreignTaxCredit: ForeignTaxCredit | null;
}
