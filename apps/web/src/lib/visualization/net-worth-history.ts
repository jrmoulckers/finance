// SPDX-License-Identifier: BUSL-1.1

/**
 * Build a monthly net-worth history series from local account + transaction
 * data, reusing the existing insights data path so the projection chart stays
 * consistent with the rest of the app.
 *
 * Net worth at the end of each historical month is reconstructed backwards from
 * the *current* net worth by removing the cash flow of transactions posted
 * after that month — the same technique used by `calculateNetWorthTrend`.
 *
 * All monetary values are integer cents.
 *
 * References: issue #2116
 */

import type { Account, Transaction } from '../../kmp/bridge';
import { computeCurrentNetWorth } from '../analytics/net-worth';
import { buildPeriodWindows, cashFlowFromAmount } from '../insights/helpers';
import type { NetWorthSeriesPoint } from './net-worth-projection';

/** Default number of trailing months reconstructed (covers up to the 1Y range). */
export const DEFAULT_HISTORY_MONTHS = 12;

/**
 * Reconstructs a trailing monthly net-worth history.
 *
 * @param accounts - All accounts (archived accounts are ignored for totals).
 * @param transactions - All transactions used to roll net worth backwards.
 * @param months - Number of trailing months to produce. Defaults to 12.
 * @param now - Reference "today". Defaults to the current date.
 * @returns Net-worth points oldest-first; empty when `months` <= 0.
 */
export function buildNetWorthHistorySeries(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  months: number = DEFAULT_HISTORY_MONTHS,
  now: Date = new Date(),
): NetWorthSeriesPoint[] {
  const monthCount = Math.max(0, Math.floor(months));
  if (monthCount === 0) return [];

  const currentNetWorthCents = computeCurrentNetWorth([...accounts]).netWorth;
  const windows = buildPeriodWindows('monthly', now, monthCount);

  return windows.map((window) => {
    const laterCashFlow = transactions.reduce((sum, transaction) => {
      if (transaction.date > window.endDate) {
        return sum + cashFlowFromAmount(transaction.type, transaction.amount.amount);
      }
      return sum;
    }, 0);

    return {
      label: window.label,
      dateIso: window.endDate,
      netWorthCents: currentNetWorthCents - laterCashFlow,
    };
  });
}
