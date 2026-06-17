// SPDX-License-Identifier: BUSL-1.1

import type { AnomalyDetectionInput, SpendingAnomaly } from './types';

function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function detectSpendingAnomalies({
  categoriesById,
  transactions,
  today = formatLocalDate(new Date()),
  lookbackDays = 45,
}: AnomalyDetectionInput): SpendingAnomaly[] {
  const todayTotals = new Map<string, { spendCents: number; transactionCount: number }>();
  const historyTotals = new Map<string, Map<string, number>>();
  const lookbackStart = formatLocalDate(addDays(parseLocalDate(today), -(lookbackDays - 1)));

  for (const transaction of transactions) {
    if (transaction.type !== 'EXPENSE' || transaction.categoryId === null) {
      continue;
    }

    const amountCents = Math.abs(transaction.amount.amount);
    if (transaction.date === today) {
      const existing = todayTotals.get(transaction.categoryId) ?? {
        spendCents: 0,
        transactionCount: 0,
      };
      todayTotals.set(transaction.categoryId, {
        spendCents: existing.spendCents + amountCents,
        transactionCount: existing.transactionCount + 1,
      });
      continue;
    }

    if (transaction.date < lookbackStart || transaction.date > today) {
      continue;
    }

    const byDay = historyTotals.get(transaction.categoryId) ?? new Map<string, number>();
    byDay.set(transaction.date, (byDay.get(transaction.date) ?? 0) + amountCents);
    historyTotals.set(transaction.categoryId, byDay);
  }

  return Array.from(todayTotals.entries())
    .flatMap(([categoryId, summary]) => {
      const priorDailyTotals = Array.from(historyTotals.get(categoryId)?.values() ?? []);
      if (priorDailyTotals.length < 3) {
        return [];
      }

      const baselineDailySpendCents = Math.round(
        priorDailyTotals.reduce((sum, amount) => sum + amount, 0) / priorDailyTotals.length,
      );

      if (baselineDailySpendCents <= 0 || summary.spendCents <= baselineDailySpendCents * 2) {
        return [];
      }

      return [
        {
          id: `anomaly:${categoryId}:${today}`,
          categoryId,
          categoryName: categoriesById.get(categoryId) ?? 'Uncategorized',
          date: today,
          todaySpendCents: summary.spendCents,
          baselineDailySpendCents,
          ratio: Number((summary.spendCents / baselineDailySpendCents).toFixed(2)),
          transactionCount: summary.transactionCount,
        } satisfies SpendingAnomaly,
      ];
    })
    .sort((left, right) => right.ratio - left.ratio);
}
