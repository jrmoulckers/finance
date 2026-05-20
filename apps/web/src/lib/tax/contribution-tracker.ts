// SPDX-License-Identifier: BUSL-1.1

/**
 * Tax-advantaged contribution tracker for IRA, 401(k), HSA, and FSA accounts.
 *
 * Tracks YTD contributions against 2024 IRS limits, calculates remaining
 * contribution room, and applies catch-up eligibility rules for age 50+.
 *
 * All monetary values are in cents (integers) to avoid floating-point errors.
 *
 * References: IRC §219 (IRA), §402(g) (401k), §223 (HSA), §125 (FSA),
 *             IRS Rev. Proc. 2023-34, issues #1653, #1720
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tax-advantaged account types. */
export enum ContributionAccountType {
  TRADITIONAL_IRA = 'TRADITIONAL_IRA',
  ROTH_IRA = 'ROTH_IRA',
  FOUR01K = '401K',
  FOUR03B = '403B',
  HSA_INDIVIDUAL = 'HSA_INDIVIDUAL',
  HSA_FAMILY = 'HSA_FAMILY',
  FSA = 'FSA',
}

/** Contribution limit configuration for an account type. */
export interface ContributionLimit {
  /** Account type. */
  readonly accountType: ContributionAccountType;
  /** Base annual contribution limit (cents). */
  readonly baseLimit: number;
  /** Catch-up contribution limit for age 50+ (cents), 0 if not applicable. */
  readonly catchUpLimit: number;
  /** Minimum age for catch-up eligibility. */
  readonly catchUpAge: number;
  /** Tax year these limits apply to. */
  readonly taxYear: number;
}

/** A recorded contribution to a tax-advantaged account. */
export interface Contribution {
  /** Account type. */
  readonly accountType: ContributionAccountType;
  /** Contribution amount (cents). */
  readonly amount: number;
  /** Date of contribution (ISO 8601). */
  readonly date: string;
  /** Optional description. */
  readonly description?: string;
}

/** Contribution status for a specific account type. */
export interface ContributionStatus {
  /** Account type. */
  readonly accountType: ContributionAccountType;
  /** Total annual limit (including catch-up if eligible, cents). */
  readonly annualLimit: number;
  /** YTD contributions (cents). */
  readonly ytdContributions: number;
  /** Remaining contribution room (cents). */
  readonly remainingRoom: number;
  /** Whether the contributor qualifies for catch-up. */
  readonly catchUpEligible: boolean;
  /** Catch-up amount included in the limit (cents). */
  readonly catchUpAmount: number;
  /** Percentage of limit used (0-100). */
  readonly percentUsed: number;
  /** Whether the limit has been exceeded. */
  readonly isOverLimit: boolean;
}

/** Summary of all tax-advantaged contributions. */
export interface ContributionSummary {
  /** Tax year. */
  readonly year: number;
  /** Status for each account type with contributions or limits. */
  readonly accounts: readonly ContributionStatus[];
  /** Total YTD contributions across all accounts (cents). */
  readonly totalContributions: number;
  /** Total remaining room across all accounts (cents). */
  readonly totalRemainingRoom: number;
}

// ---------------------------------------------------------------------------
// 2024 IRS Contribution Limits (Rev. Proc. 2023-34)
// ---------------------------------------------------------------------------

