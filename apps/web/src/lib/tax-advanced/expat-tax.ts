// SPDX-License-Identifier: BUSL-1.1

/**
 * Expat and foreign-account tax threshold tracking.
 *
 * Implements:
 * - FBAR (FinCEN 114) threshold ($10,000 aggregate foreign account balance)
 * - FATCA (Form 8938) reporting thresholds ($50K/$100K end-of-year, $75K/$150K mid-year)
 * - Foreign account registry with currency conversion
 * - Filing deadline alerts
 * - Foreign Earned Income Exclusion ($126,500 for 2024)
 * - Foreign tax credit estimator
 * - Compliance status dashboard
 *
 * All monetary values are in integer cents. Pure functions only.
 *
 * References: issues #1714, #1776
 */

import {
  ComplianceStatus,
  ExpatFilingStatus,
  type ExpatAccount,
  type ExpatComplianceAlert,
  type ExpatComplianceDashboard,
  type FATCAThreshold,
  type FBARThreshold,
  type FEIEResult,
  type ForeignTaxCredit,
} from './types';

// ---------------------------------------------------------------------------
// Constants (2024)
// ---------------------------------------------------------------------------

/** FBAR threshold: $10,000 (cents). */
const FBAR_THRESHOLD_CENTS = 10_000_00;

/** FBAR filing deadline (April 15, auto-extended to October 15). */
const FBAR_DEADLINE_MONTH_DAY = '04-15';
const FBAR_EXTENDED_DEADLINE_MONTH_DAY = '10-15';

/** FATCA end-of-year thresholds by filing status (cents). */
const FATCA_EOY_THRESHOLDS: Readonly<Record<ExpatFilingStatus, number>> = {
  [ExpatFilingStatus.SINGLE]: 50_000_00,
  [ExpatFilingStatus.MARRIED_FILING_JOINTLY]: 100_000_00,
};

/** FATCA mid-year (any-time) thresholds by filing status (cents). */
const FATCA_MID_YEAR_THRESHOLDS: Readonly<Record<ExpatFilingStatus, number>> = {
  [ExpatFilingStatus.SINGLE]: 75_000_00,
  [ExpatFilingStatus.MARRIED_FILING_JOINTLY]: 150_000_00,
};

/** FATCA thresholds for US persons residing abroad — higher limits. */
const FATCA_EOY_ABROAD: Readonly<Record<ExpatFilingStatus, number>> = {
  [ExpatFilingStatus.SINGLE]: 200_000_00,
  [ExpatFilingStatus.MARRIED_FILING_JOINTLY]: 400_000_00,
};

const FATCA_MID_YEAR_ABROAD: Readonly<Record<ExpatFilingStatus, number>> = {
  [ExpatFilingStatus.SINGLE]: 300_000_00,
  [ExpatFilingStatus.MARRIED_FILING_JOINTLY]: 600_000_00,
};

/** Foreign Earned Income Exclusion maximum for 2024 (cents). */
const FEIE_MAX_2024 = 126_500_00;

// ---------------------------------------------------------------------------
// Banker's rounding helper
// ---------------------------------------------------------------------------

/**
 * Round a number using banker's rounding (round half to even).
 *
 * @param value - Value to round
 * @returns Rounded integer
 */
