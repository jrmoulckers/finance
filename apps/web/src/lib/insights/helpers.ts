// SPDX-License-Identifier: BUSL-1.1

import type { DigestPeriod, MetricChange, TrendDirection } from './types';
import { computeSavingsRatePercent } from '../savings/savings-rate-format';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PeriodWindow {
  readonly label: string;
  readonly startDate: string;
  readonly endDate: string;
}

export function toLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeExpense(amount: number): number {
  return Math.abs(amount);
}

export function normalizeIncome(amount: number): number {
  return Math.abs(amount);
}

export function cashFlowFromAmount(
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER',
  amount: number,
): number {
  if (type === 'INCOME') {
    return normalizeIncome(amount);
  }

  if (type === 'EXPENSE') {
    return -normalizeExpense(amount);
  }

  return 0;
}

export function compareValues(current: number, previous: number): MetricChange {
  const amount = current - previous;
  const direction: TrendDirection = amount > 0 ? 'up' : amount < 0 ? 'down' : 'flat';

  if (previous === 0) {
    return {
      amount,
      percent: current === 0 ? 0 : 100,
      direction,
    };
  }

  return {
    amount,
    percent: roundToOne((amount / Math.abs(previous)) * 100),
    direction,
  };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/**
 * Build a calendar-month window.
 *
 * @param baseDate - Any date within the target month
 * @param endDay - Optional day-of-month to end at (for a month-to-date window).
 *   When omitted, the window spans the **full** month (its last day). Only the
 *   in-progress current month should be month-to-date; completed past months
 *   must use the full month or their income/spend — and the savings rate
 *   derived from them — is understated.
 */
function makeMonthWindow(baseDate: Date, endDay?: number): PeriodWindow {
  const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const lastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
  const endDayOfMonth = endDay === undefined ? lastDay : Math.min(endDay, lastDay);
  const endDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), endDayOfMonth);

  return {
    label: startDate.toLocaleDateString('en-US', { month: 'short' }),
    startDate: toLocalDate(startDate),
    endDate: toLocalDate(endDate),
  };
}

export function buildPeriodWindows(
  period: DigestPeriod,
  now: Date,
  count: number,
): readonly PeriodWindow[] {
  if (period === 'weekly') {
    return Array.from({ length: count }, (_unused, index) => {
      const periodOffset = count - index - 1;
      const endDate = addDays(now, -periodOffset * 7);
      const startDate = addDays(endDate, -6);

      return {
        label: endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        startDate: toLocalDate(startDate),
        endDate: toLocalDate(endDate),
      };
    });
  }

  const dayOfMonth = now.getDate();
  return Array.from({ length: count }, (_unused, index) => {
    const monthOffset = count - index - 1;
    const monthDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    // Only the current month (offset 0) is month-to-date; past months are full.
    return makeMonthWindow(monthDate, monthOffset === 0 ? dayOfMonth : undefined);
  });
}

export function getMonthToDateWindows(now: Date): {
  readonly current: PeriodWindow;
  readonly previous: PeriodWindow;
} {
  return {
    current: makeMonthWindow(new Date(now.getFullYear(), now.getMonth(), 1), now.getDate()),
    previous: makeMonthWindow(new Date(now.getFullYear(), now.getMonth() - 1, 1), now.getDate()),
  };
}

export function calculateRate(income: number, spending: number): number {
  return computeSavingsRatePercent(income, spending);
}
