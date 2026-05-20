// SPDX-License-Identifier: BUSL-1.1

/**
 * Dividend, interest, and passive income tracker.
 *
 * Provides dividend income calendar, interest income tracking, rental income
 * aggregation, royalty tracking, total passive income by source, yield
 * calculation, and annual projections.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issue #1717
 */

import { bankersRound, safeDivide } from './crypto-portfolio';
import type {
  IncomeCalendarEntry,
  PassiveIncomeByType,
  PassiveIncomeRecord,
  PassiveIncomeStream,
  PassiveIncomeSummary,
  PassiveIncomeType,
  PaymentFrequency,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Payments per year for each frequency. */
function paymentsPerYear(frequency: PaymentFrequency): number {
  switch (frequency) {
    case 'MONTHLY':
      return 12;
    case 'QUARTERLY':
      return 4;
    case 'SEMI_ANNUAL':
      return 2;
    case 'ANNUAL':
      return 1;
    case 'IRREGULAR':
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Income calendar
// ---------------------------------------------------------------------------

/**
 * Build a monthly income calendar from recorded payments.
 *
 * Groups passive income records by month/year and returns entries
 * suitable for calendar rendering.
 *
 * @param records - All passive income records.
 * @returns Monthly calendar entries sorted chronologically.
 */
export function buildIncomeCalendar(
  records: readonly PassiveIncomeRecord[],
): readonly IncomeCalendarEntry[] {
  if (records.length === 0) return [];

  const monthMap = new Map<string, { totalCents: number; records: PassiveIncomeRecord[] }>();

  for (const r of records) {
    const date = new Date(r.date + 'T00:00:00Z');
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const existing = monthMap.get(key);
    if (existing) {
      existing.totalCents += r.amountCents;
      existing.records.push(r);
    } else {
      monthMap.set(key, { totalCents: r.amountCents, records: [r] });
    }
  }

  const entries: IncomeCalendarEntry[] = [];
  for (const [key, data] of monthMap) {
    const [year, month] = key.split('-').map(Number);
    entries.push({
      month,
      year,
      totalCents: data.totalCents,
      records: data.records,
    });
  }

  return entries.sort((a, b) => a.year - b.year || a.month - b.month);
}

// ---------------------------------------------------------------------------
// Income by type
// ---------------------------------------------------------------------------

/**
 * Aggregate passive income records by income type.
 *
 * @param records - All passive income records.
 * @returns Breakdown by passive income type with totals and percentages.
 */
export function aggregateByType(
  records: readonly PassiveIncomeRecord[],
): readonly PassiveIncomeByType[] {
  if (records.length === 0) return [];

  const typeMap = new Map<PassiveIncomeType, { totalCents: number; count: number }>();

  for (const r of records) {
    const existing = typeMap.get(r.type);
    if (existing) {
      existing.totalCents += r.amountCents;
      existing.count += 1;
    } else {
      typeMap.set(r.type, { totalCents: r.amountCents, count: 1 });
    }
  }

  const total = records.reduce((sum, r) => sum + r.amountCents, 0);

  const result: PassiveIncomeByType[] = [];
  for (const [type, data] of typeMap) {
    result.push({
      type,
      totalCents: data.totalCents,
      count: data.count,
      percent: Math.round(safeDivide(data.totalCents, total) * 10000) / 100,
    });
  }

  return result.sort((a, b) => b.totalCents - a.totalCents);
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

/**
 * Compute annual projected income from recurring streams.
 *
 * @param streams - All passive income streams.
 * @returns Total projected annual income in cents.
 */
export function projectAnnualIncome(streams: readonly PassiveIncomeStream[]): number {
  let total = 0;
  for (const stream of streams) {
    const ppy = paymentsPerYear(stream.frequency);
    if (ppy > 0) {
      total += bankersRound(stream.amountPerPaymentCents * ppy);
    }
  }
  return total;
}

/**
 * Compute monthly projected income from recurring streams.
 *
 * @param streams - All passive income streams.
 * @returns Projected monthly income in cents.
 */
export function projectMonthlyIncome(streams: readonly PassiveIncomeStream[]): number {
  return bankersRound(safeDivide(projectAnnualIncome(streams), 12));
}

// ---------------------------------------------------------------------------
// Yield calculation
// ---------------------------------------------------------------------------

/**
 * Compute weighted average yield across all income streams.
 *
 * Weights each stream by its principal amount. Streams without a principal
 * or yield are excluded.
 *
 * @param streams - All passive income streams.
 * @returns Weighted yield percentage (e.g. 4.5 for 4.5%), or 0 if no data.
 */
export function computeWeightedYield(streams: readonly PassiveIncomeStream[]): number {
  const eligible = streams.filter(
    (s) =>
      s.yieldPercent !== undefined &&
      s.yieldPercent > 0 &&
      s.principalCents !== undefined &&
      s.principalCents > 0,
  );

  if (eligible.length === 0) return 0;

  let weightedSum = 0;
  let totalPrincipal = 0;

  for (const s of eligible) {
    weightedSum += s.yieldPercent! * s.principalCents!;
    totalPrincipal += s.principalCents!;
  }

  return Math.round(safeDivide(weightedSum, totalPrincipal) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Year-to-date
// ---------------------------------------------------------------------------

/**
 * Filter records to the current year-to-date.
 *
 * @param records - All passive income records.
 * @param year - The year to filter for.
 * @returns Records from the specified year.
 */
export function filterYTD(
  records: readonly PassiveIncomeRecord[],
  year: number,
): readonly PassiveIncomeRecord[] {
  return records.filter((r) => {
    const d = new Date(r.date + 'T00:00:00Z');
    return d.getUTCFullYear() === year;
  });
}

/**
 * Compute total income for a set of records.
 *
 * @param records - Passive income records.
 * @returns Total income in cents.
 */
export function totalIncome(records: readonly PassiveIncomeRecord[]): number {
  return records.reduce((sum, r) => sum + r.amountCents, 0);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Compute a comprehensive passive income summary.
 *
 * @param records - All historical passive income records.
 * @param streams - All recurring passive income streams.
 * @param currentYear - The year for YTD calculation.
 * @returns Full passive income summary.
 */
export function computePassiveIncomeSummary(
  records: readonly PassiveIncomeRecord[],
  streams: readonly PassiveIncomeStream[],
  currentYear: number,
): PassiveIncomeSummary {
  const ytdRecords = filterYTD(records, currentYear);
  const totalYtd = totalIncome(ytdRecords);
  const annualProjection = projectAnnualIncome(streams);
  const monthlyProjection = projectMonthlyIncome(streams);
  const weightedYield = computeWeightedYield(streams);
  const byType = aggregateByType(records);

  // Total annual: sum of all records across all years
  const totalAnnual = totalIncome(records);

  return {
    totalAnnualIncomeCents: totalAnnual,
    totalYtdIncomeCents: totalYtd,
    byType,
    monthlyProjectionCents: monthlyProjection,
    annualProjectionCents: annualProjection,
    weightedYieldPercent: weightedYield,
  };
}
