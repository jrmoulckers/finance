// SPDX-License-Identifier: BUSL-1.1

/**
 * Dividend calendar and forward income estimation engine.
 *
 * Builds a calendar of dividend events from holdings, estimates forward
 * annual dividend income, detects payment frequency, and tracks ex-dividend
 * dates.
 *
 * All monetary values are integer cents.
 *
 * References: issue #1631
 */

import { bankersRound } from './rebalancing';
import type {
  DividendEvent,
  DividendFrequency,
  DividendIncomeEstimate,
  HoldingDividendEstimate,
} from './types';

// ---------------------------------------------------------------------------
// Frequency detection
// ---------------------------------------------------------------------------

/**
 * Detect dividend payment frequency from historical ex-dates.
 *
 * Analyzes the average gap between consecutive ex-dates to classify frequency.
 *
 * @param exDates - Sorted array of ISO date strings (ascending).
 * @returns Detected payment frequency.
 */
export function detectDividendFrequency(exDates: readonly string[]): DividendFrequency {
  if (exDates.length < 2) {
    return 'IRREGULAR';
  }

  const gaps: number[] = [];
  for (let i = 1; i < exDates.length; i++) {
    const prev = new Date(exDates[i - 1] + 'T00:00:00Z');
    const curr = new Date(exDates[i] + 'T00:00:00Z');
    const daysDiff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    gaps.push(daysDiff);
  }

  const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;

  if (avgGap <= 40) return 'MONTHLY';
  if (avgGap <= 105) return 'QUARTERLY';
  if (avgGap <= 200) return 'SEMI_ANNUAL';
  if (avgGap <= 400) return 'ANNUAL';
  return 'IRREGULAR';
}

/**
 * Get number of payments per year for a given frequency.
 *
 * @param frequency - Dividend payment frequency.
 * @returns Number of payments per year.
 */
export function paymentsPerYear(frequency: DividendFrequency): number {
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
      return 4; // Default assumption for estimation
  }
}

// ---------------------------------------------------------------------------
// Dividend calendar
// ---------------------------------------------------------------------------

/** Input for building a dividend calendar. */
export interface DividendHoldingInput {
  readonly holdingId: string;
  readonly symbol: string;
  /** Number of shares held. */
  readonly shares: number;
  /** Dividend per share per payment in cents. */
  readonly dividendPerShareCents: number;
  /** Historical ex-dividend dates (ISO, ascending). */
  readonly historicalExDates: readonly string[];
  /** Current market value in cents. */
  readonly marketValueCents: number;
}

/**
 * Build a dividend calendar projecting the next 12 months of events.
 *
 * Uses historical ex-dates to project future payment dates. If fewer than
 * 2 historical dates exist, assumes quarterly payments.
 *
 * @param holdings - Holdings with dividend data.
 * @param asOfDate - Reference date (ISO string, defaults to today).
 * @returns Array of projected dividend events sorted by ex-date.
 */
export function buildDividendCalendar(
  holdings: readonly DividendHoldingInput[],
  asOfDate?: string,
): readonly DividendEvent[] {
  const today = asOfDate ? new Date(asOfDate + 'T00:00:00Z') : new Date();
  const oneYearOut = new Date(today);
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);

  const events: DividendEvent[] = [];

  for (const holding of holdings) {
    if (holding.dividendPerShareCents <= 0) continue;

    const frequency = detectDividendFrequency(holding.historicalExDates);
    const monthsBetween = 12 / paymentsPerYear(frequency);

    // Determine the base date for projections
    let baseDate: Date;
    if (holding.historicalExDates.length > 0) {
      baseDate = new Date(
        holding.historicalExDates[holding.historicalExDates.length - 1] + 'T00:00:00Z',
      );
    } else {
      baseDate = new Date(today);
    }

    // Project forward from the last known date
    const projDate = new Date(baseDate);
    for (let i = 0; i < 24; i++) {
      projDate.setMonth(projDate.getMonth() + monthsBetween);

      if (projDate <= today) continue;
      if (projDate > oneYearOut) break;

      const exDate = projDate.toISOString().slice(0, 10);
      // Payment typically ~30 days after ex-date
      const payDateObj = new Date(projDate);
      payDateObj.setDate(payDateObj.getDate() + 30);
      const payDate = payDateObj.toISOString().slice(0, 10);

      const totalAmountCents = bankersRound(holding.shares * holding.dividendPerShareCents);

      events.push({
        holdingId: holding.holdingId,
        symbol: holding.symbol,
        exDate,
        payDate,
        amountPerShareCents: holding.dividendPerShareCents,
        totalAmountCents,
        isProjected: true,
      });
    }
  }

  // Sort by ex-date
  events.sort((a, b) => a.exDate.localeCompare(b.exDate));

  return events;
}

// ---------------------------------------------------------------------------
// Forward income estimation
// ---------------------------------------------------------------------------

/**
 * Estimate forward annual dividend income from holdings.
 *
 * Calculates total annual income, monthly average, current yield, and
 * per-holding breakdown.
 *
 * @param holdings - Holdings with dividend data.
 * @returns Forward dividend income estimate.
 */
export function estimateForwardIncome(
  holdings: readonly DividendHoldingInput[],
): DividendIncomeEstimate {
  const totalPortfolioValue = holdings.reduce((sum, h) => sum + h.marketValueCents, 0);

  const holdingEstimates: HoldingDividendEstimate[] = [];

  for (const holding of holdings) {
    if (holding.dividendPerShareCents <= 0) continue;

    const frequency = detectDividendFrequency(holding.historicalExDates);
    const numPayments = paymentsPerYear(frequency);
    const annualDividendCents = bankersRound(
      holding.shares * holding.dividendPerShareCents * numPayments,
    );
    const yieldPercent =
      holding.marketValueCents > 0
        ? Math.round((annualDividendCents / holding.marketValueCents) * 10000) / 100
        : 0;

    holdingEstimates.push({
      holdingId: holding.holdingId,
      symbol: holding.symbol,
      annualDividendCents,
      frequency,
      yieldPercent,
    });
  }

  const annualIncomeCents = holdingEstimates.reduce((sum, h) => sum + h.annualDividendCents, 0);
  const monthlyIncomeCents = bankersRound(annualIncomeCents / 12);
  const currentYieldPercent =
    totalPortfolioValue > 0
      ? Math.round((annualIncomeCents / totalPortfolioValue) * 10000) / 100
      : 0;

  return {
    annualIncomeCents,
    monthlyIncomeCents,
    currentYieldPercent,
    holdingEstimates,
  };
}

/**
 * Get upcoming ex-dividend dates within a given number of days.
 *
 * @param calendar - Pre-built dividend calendar.
 * @param withinDays - Number of days to look ahead (default 30).
 * @param asOfDate - Reference date (ISO string, defaults to today).
 * @returns Filtered dividend events.
 */
export function getUpcomingExDates(
  calendar: readonly DividendEvent[],
  withinDays: number = 30,
  asOfDate?: string,
): readonly DividendEvent[] {
  const today = asOfDate ? new Date(asOfDate + 'T00:00:00Z') : new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + withinDays);

  return calendar.filter((e) => {
    const exDate = new Date(e.exDate + 'T00:00:00Z');
    return exDate >= today && exDate <= cutoff;
  });
}
