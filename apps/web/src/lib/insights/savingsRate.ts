// SPDX-License-Identifier: BUSL-1.1

import type { Transaction } from '../../kmp/bridge';
import {
  buildPeriodWindows,
  calculateRate,
  compareValues,
  normalizeExpense,
  normalizeIncome,
} from './helpers';
import type { DigestPeriod, SavingsRateAnalysis } from './types';

export function analyzeSavingsRate(
  transactions: readonly Transaction[],
  period: DigestPeriod,
  now: Date = new Date(),
): SavingsRateAnalysis {
  const windows = buildPeriodWindows(period, now, period === 'weekly' ? 8 : 6);

  const history = windows.map((window) => {
    let income = 0;
    let spending = 0;

    for (const transaction of transactions) {
      if (transaction.date < window.startDate || transaction.date > window.endDate) {
        continue;
      }

      if (transaction.type === 'INCOME') {
        income += normalizeIncome(transaction.amount.amount);
      } else if (transaction.type === 'EXPENSE') {
        spending += normalizeExpense(transaction.amount.amount);
      }
    }

    const savings = income - spending;
    return {
      label: window.label,
      income,
      spending,
      savings,
      rate: calculateRate(income, spending),
    };
  });

  const currentPeriod = history.at(-1) ?? {
    label: period,
    income: 0,
    spending: 0,
    savings: 0,
    rate: 0,
  };
  const previousPeriod = history.at(-2) ?? currentPeriod;

  return {
    currentRate: currentPeriod.rate,
    previousRate: previousPeriod.rate,
    rateChangePoints: Math.round((currentPeriod.rate - previousPeriod.rate) * 10) / 10,
    change: compareValues(currentPeriod.rate, previousPeriod.rate),
    currentIncome: currentPeriod.income,
    currentSpending: currentPeriod.spending,
    currentSavings: currentPeriod.savings,
    history,
  };
}
