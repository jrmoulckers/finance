// SPDX-License-Identifier: BUSL-1.1

import type { Account, AccountType, Bill, Transaction } from '../../kmp/bridge';
import { clamp, roundToOne, toLocalDate } from '../insights/helpers';
import type { StressIndicator, StressIndicatorSummary, StressLevel } from './types';

export interface StressIndicatorsInput {
  readonly accounts: readonly Account[];
  readonly transactions: readonly Transaction[];
  readonly bills: readonly Bill[];
  readonly now?: Date;
}

const LIQUID_ACCOUNT_TYPES = new Set<AccountType>(['CHECKING', 'SAVINGS', 'CASH']);
const LIABILITY_ACCOUNT_TYPES = new Set<AccountType>(['CREDIT_CARD', 'LOAN']);

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isDateInRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}

function getStressLevel(signal: number): StressLevel {
  if (signal >= 75) {
    return 'severe';
  }
  if (signal >= 55) {
    return 'high';
  }
  if (signal >= 30) {
    return 'moderate';
  }
  return 'low';
}

function buildRollingCashFlow(
  transactions: readonly Transaction[],
  endDate: Date,
  days: number,
): { income: number; spending: number; savingsRate: number } {
  const startDate = toLocalDate(shiftDays(endDate, -(days - 1)));
  const finalDate = toLocalDate(endDate);
  let income = 0;
  let spending = 0;

  for (const transaction of transactions) {
    if (!isDateInRange(transaction.date, startDate, finalDate)) {
      continue;
    }

    if (transaction.type === 'INCOME') {
      income += Math.abs(transaction.amount.amount);
    } else if (transaction.type === 'EXPENSE') {
      spending += Math.abs(transaction.amount.amount);
    }
  }

  return {
    income,
    spending,
    savingsRate: income > 0 ? ((income - spending) / income) * 100 : spending > 0 ? -100 : 0,
  };
}

function calculateIncomeVariation(transactions: readonly Transaction[], now: Date): number {
  const windows = Array.from(
    { length: 6 },
    (_, index) => buildRollingCashFlow(transactions, shiftDays(now, -(index * 30)), 30).income,
  );
  const nonZero = windows.filter((value) => value > 0);
  if (nonZero.length < 3) {
    return 0;
  }

  const mean = nonZero.reduce((sum, value) => sum + value, 0) / nonZero.length;
  const variance =
    nonZero.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / nonZero.length;
  return mean > 0 ? Math.sqrt(variance) / mean : 0;
}

function calculateDebtPressureSignal(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  now: Date,
): number {
  const liabilityAccounts = new Set(
    accounts
      .filter((account) => !account.isArchived && LIABILITY_ACCOUNT_TYPES.has(account.type))
      .map((account) => account.id),
  );
  if (liabilityAccounts.size === 0) {
    return 0;
  }

  const currentStart = toLocalDate(shiftDays(now, -29));
  const previousStart = toLocalDate(shiftDays(now, -59));
  const previousEnd = toLocalDate(shiftDays(now, -30));

  const currentDebtActivity = transactions.reduce((sum, transaction) => {
    if (
      !liabilityAccounts.has(transaction.accountId) ||
      !isDateInRange(transaction.date, currentStart, toLocalDate(now))
    ) {
      return sum;
    }

    if (transaction.type === 'EXPENSE') {
      return sum + Math.abs(transaction.amount.amount);
    }

    return sum - Math.abs(transaction.amount.amount);
  }, 0);

  const previousDebtActivity = transactions.reduce((sum, transaction) => {
    if (
      !liabilityAccounts.has(transaction.accountId) ||
      !isDateInRange(transaction.date, previousStart, previousEnd)
    ) {
      return sum;
    }

    if (transaction.type === 'EXPENSE') {
      return sum + Math.abs(transaction.amount.amount);
    }

    return sum - Math.abs(transaction.amount.amount);
  }, 0);

  const totalDebt = accounts.reduce((sum, account) => {
    if (account.isArchived || !LIABILITY_ACCOUNT_TYPES.has(account.type)) {
      return sum;
    }

    return sum + Math.abs(account.currentBalance.amount);
  }, 0);
  const monthlyIncome = buildRollingCashFlow(transactions, now, 30).income;
  const debtToIncomeRatio =
    monthlyIncome > 0 ? totalDebt / (monthlyIncome * 6) : totalDebt > 0 ? 1 : 0;
  const activityIncrease =
    previousDebtActivity > 0
      ? (currentDebtActivity - previousDebtActivity) / previousDebtActivity
      : currentDebtActivity > 0
        ? 1
        : 0;

  return clamp(Math.max(debtToIncomeRatio, activityIncrease) * 100, 0, 100);
}