/** 2024 contribution limits by account type. */
export const CONTRIBUTION_LIMITS_2024: readonly ContributionLimit[] = [
  {
    accountType: ContributionAccountType.TRADITIONAL_IRA,
    baseLimit: 7_000_00,
    catchUpLimit: 1_000_00,
    catchUpAge: 50,
    taxYear: 2024,
  },
  {
    accountType: ContributionAccountType.ROTH_IRA,
    baseLimit: 7_000_00,
    catchUpLimit: 1_000_00,
    catchUpAge: 50,
    taxYear: 2024,
  },
  {
    accountType: ContributionAccountType.FOUR01K,
    baseLimit: 23_000_00,
    catchUpLimit: 7_500_00,
    catchUpAge: 50,
    taxYear: 2024,
  },
  {
    accountType: ContributionAccountType.FOUR03B,
    baseLimit: 23_000_00,
    catchUpLimit: 7_500_00,
    catchUpAge: 50,
    taxYear: 2024,
  },
  {
    accountType: ContributionAccountType.HSA_INDIVIDUAL,
    baseLimit: 4_150_00,
    catchUpLimit: 1_000_00,
    catchUpAge: 55,
    taxYear: 2024,
  },
  {
    accountType: ContributionAccountType.HSA_FAMILY,
    baseLimit: 8_300_00,
    catchUpLimit: 1_000_00,
    catchUpAge: 55,
    taxYear: 2024,
  },
  {
    accountType: ContributionAccountType.FSA,
    baseLimit: 3_200_00,
    catchUpLimit: 0,
    catchUpAge: 0,
    taxYear: 2024,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the contribution limit for an account type and tax year.
 *
 * @param accountType - Account type
 * @param taxYear - Tax year (default 2024)
 * @returns ContributionLimit or null if not found
 */
export function getContributionLimit(
  accountType: ContributionAccountType,
  taxYear: number = 2024,
): ContributionLimit | null {
  if (taxYear !== 2024) return null;
  return CONTRIBUTION_LIMITS_2024.find((l) => l.accountType === accountType) ?? null;
}

/**
 * Determine if a person qualifies for catch-up contributions.
 *
 * @param age - Person's age at end of tax year
 * @param accountType - Account type to check
 * @param taxYear - Tax year (default 2024)
 * @returns true if catch-up eligible
 */
export function isCatchUpEligible(
  age: number,
  accountType: ContributionAccountType,
  taxYear: number = 2024,
): boolean {
  const limit = getContributionLimit(accountType, taxYear);
  if (!limit || limit.catchUpLimit === 0) return false;
  return age >= limit.catchUpAge;
}

/**
 * Calculate the effective annual contribution limit (with catch-up if eligible).
 *
 * @param accountType - Account type
 * @param age - Person's age at end of tax year
 * @param taxYear - Tax year (default 2024)
 * @returns Effective limit in cents, or 0 if account type not found
 */
export function getEffectiveLimit(
  accountType: ContributionAccountType,
  age: number,
  taxYear: number = 2024,
): number {
  const limit = getContributionLimit(accountType, taxYear);
  if (!limit) return 0;

  const catchUp = isCatchUpEligible(age, accountType, taxYear) ? limit.catchUpLimit : 0;
  return limit.baseLimit + catchUp;
}

/**
 * Calculate YTD contributions for a given account type and year.
 *
 * @param contributions - All contributions
 * @param accountType - Account type to filter
 * @param year - Tax year
 * @returns Total YTD contributions in cents
 */
export function calculateYTDContributions(
  contributions: readonly Contribution[],
  accountType: ContributionAccountType,
  year: number,
): number {
  return contributions
    .filter((c) => c.accountType === accountType && c.date.startsWith(String(year)))
    .reduce((sum, c) => sum + c.amount, 0);
}

/**
 * Get the contribution status for a specific account type.
 *
 * @param contributions - All contributions
 * @param accountType - Account type
 * @param age - Contributor's age at end of tax year
 * @param taxYear - Tax year (default 2024)
 * @returns Contribution status with remaining room
 */
export function getContributionStatus(
  contributions: readonly Contribution[],
  accountType: ContributionAccountType,
  age: number,
  taxYear: number = 2024,
): ContributionStatus {
  const limit = getContributionLimit(accountType, taxYear);
  const catchUpEligible = isCatchUpEligible(age, accountType, taxYear);
  const catchUpAmount = catchUpEligible && limit ? limit.catchUpLimit : 0;
  const annualLimit = getEffectiveLimit(accountType, age, taxYear);
  const ytdContributions = calculateYTDContributions(contributions, accountType, taxYear);
  const remainingRoom = Math.max(0, annualLimit - ytdContributions);
  const percentUsed = annualLimit > 0 ? Math.round((ytdContributions / annualLimit) * 100) : 0;

  return {
    accountType,
    annualLimit,
    ytdContributions,
    remainingRoom,
    catchUpEligible,
    catchUpAmount,
    percentUsed,
    isOverLimit: ytdContributions > annualLimit,
  };
}

/**
 * Check combined IRA contribution limit (Traditional + Roth share a limit).
 *
 * The combined annual limit for Traditional and Roth IRA is $7,000 ($8,000
 * with catch-up) — contributions to both count against the same limit.
 *
 * @param contributions - All contributions
 * @param age - Contributor's age
 * @param taxYear - Tax year (default 2024)
 * @returns Combined IRA contribution status
 */
export function getCombinedIRAStatus(
  contributions: readonly Contribution[],
  age: number,
  taxYear: number = 2024,
): ContributionStatus {
  const limit = getContributionLimit(ContributionAccountType.TRADITIONAL_IRA, taxYear);
  const catchUpEligible = isCatchUpEligible(age, ContributionAccountType.TRADITIONAL_IRA, taxYear);
  const catchUpAmount = catchUpEligible && limit ? limit.catchUpLimit : 0;
  const annualLimit = getEffectiveLimit(ContributionAccountType.TRADITIONAL_IRA, age, taxYear);

  const traditionalYTD = calculateYTDContributions(
    contributions,
    ContributionAccountType.TRADITIONAL_IRA,
    taxYear,
  );
  const rothYTD = calculateYTDContributions(
    contributions,
    ContributionAccountType.ROTH_IRA,
    taxYear,
  );
  const ytdContributions = traditionalYTD + rothYTD;
  const remainingRoom = Math.max(0, annualLimit - ytdContributions);
  const percentUsed = annualLimit > 0 ? Math.round((ytdContributions / annualLimit) * 100) : 0;

  return {
    accountType: ContributionAccountType.TRADITIONAL_IRA,
    annualLimit,
    ytdContributions,
    remainingRoom,
    catchUpEligible,
    catchUpAmount,
    percentUsed,
    isOverLimit: ytdContributions > annualLimit,
  };
}

/**
 * Generate a complete contribution summary across all account types.
 *
 * @param contributions - All contributions
 * @param age - Contributor's age
 * @param taxYear - Tax year (default 2024)
 * @returns Summary with status for each account type
 */
export function generateContributionSummary(
  contributions: readonly Contribution[],
  age: number,
  taxYear: number = 2024,
): ContributionSummary {
  const accountTypes = [
    ContributionAccountType.TRADITIONAL_IRA,
    ContributionAccountType.ROTH_IRA,
    ContributionAccountType.FOUR01K,
    ContributionAccountType.FOUR03B,
    ContributionAccountType.HSA_INDIVIDUAL,
    ContributionAccountType.HSA_FAMILY,
    ContributionAccountType.FSA,
  ];

  const accounts = accountTypes.map((type) =>
    getContributionStatus(contributions, type, age, taxYear),
  );

  const totalContributions = accounts.reduce((sum, a) => sum + a.ytdContributions, 0);
  const totalRemainingRoom = accounts.reduce((sum, a) => sum + a.remainingRoom, 0);

  return {
    year: taxYear,
    accounts,
    totalContributions,
    totalRemainingRoom,
  };
}
