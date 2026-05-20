// SPDX-License-Identifier: BUSL-1.1

/**
 * Net worth analytics calculation utilities.
 *
 * Pure functions for computing net worth over time from account balances,
 * detecting milestones, and categorizing by asset class.
 * All monetary values are in cents (integers).
 *
 * References: issue #1578
 */

import type { Account, AccountType } from '../../kmp/bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single point in the net worth timeline. All amounts in cents. */
export interface NetWorthDataPoint {
  /** ISO date or month label. */
  label: string;
  /** Total assets in cents. */
  assets: number;
  /** Total liabilities in cents (positive number). */
  liabilities: number;
  /** Net worth (assets - liabilities) in cents. */
  netWorth: number;
}

/** Breakdown of net worth by asset class. */
export interface AssetClassBreakdown {
  /** Human-readable asset class name. */
  className: string;
  /** Account type(s) in this class. */
  accountTypes: AccountType[];
  /** Total balance in cents. */
  balance: number;
  /** Percentage of total assets or liabilities. */
  percent: number;
  /** Number of accounts in this class. */
  accountCount: number;
}

/** A net worth milestone marker. */
export interface NetWorthMilestone {
  /** Unique identifier. */
  id: string;
  /** Human-readable label (e.g. "First $10K"). */
  label: string;
  /** Threshold amount in cents. */
  thresholdCents: number;
  /** Whether this milestone has been reached. */
  reached: boolean;
  /** Date when first reached, if applicable. */
  reachedDate?: string;
}

/** Period-over-period comparison. */
export interface PeriodComparison {
  /** Label for the current period. */
  currentLabel: string;
  /** Label for the previous period. */
  previousLabel: string;
  /** Net worth at current period in cents. */
  currentNetWorth: number;
  /** Net worth at previous period in cents. */
  previousNetWorth: number;
  /** Absolute change in cents. */
  changeCents: number;
  /** Percentage change (may be Infinity if previous was 0). */
  changePercent: number;
}

// ---------------------------------------------------------------------------
// Asset class mapping
// ---------------------------------------------------------------------------

/** Maps account types to user-facing asset class names. */
const ASSET_CLASS_MAP: Record<string, { className: string; isLiability: boolean }> = {
  CHECKING: { className: 'Checking', isLiability: false },
  SAVINGS: { className: 'Savings', isLiability: false },
  INVESTMENT: { className: 'Investments', isLiability: false },
  CASH: { className: 'Cash', isLiability: false },
  CREDIT_CARD: { className: 'Credit Cards', isLiability: true },
  LOAN: { className: 'Loans', isLiability: true },
  OTHER: { className: 'Other', isLiability: false },
};

/**
 * Returns whether an account type represents a liability.
 *
 * @param type - The account type to check
 * @returns true if the type is a liability
 */
export function isLiabilityType(type: AccountType): boolean {
  return ASSET_CLASS_MAP[type]?.isLiability ?? false;
}

// ---------------------------------------------------------------------------
// Core calculations
// ---------------------------------------------------------------------------

/**
 * Computes the current net worth snapshot from accounts.
 *
 * @param accounts - All non-archived, non-deleted accounts
 * @returns Net worth data point for the current moment
 */
export function computeCurrentNetWorth(accounts: Account[]): NetWorthDataPoint {
  let assets = 0;
  let liabilities = 0;

  for (const acct of accounts) {
    if (acct.isArchived) continue;
    const balance = acct.currentBalance.amount;
    if (isLiabilityType(acct.type)) {
      liabilities += Math.abs(balance);
    } else {
      assets += balance;
    }
  }

  return {
    label: new Date().toISOString().slice(0, 10),
    assets,
    liabilities,
    netWorth: assets - liabilities,
  };
}

/**
 * Groups accounts by asset class and computes breakdown.
 *
 * @param accounts - All non-archived, non-deleted accounts
 * @returns Array of AssetClassBreakdown sorted by balance descending
 */
export function computeAssetClassBreakdown(accounts: Account[]): AssetClassBreakdown[] {
  const classMap = new Map<string, { types: Set<AccountType>; balance: number; count: number }>();

  for (const acct of accounts) {
    if (acct.isArchived) continue;
    const info = ASSET_CLASS_MAP[acct.type] ?? { className: 'Other', isLiability: false };
    const existing = classMap.get(info.className) ?? {
      types: new Set<AccountType>(),
      balance: 0,
      count: 0,
    };
    existing.types.add(acct.type);
    existing.balance += Math.abs(acct.currentBalance.amount);
    existing.count += 1;
    classMap.set(info.className, existing);
  }

  const totalBalance = Array.from(classMap.values()).reduce((sum, c) => sum + c.balance, 0);

  const result: AssetClassBreakdown[] = [];
  for (const [className, data] of classMap.entries()) {
    result.push({
      className,
      accountTypes: Array.from(data.types),
      balance: data.balance,
      percent: totalBalance > 0 ? Math.round((data.balance / totalBalance) * 100) : 0,
      accountCount: data.count,
    });
  }

  return result.sort((a, b) => b.balance - a.balance);
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

/** Default milestone thresholds in cents. */
const DEFAULT_MILESTONES: Array<{ label: string; thresholdCents: number }> = [
  { label: 'First $1K', thresholdCents: 100_000 },
  { label: 'First $5K', thresholdCents: 500_000 },
  { label: 'First $10K', thresholdCents: 1_000_000 },
  { label: 'First $25K', thresholdCents: 2_500_000 },
  { label: 'First $50K', thresholdCents: 5_000_000 },
  { label: 'First $100K', thresholdCents: 10_000_000 },
  { label: 'Debt-free', thresholdCents: 0 },
];

/**
 * Detects which milestones have been reached.
 *
 * @param currentNetWorth - Current net worth in cents
 * @param totalLiabilities - Total liabilities in cents
 * @returns Array of milestones with reached status
 */
export function detectMilestones(
  currentNetWorth: number,
  totalLiabilities: number,
): NetWorthMilestone[] {
  return DEFAULT_MILESTONES.map((m, idx) => {
    let reached: boolean;
    if (m.label === 'Debt-free') {
      reached = totalLiabilities === 0;
    } else {
      reached = currentNetWorth >= m.thresholdCents;
    }

    return {
      id: `milestone-${idx}`,
      label: m.label,
      thresholdCents: m.thresholdCents,
      reached,
    };
  });
}

/**
 * Computes a period-over-period net worth comparison.
 *
 * @param currentNetWorth - Net worth at the current period in cents
 * @param previousNetWorth - Net worth at the previous period in cents
 * @param currentLabel - Display label for the current period
 * @param previousLabel - Display label for the previous period
 * @returns PeriodComparison object
 */
export function computePeriodComparison(
  currentNetWorth: number,
  previousNetWorth: number,
  currentLabel: string,
  previousLabel: string,
): PeriodComparison {
  const changeCents = currentNetWorth - previousNetWorth;
  const changePercent =
    previousNetWorth !== 0 ? Math.round((changeCents / Math.abs(previousNetWorth)) * 100) : 0;

  return {
    currentLabel,
    previousLabel,
    currentNetWorth,
    previousNetWorth,
    changeCents,
    changePercent,
  };
}