function calculateLiquidBalance(accounts: readonly Account[]): number {
  return accounts.reduce((sum, account) => {
    if (account.isArchived || !LIQUID_ACCOUNT_TYPES.has(account.type)) {
      return sum;
    }

    return sum + Math.max(account.currentBalance.amount, 0);
  }, 0);
}

export function identifyStressIndicators(input: StressIndicatorsInput): StressIndicatorSummary {
  const now = input.now ?? new Date();
  const indicators: StressIndicator[] = [];
  const currentFlow = buildRollingCashFlow(input.transactions, now, 30);
  const previousFlow = buildRollingCashFlow(input.transactions, shiftDays(now, -30), 30);
  const savingsDecline = previousFlow.savingsRate - currentFlow.savingsRate;

  if (currentFlow.savingsRate < 10 || savingsDecline > 7) {
    const signal = clamp(
      Math.max(savingsDecline * 3, currentFlow.savingsRate < 0 ? 80 : 35),
      0,
      100,
    );
    indicators.push({
      kind: 'declining-savings',
      level: getStressLevel(signal),
      signal,
      title: 'Savings momentum is slipping',
      description: `Your recent savings rate moved ${roundToOne(savingsDecline)} points lower than the previous 30-day window.`,
      recommendation:
        'Trim one flexible spending category or automate a smaller transfer until the trend steadies.',
    });
  }

  const debtPressureSignal = calculateDebtPressureSignal(input.accounts, input.transactions, now);
  if (debtPressureSignal >= 30) {
    indicators.push({
      kind: 'debt-pressure',
      level: getStressLevel(debtPressureSignal),
      signal: roundToOne(debtPressureSignal),
      title: 'Debt pressure is climbing',
      description:
        'Liability balances or recent debt activity are taking a bigger share of your available cash flow.',
      recommendation:
        'Prioritize minimum payments, then redirect any extra cash toward the highest-cost balance.',
    });
  }

  const incomeVariation = calculateIncomeVariation(input.transactions, now);
  if (incomeVariation >= 0.25) {
    const signal = clamp(incomeVariation * 100, 0, 100);
    indicators.push({
      kind: 'irregular-income',
      level: getStressLevel(signal),
      signal: roundToOne(signal),
      title: 'Income has become more irregular',
      description: `Your rolling 30-day income varies by about ${Math.round(incomeVariation * 100)}% from month to month.`,
      recommendation:
        'Base fixed spending on a conservative income floor and keep a larger cash buffer for variable months.',
    });
  }

  const liquidBalance = calculateLiquidBalance(input.accounts);
  const billLookaheadDate = toLocalDate(shiftDays(now, 14));
  const upcomingBills = input.bills.filter(
    (bill) =>
      bill.status !== 'PAID' &&
      bill.status !== 'CANCELLED' &&
      bill.dueDate >= toLocalDate(now) &&
      bill.dueDate <= billLookaheadDate,
  );
  const overdueBills = input.bills.filter((bill) => bill.status === 'OVERDUE');
  const nearTermBills = upcomingBills.reduce((sum, bill) => sum + Math.abs(bill.amount.amount), 0);
  const billCoverage = nearTermBills > 0 ? liquidBalance / nearTermBills : Number.POSITIVE_INFINITY;

  if (overdueBills.length > 0 || billCoverage < 1) {
    const signal = clamp(
      Math.max((1 - Math.min(billCoverage, 1)) * 100, overdueBills.length * 30),
      0,
      100,
    );
    indicators.push({
      kind: 'bill-crunch',
      level: getStressLevel(signal),
      signal: roundToOne(signal),
      title: 'Bill timing is feeling tight',
      description: overdueBills.length
        ? `${overdueBills.length} bill${overdueBills.length === 1 ? '' : 's are'} already overdue, and upcoming due dates may keep the pressure elevated.`
        : 'Upcoming bills in the next two weeks are close to or above your available liquid balance.',
      recommendation:
        'Review due dates, enable autopay where it is safe, or spread large bills across upcoming pay cycles if possible.',
    });
  }

  const highestLevel =
    indicators
      .map((indicator) => indicator.level)
      .sort(
        (left, right) =>
          ['low', 'moderate', 'high', 'severe'].indexOf(right) -
          ['low', 'moderate', 'high', 'severe'].indexOf(left),
      )[0] ?? 'low';

  return {
    highestLevel,
    summary:
      indicators.length === 0
        ? 'Cash flow, bills, and savings look steady right now, so no major financial stress alerts are firing.'
        : `Detected ${indicators.length} stress signal${indicators.length === 1 ? '' : 's'} to keep an eye on over the next few weeks.`,
    indicators: indicators.sort((left, right) => right.signal - left.signal),
  };
}
