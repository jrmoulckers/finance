// SPDX-License-Identifier: BUSL-1.1

import type { Account, AccountType, Bill, Transaction } from '../../kmp/bridge';
import { clamp, roundToOne, toLocalDate } from '../insights/helpers';
import type { AnxietyScoreResult, StressLevel } from './types';

export interface AnxietyScoreInput {
  readonly accounts: readonly Account[];
  readonly transactions: readonly Transaction[];
  readonly bills: readonly Bill[];
  readonly now?: Date;
}

const LIQUID_ACCOUNT_TYPES = new Set<AccountType>(['CHECKING', 'SAVINGS', 'CASH']);
const LIABILITY_ACCOUNT_TYPES = new Set<AccountType>(['CREDIT_CARD', 'LOAN']);
const WINDOW_DAYS = 30;
const BILL_LOOKAHEAD_DAYS = 14;

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isDateInRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}

function buildExpenseSeries(
  transactions: readonly Transaction[],
  startDate: string,
  endDate: string,
): number[] {
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.type !== 'EXPENSE' || !isDateInRange(transaction.date, startDate, endDate)) {
      continue;
    }

    totals.set(
      transaction.date,
      (totals.get(transaction.date) ?? 0) + Math.abs(transaction.amount.amount),
    );
  }

  const series: number[] = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const limit = new Date(`${endDate}T00:00:00`);

  while (cursor <= limit) {
    const key = toLocalDate(cursor);
    series.push(totals.get(key) ?? 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  return series;
}

function calculateMean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateStandardDeviation(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const mean = calculateMean(values);
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / Math.max(values.length, 1);
  return Math.sqrt(variance);
}

function summarizeCashFlow(
  transactions: readonly Transaction[],
  startDate: string,
  endDate: string,
): { income: number; spending: number; savingsRate: number } {
  let income = 0;
  let spending = 0;

  for (const transaction of transactions) {
    if (!isDateInRange(transaction.date, startDate, endDate)) {
      continue;
    }

    if (transaction.type === 'INCOME') {
      income += Math.abs(transaction.amount.amount);
    } else if (transaction.type === 'EXPENSE') {
      spending += Math.abs(transaction.amount.amount);
    }
  }

  const savingsRate = income > 0 ? ((income - spending) / income) * 100 : spending > 0 ? -100 : 0;

  return { income, spending, savingsRate };
}

function getStressLevel(score: number): StressLevel {
  if (score >= 75) {
    return 'severe';
  }
  if (score >= 50) {
    return 'high';
  }
  if (score >= 25) {
    return 'moderate';
  }
  return 'low';
}

function buildSummary(
  score: number,
  dominantDriver: keyof AnxietyScoreResult['breakdown'],
): string {
  const driverCopy: Record<keyof AnxietyScoreResult['breakdown'], string> = {
    overdraftProximity: 'tight cash buffer',
    spendingVolatility: 'uneven day-to-day spending',
    billStress: 'upcoming bill pressure',
    debtPressure: 'debt payments consuming income',
    savingsTrajectory: 'a weakening savings trend',
  };

  const prefix =
    score >= 75
      ? 'Financial pressure looks elevated right now'
      : score >= 50
        ? 'There are a few signs of financial strain'
        : score >= 25
          ? 'Your finances look mostly steady with a mild watch-out'
          : 'Your current patterns look financially calm';

  return `${prefix}, led by ${driverCopy[dominantDriver]}.`;
}

export function calculateAnxietyScore(input: AnxietyScoreInput): AnxietyScoreResult {
  const now = input.now ?? new Date();
  const currentStart = toLocalDate(shiftDays(now, -(WINDOW_DAYS - 1)));
  const previousEnd = toLocalDate(shiftDays(now, -WINDOW_DAYS));
  const previousStart = toLocalDate(shiftDays(now, -(WINDOW_DAYS * 2 - 1)));
  const expenseSeries = buildExpenseSeries(input.transactions, currentStart, toLocalDate(now));
  const averageDailySpending = calculateMean(expenseSeries);
  const spendingStdDev = calculateStandardDeviation(expenseSeries);
  const spendingVolatilityRatio =
    averageDailySpending > 0 ? spendingStdDev / averageDailySpending : 0;

  let liquidBalance = 0;
  let overdrawnLiquidAccounts = 0;
  let minimumPaymentEstimate = 0;

  for (const account of input.accounts) {
    if (account.isArchived) {
      continue;
    }

    if (LIQUID_ACCOUNT_TYPES.has(account.type)) {
      liquidBalance += Math.max(account.currentBalance.amount, 0);
      if (account.currentBalance.amount <= 0) {
        overdrawnLiquidAccounts += 1;
      }
    }

    if (LIABILITY_ACCOUNT_TYPES.has(account.type)) {
      const balance = Math.abs(account.currentBalance.amount);
      minimumPaymentEstimate += account.type === 'CREDIT_CARD' ? balance * 0.03 : balance * 0.02;
    }
  }

  const liquidBufferDays =
    averageDailySpending > 0 ? liquidBalance / averageDailySpending : liquidBalance > 0 ? 90 : 0;
  const overdraftProximity =
    clamp(((14 - liquidBufferDays) / 14) * 16, 0, 16) + Math.min(overdrawnLiquidAccounts * 4, 4);
  const spendingVolatility = clamp((spendingVolatilityRatio / 1.5) * 20, 0, 20);

  const billLookaheadDate = toLocalDate(shiftDays(now, BILL_LOOKAHEAD_DAYS));
  const dueSoonBills = input.bills.filter(
    (bill) =>
      bill.status !== 'PAID' &&
      bill.status !== 'CANCELLED' &&
      bill.dueDate >= toLocalDate(now) &&
      bill.dueDate <= billLookaheadDate,
  );
  const overdueBills = input.bills.filter((bill) => bill.status === 'OVERDUE');
  const dueSoonTotal = dueSoonBills.reduce((sum, bill) => sum + Math.abs(bill.amount.amount), 0);
  const billCoverageRatio = dueSoonTotal > 0 ? liquidBalance / dueSoonTotal : null;
  const uncoveredBillPressure =
    dueSoonTotal > 0 ? clamp((1 - liquidBalance / Math.max(dueSoonTotal, 1)) * 14, 0, 14) : 0;
  const latePaymentRisk = Math.min(
    overdueBills.length * 3 + dueSoonBills.filter((bill) => !bill.isAutoPay).length,
    6,
  );
  const billStress = clamp(uncoveredBillPressure + latePaymentRisk, 0, 20);

  const currentCashFlow = summarizeCashFlow(input.transactions, currentStart, toLocalDate(now));
  const previousCashFlow = summarizeCashFlow(input.transactions, previousStart, previousEnd);
  const monthlyIncome = currentCashFlow.income;
  const minimumPaymentRatio =
    monthlyIncome > 0
      ? (minimumPaymentEstimate / monthlyIncome) * 100
      : minimumPaymentEstimate > 0
        ? 100
        : 0;
  const debtPressure = clamp((minimumPaymentRatio / 15) * 20, 0, 20);

  const savingsRateChange = currentCashFlow.savingsRate - previousCashFlow.savingsRate;
  const decliningTrendPenalty = clamp(
    ((previousCashFlow.savingsRate - currentCashFlow.savingsRate) / 20) * 12,
    0,
    12,
  );
  const negativeSavingsPenalty =
    currentCashFlow.savingsRate < 0
      ? clamp((Math.abs(currentCashFlow.savingsRate) / 20) * 8, 0, 8)
      : 0;
  const savingsTrajectory = clamp(decliningTrendPenalty + negativeSavingsPenalty, 0, 20);

  const breakdown = {
    overdraftProximity: roundToOne(overdraftProximity),
    spendingVolatility: roundToOne(spendingVolatility),
    billStress: roundToOne(billStress),
    debtPressure: roundToOne(debtPressure),
    savingsTrajectory: roundToOne(savingsTrajectory),
  } as const;

  const dominantDriver =
    (Object.entries(breakdown) as Array<[keyof typeof breakdown, number]>).sort(
      (left, right) => right[1] - left[1],
    )[0]?.[0] ?? 'spendingVolatility';

  const score = Math.round(
    breakdown.overdraftProximity +
      breakdown.spendingVolatility +
      breakdown.billStress +
      breakdown.debtPressure +
      breakdown.savingsTrajectory,
  );

  return {
    score,
    level: getStressLevel(score),
    summary: buildSummary(score, dominantDriver),
    breakdown,
    metrics: {
      liquidBufferDays: roundToOne(Math.min(liquidBufferDays, 90)),
      spendingVolatilityRatio: roundToOne(spendingVolatilityRatio),
      billCoverageRatio: billCoverageRatio === null ? null : roundToOne(billCoverageRatio),
      minimumPaymentRatio: roundToOne(minimumPaymentRatio),
      savingsRateChange: roundToOne(savingsRateChange),
      overdueBills: overdueBills.length,
    },
  };
}
