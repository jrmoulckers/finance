// SPDX-License-Identifier: BUSL-1.1

import type { Account, Transaction } from '../../kmp/bridge';
import { buildPeriodWindows, cashFlowFromAmount, compareValues } from './helpers';
import type { DigestPeriod, NetWorthTrend, PeriodSnapshot } from './types';

const LIABILITY_TYPES = new Set(['CREDIT_CARD', 'LOAN']);

function isLiabilityType(type: Account['type']): boolean {
  return LIABILITY_TYPES.has(type);
}

function getCurrentNetWorthTotals(accounts: readonly Account[]) {
  return accounts.reduce(
    (totals, account) => {
      if (account.isArchived) {
        return totals;
      }

      const balance = account.currentBalance.amount;
      if (isLiabilityType(account.type)) {
        totals.liabilities += Math.abs(balance);
      } else {
        totals.assets += balance;
      }

      return totals;
    },
    { assets: 0, liabilities: 0 },
  );
}

function getNetWorthAtDate(
  currentNetWorth: number,
  transactions: readonly Transaction[],
  endDate: string,
): number {
  const laterCashFlow = transactions.reduce((sum, transaction) => {
    if (transaction.date > endDate) {
      return sum + cashFlowFromAmount(transaction.type, transaction.amount.amount);
    }

    return sum;
  }, 0);

  return currentNetWorth - laterCashFlow;
}

function getWindowSummary(
  netWorth: number,
  transactions: readonly Transaction[],
  startDate: string,
  endDate: string,
): PeriodSnapshot {
  let income = 0;
  let spending = 0;

  for (const transaction of transactions) {
    if (transaction.date < startDate || transaction.date > endDate) {
      continue;
    }

    if (transaction.type === 'INCOME') {
      income += Math.abs(transaction.amount.amount);
    } else if (transaction.type === 'EXPENSE') {
      spending += Math.abs(transaction.amount.amount);
    }
  }

  return {
    label: endDate,
    startDate,
    endDate,
    netWorth,
    income,
    spending,
    savingsRate: income > 0 ? Math.round((((income - spending) / income) * 1000) / 10) : 0,
  };
}

export function calculateNetWorthTrend(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  period: DigestPeriod,
  now: Date = new Date(),
): NetWorthTrend {
  const totals = getCurrentNetWorthTotals(accounts);
  const currentNetWorth = totals.assets - totals.liabilities;
  const windows = buildPeriodWindows(period, now, period === 'weekly' ? 8 : 6);

  const history = windows.map((window) => {
    const snapshotNetWorth = getNetWorthAtDate(currentNetWorth, transactions, window.endDate);
    const summary = getWindowSummary(
      snapshotNetWorth,
      transactions,
      window.startDate,
      window.endDate,
    );

    return {
      ...summary,
      label: window.label,
    };
  });

  const current = history.at(-1)?.netWorth ?? currentNetWorth;
  const previous = history.at(-2)?.netWorth ?? current;

  return {
    current,
    previous,
    assets: totals.assets,
    liabilities: totals.liabilities,
    change: compareValues(current, previous),
    history,
  };
}