function bankersRound(value: number): number {
  const floor = Math.floor(value);
  const decimal = value - floor;

  if (decimal > 0.5) return floor + 1;
  if (decimal < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

// ---------------------------------------------------------------------------
// Currency conversion
// ---------------------------------------------------------------------------

/**
 * Convert a foreign-currency amount to USD cents.
 *
 * @param foreignCents - Amount in foreign currency minor units (cents/pence)
 * @param exchangeRate - Exchange rate (1 foreign unit = exchangeRate USD)
 * @returns Amount in USD cents
 *
 * @example
 * ```ts
 * // 1000.00 EUR at rate 1.08 = $1,080.00
 * const usd = convertToUsdCents(100_000, 1.08);
 * // usd === 108_000
 * ```
 */
export function convertToUsdCents(foreignCents: number, exchangeRate: number): number {
  if (exchangeRate <= 0) return 0;
  return bankersRound(foreignCents * exchangeRate);
}

// ---------------------------------------------------------------------------
// FBAR
// ---------------------------------------------------------------------------

/**
 * Evaluate FBAR (FinCEN 114) filing requirement.
 *
 * FBAR is required when the aggregate maximum balance of all foreign
 * financial accounts exceeds $10,000 at any point during the calendar year.
 *
 * @param accounts - Foreign accounts with max-balance tracking
 * @param taxYear - Tax year for deadline calculation
 * @returns FBAR threshold evaluation
 *
 * @example
 * ```ts
 * const fbar = evaluateFBAR(foreignAccounts, 2024);
 * if (fbar.filingRequired) console.log('FBAR filing required');
 * ```
 */
export function evaluateFBAR(accounts: readonly ExpatAccount[], taxYear: number): FBARThreshold {
  const aggregateMaxBalanceCents = accounts.reduce((sum, a) => sum + a.maxBalanceUsdCents, 0);

  const nextYear = taxYear + 1;
  const filingDeadline = `${nextYear}-${FBAR_DEADLINE_MONTH_DAY}`;
  const extendedDeadline = `${nextYear}-${FBAR_EXTENDED_DEADLINE_MONTH_DAY}`;

  return {
    aggregateMaxBalanceCents,
    thresholdCents: FBAR_THRESHOLD_CENTS,
    filingRequired: aggregateMaxBalanceCents > FBAR_THRESHOLD_CENTS,
    filingDeadline,
    extendedDeadline,
    reportableAccountCount: accounts.length,
  };
}

// ---------------------------------------------------------------------------
// FATCA
// ---------------------------------------------------------------------------

/**
 * Evaluate FATCA (Form 8938) filing requirement.
 *
 * Thresholds vary by filing status and whether the filer resides abroad.
 *
 * @param accounts - Foreign accounts
 * @param filingStatus - Single or MFJ
 * @param residesAbroad - Whether the filer lives outside the US
 * @returns FATCA threshold evaluation
 */
export function evaluateFATCA(
  accounts: readonly ExpatAccount[],
  filingStatus: ExpatFilingStatus,
  residesAbroad: boolean,
): FATCAThreshold {
  const aggregateEndOfYearCents = accounts.reduce((sum, a) => sum + a.balanceUsdCents, 0);
  const aggregateMaxCents = accounts.reduce((sum, a) => sum + a.maxBalanceUsdCents, 0);

  const eoyThresholds = residesAbroad ? FATCA_EOY_ABROAD : FATCA_EOY_THRESHOLDS;
  const midThresholds = residesAbroad ? FATCA_MID_YEAR_ABROAD : FATCA_MID_YEAR_THRESHOLDS;

  const endOfYearThresholdCents = eoyThresholds[filingStatus];
  const midYearThresholdCents = midThresholds[filingStatus];

  const exceedsEOY = aggregateEndOfYearCents > endOfYearThresholdCents;
  const exceedsMidYear = aggregateMaxCents > midYearThresholdCents;

  return {
    filingStatus,
    residesAbroad,
    endOfYearThresholdCents,
    midYearThresholdCents,
    aggregateEndOfYearCents,
    aggregateMaxCents,
    filingRequired: exceedsEOY || exceedsMidYear,
  };
}

// ---------------------------------------------------------------------------
// FEIE
// ---------------------------------------------------------------------------

/**
 * Calculate the Foreign Earned Income Exclusion for 2024.
 *
 * The FEIE allows qualifying US expats to exclude up to $126,500 of
 * foreign earned income from US taxation (2024 amount).
 *
 * @param foreignEarnedIncomeCents - Total foreign earned income (cents)
 * @param taxYear - Tax year (used for limit lookup)
 * @returns FEIE calculation result
 */
export function calculateFEIE(foreignEarnedIncomeCents: number, taxYear: number): FEIEResult {
  // Currently only 2024 limits; expand mapping as needed.
  const maxExclusionCents = taxYear === 2024 ? FEIE_MAX_2024 : FEIE_MAX_2024;

  const excludedAmountCents = Math.min(Math.max(0, foreignEarnedIncomeCents), maxExclusionCents);
  const taxableRemainderCents = Math.max(0, foreignEarnedIncomeCents - excludedAmountCents);

  return {
    foreignEarnedIncomeCents,
    maxExclusionCents,
    excludedAmountCents,
    taxableRemainderCents,
    taxYear,
  };
}

// ---------------------------------------------------------------------------
// Foreign tax credit
// ---------------------------------------------------------------------------

/**
 * Estimate the foreign tax credit.
 *
 * The credit is limited to: (foreign source income / worldwide income) × US tax.
 * If foreign taxes exceed the limit, the excess can be carried forward.
 *
 * @param foreignTaxesPaidCents - Foreign taxes paid (cents)
 * @param foreignSourceIncomeCents - Foreign source taxable income (cents)
 * @param worldwideIncomeCents - Total worldwide income (cents)
 * @param usTaxLiabilityCents - US tax liability before credit (cents)
 * @returns Foreign tax credit estimate
 */
export function estimateForeignTaxCredit(
  foreignTaxesPaidCents: number,
  foreignSourceIncomeCents: number,
  worldwideIncomeCents: number,
  usTaxLiabilityCents: number,
): ForeignTaxCredit {
  // Guard divide-by-zero
  if (worldwideIncomeCents <= 0 || usTaxLiabilityCents <= 0) {
    return {
      foreignTaxesPaidCents,
      creditLimitCents: 0,
      usableCreditCents: 0,
      excessCreditCents: Math.max(0, foreignTaxesPaidCents),
    };
  }

  const ratio = Math.min(1, foreignSourceIncomeCents / worldwideIncomeCents);
  const creditLimitCents = bankersRound(usTaxLiabilityCents * ratio);
  const usableCreditCents = Math.min(foreignTaxesPaidCents, creditLimitCents);
  const excessCreditCents = Math.max(0, foreignTaxesPaidCents - usableCreditCents);

  return {
    foreignTaxesPaidCents,
    creditLimitCents,
    usableCreditCents,
    excessCreditCents,
  };
}

// ---------------------------------------------------------------------------
// Filing deadline alerts
// ---------------------------------------------------------------------------

/**
 * Calculate days until an FBAR filing deadline.
 *
 * @param taxYear - Tax year being filed
 * @param currentDate - Current date (ISO 8601)
 * @param useExtended - Whether to use the automatic extension deadline
 * @returns Days remaining (negative if past due)
 */
export function daysUntilFBARDeadline(
  taxYear: number,
  currentDate: string,
  useExtended: boolean = false,
): number {
  const nextYear = taxYear + 1;
  const deadlineStr = useExtended
    ? `${nextYear}-${FBAR_EXTENDED_DEADLINE_MONTH_DAY}`
    : `${nextYear}-${FBAR_DEADLINE_MONTH_DAY}`;

  const now = new Date(currentDate);
  const deadline = new Date(deadlineStr);
  const msPerDay = 86_400_000;

  return Math.ceil((deadline.getTime() - now.getTime()) / msPerDay);
}

// ---------------------------------------------------------------------------
// Per-account compliance alerts
// ---------------------------------------------------------------------------

/**
 * Generate a compliance alert for a single foreign account.
 *
 * @param account - Foreign account
 * @param fbarRequired - Whether FBAR filing is required
 * @param fatcaRequired - Whether FATCA filing is required
 * @param taxYear - Current tax year
 * @returns Compliance alert
 */
export function generateAccountAlert(
  account: ExpatAccount,
  fbarRequired: boolean,
  fatcaRequired: boolean,
  taxYear: number,
): ExpatComplianceAlert {
  const nextYear = taxYear + 1;

  if (fbarRequired && fatcaRequired) {
    return {
      accountId: account.id,
      institutionName: account.institutionName,
      status: ComplianceStatus.ACTION_REQUIRED,
      message: `Account requires both FBAR and FATCA (Form 8938) reporting for ${taxYear}.`,
      requiredAction: 'File FinCEN 114 (FBAR) and attach Form 8938 to your tax return.',
      deadline: `${nextYear}-${FBAR_DEADLINE_MONTH_DAY}`,
    };
  }

  if (fbarRequired) {
    return {
      accountId: account.id,
      institutionName: account.institutionName,
      status: ComplianceStatus.ACTION_REQUIRED,
      message: `Account must be reported on FBAR (FinCEN 114) for ${taxYear}.`,
      requiredAction: 'File FinCEN 114 electronically via BSA E-Filing.',
      deadline: `${nextYear}-${FBAR_DEADLINE_MONTH_DAY}`,
    };
  }

  if (fatcaRequired) {
    return {
      accountId: account.id,
      institutionName: account.institutionName,
      status: ComplianceStatus.WARNING,
      message: `Account may require FATCA (Form 8938) reporting for ${taxYear}.`,
      requiredAction: 'Attach Form 8938 to your tax return.',
      deadline: `${nextYear}-${FBAR_DEADLINE_MONTH_DAY}`,
    };
  }

  return {
    accountId: account.id,
    institutionName: account.institutionName,
    status: ComplianceStatus.COMPLIANT,
    message: `Account is below all reporting thresholds for ${taxYear}.`,
    requiredAction: null,
    deadline: null,
  };
}

// ---------------------------------------------------------------------------
// Compliance dashboard
// ---------------------------------------------------------------------------

/**
 * Build a comprehensive expat compliance dashboard.
 *
 * Evaluates FBAR, FATCA, optional FEIE, and foreign tax credit for
 * all foreign accounts and produces per-account alerts.
 *
 * @param accounts - All foreign accounts
 * @param filingStatus - Single or MFJ
 * @param residesAbroad - Whether the filer lives outside the US
 * @param taxYear - Tax year
 * @param foreignEarnedIncomeCents - Foreign earned income (cents), or null if N/A
 * @param foreignTaxesPaidCents - Foreign taxes paid (cents), or null if N/A
 * @param worldwideIncomeCents - Total worldwide income (cents), for FTC calculation
 * @param usTaxLiabilityCents - US tax before credits (cents), for FTC calculation
 * @returns Full compliance dashboard
 *
 * @example
 * ```ts
 * const dashboard = buildComplianceDashboard(
 *   foreignAccounts,
 *   ExpatFilingStatus.SINGLE,
 *   true,
 *   2024,
 *   150_000_00,
 *   20_000_00,
 *   200_000_00,
 *   30_000_00,
 * );
 * ```
 */
export function buildComplianceDashboard(
  accounts: readonly ExpatAccount[],
  filingStatus: ExpatFilingStatus,
  residesAbroad: boolean,
  taxYear: number,
  foreignEarnedIncomeCents: number | null = null,
  foreignTaxesPaidCents: number | null = null,
  worldwideIncomeCents: number = 0,
  usTaxLiabilityCents: number = 0,
): ExpatComplianceDashboard {
  const fbar = evaluateFBAR(accounts, taxYear);
  const fatca = evaluateFATCA(accounts, filingStatus, residesAbroad);

  const feie =
    foreignEarnedIncomeCents !== null ? calculateFEIE(foreignEarnedIncomeCents, taxYear) : null;

  const foreignTaxCredit =
    foreignTaxesPaidCents !== null && worldwideIncomeCents > 0
      ? estimateForeignTaxCredit(
          foreignTaxesPaidCents,
          foreignEarnedIncomeCents ?? 0,
          worldwideIncomeCents,
          usTaxLiabilityCents,
        )
      : null;

  const alerts = accounts.map((a) =>
    generateAccountAlert(a, fbar.filingRequired, fatca.filingRequired, taxYear),
  );

  // Overall status: worst of all alerts
  let overallStatus = ComplianceStatus.COMPLIANT;
  for (const alert of alerts) {
    if (alert.status === ComplianceStatus.ACTION_REQUIRED) {
      overallStatus = ComplianceStatus.ACTION_REQUIRED;
      break;
    }
    if (alert.status === ComplianceStatus.WARNING) {
      overallStatus = ComplianceStatus.WARNING;
    }
  }

  return {
    overallStatus,
    fbar,
    fatca,
    alerts,
    feie,
    foreignTaxCredit,
  };
}
