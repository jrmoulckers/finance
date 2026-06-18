// SPDX-License-Identifier: BUSL-1.1

import type { Transaction } from '../../kmp/bridge';

export type ForecastConfidenceLabel = 'low' | 'medium' | 'high';

export interface RecurringForecastItem {
  readonly id: string;
  readonly description: string;
  readonly amountCents: number;
  readonly type: 'expense' | 'income';
  readonly nextDate: string;
  readonly frequencyDays?: number;
}

export interface CashFlowForecastInput {
  readonly transactions: readonly Transaction[];
  readonly currentBalanceCents: number;
  readonly asOfDate?: string;
  readonly horizons?: readonly number[];
  readonly safetyBufferCents?: number;
  readonly recurringTransactions?: readonly RecurringForecastItem[];
  readonly minimumHistoryDays?: number;
}

export interface CashFlowForecastPoint {
  readonly horizonDays: number;
  readonly targetDate: string;
  readonly expectedBalanceCents: number;
  readonly lowBalanceCents: number;
  readonly highBalanceCents: number;
  readonly confidence: ForecastConfidenceLabel;
  readonly confidenceScore: number;
  readonly topFactors: readonly string[];
  readonly thresholdCrossings: readonly ForecastThresholdCrossing[];
}

export interface ForecastThresholdCrossing {
  readonly date: string;
  readonly threshold: 'zero' | 'safety-buffer';
  readonly projectedLowBalanceCents: number;
}

export interface CashFlowForecastResult {
  readonly status: 'ready' | 'low-data';
  readonly generatedAt: string;
  readonly dailyNetMeanCents: number;
  readonly dailyVarianceCents: number;
  readonly dataDays: number;
  readonly forecasts: readonly CashFlowForecastPoint[];
  readonly message?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HORIZONS = [7, 30, 90] as const;

function parseDate(date: string): Date {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return formatDate(new Date(parseDate(date).getTime() + days * DAY_MS));
}

function amountFor(transaction: Transaction): number {
  if (transaction.type === 'INCOME') return Math.abs(transaction.amount.amount);
  if (transaction.type === 'EXPENSE') return -Math.abs(transaction.amount.amount);
  return 0;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length <= 1) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function robustDailyDeviation(values: readonly number[]): number {
  const stdDev = standardDeviation(values);
  const center = median(values);
  const mad = median(values.map((value) => Math.abs(value - center))) * 1.4826;
  if (stdDev === 0) return Math.round(mad);
  if (mad === 0) return Math.round(stdDev);
  return Math.round((stdDev + mad) / 2);
}

function recurringImpactThrough(
  recurringTransactions: readonly RecurringForecastItem[],
  asOfDate: string,
  horizonDays: number,
): number {
  const startMs = parseDate(asOfDate).getTime();
  const endMs = startMs + horizonDays * DAY_MS;
  let impact = 0;

  for (const recurring of recurringTransactions) {
    const stepDays = Math.max(1, recurring.frequencyDays ?? 30);
    for (
      let dueMs = parseDate(recurring.nextDate).getTime();
      dueMs <= endMs;
      dueMs += stepDays * DAY_MS
    ) {
      if (dueMs <= startMs) continue;
      impact +=
        recurring.type === 'income'
          ? Math.abs(recurring.amountCents)
          : -Math.abs(recurring.amountCents);
    }
  }

  return impact;
}

function computeCurrentMonthPace(
  transactions: readonly Transaction[],
  asOfDate: string,
): number | null {
  const asOf = parseDate(asOfDate);
  const monthStart = formatDate(new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1)));
  const elapsedDays = Math.max(1, asOf.getUTCDate());
  const currentNet = transactions
    .filter(
      (transaction) =>
        transaction.status !== 'VOID' &&
        transaction.type !== 'TRANSFER' &&
        transaction.date >= monthStart &&
        transaction.date <= asOfDate,
    )
    .reduce((sum, transaction) => sum + amountFor(transaction), 0);

  return elapsedDays >= 7 ? Math.round(currentNet / elapsedDays) : null;
}

function confidenceLabel(score: number): ForecastConfidenceLabel {
  if (score >= 0.75) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

function buildFactors(
  dataDays: number,
  dailyDeviation: number,
  dailyMean: number,
  hasCurrentPace: boolean,
  recurringCount: number,
): string[] {
  const factors = [`${dataDays} days of usable history`];
  if (dailyDeviation > Math.max(5_000, Math.abs(dailyMean) * 1.4)) {
    factors.push('daily cash flow is volatile');
  } else {
    factors.push('daily cash flow has stable variance');
  }
  factors.push(
    hasCurrentPace ? 'current-month pace is blended in' : 'current-month pace is still early',
  );
  if (recurringCount > 0) factors.push(`${recurringCount} known recurring item(s) included`);
  return factors;
}

function findThresholdCrossings(
  asOfDate: string,
  horizonDays: number,
  currentBalanceCents: number,
  dailyNetCents: number,
  dailyDeviationCents: number,
  zScore: number,
  recurringTransactions: readonly RecurringForecastItem[],
  safetyBufferCents: number,
): ForecastThresholdCrossing[] {
  const crossings: ForecastThresholdCrossing[] = [];
  const seen = new Set<string>();

  for (let day = 1; day <= horizonDays; day += 1) {
    const lowBalance = Math.round(
      currentBalanceCents +
        dailyNetCents * day +
        recurringImpactThrough(recurringTransactions, asOfDate, day) -
        zScore * dailyDeviationCents * Math.sqrt(day),
    );
    const date = addDays(asOfDate, day);

    if (lowBalance < 0 && !seen.has('zero')) {
      crossings.push({ date, threshold: 'zero', projectedLowBalanceCents: lowBalance });
      seen.add('zero');
    }
    if (safetyBufferCents > 0 && lowBalance < safetyBufferCents && !seen.has('safety-buffer')) {
      crossings.push({ date, threshold: 'safety-buffer', projectedLowBalanceCents: lowBalance });
      seen.add('safety-buffer');
    }
    if (seen.has('zero') && (safetyBufferCents <= 0 || seen.has('safety-buffer'))) break;
  }

  return crossings;
}

export function generateCashFlowForecast(input: CashFlowForecastInput): CashFlowForecastResult {
  const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const horizons = input.horizons ?? DEFAULT_HORIZONS;
  const minimumHistoryDays = input.minimumHistoryDays ?? 14;
  const recurringTransactions = input.recurringTransactions ?? [];
  const safetyBufferCents = input.safetyBufferCents ?? 0;

  const dailyNet = new Map<string, number>();
  for (const transaction of input.transactions) {
    if (
      transaction.status === 'VOID' ||
      transaction.type === 'TRANSFER' ||
      transaction.date > asOfDate
    )
      continue;
    dailyNet.set(transaction.date, (dailyNet.get(transaction.date) ?? 0) + amountFor(transaction));
  }

  const values = Array.from(dailyNet.values());
  const dataDays = values.length;
  if (dataDays < minimumHistoryDays) {
    return {
      status: 'low-data',
      generatedAt: `${asOfDate}T00:00:00.000Z`,
      dailyNetMeanCents: 0,
      dailyVarianceCents: 0,
      dataDays,
      forecasts: [],
      message: `At least ${minimumHistoryDays} days with income or spending are needed before showing confidence bands.`,
    };
  }

  const historicalMean = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  const currentPace = computeCurrentMonthPace(input.transactions, asOfDate);
  const dailyNetMeanCents =
    currentPace === null ? historicalMean : Math.round(currentPace * 0.55 + historicalMean * 0.45);
  const dailyVarianceCents = robustDailyDeviation(values);
  const volatilityRatio = dailyVarianceCents / Math.max(1, Math.abs(dailyNetMeanCents));
  const dataScore = Math.min(1, dataDays / 90);
  const varianceScore = Math.max(0, 1 - Math.min(1, volatilityRatio / 3));
  const recurringScore = recurringTransactions.length > 0 ? 0.1 : 0;
  const confidenceScore = Math.min(
    0.95,
    Math.max(0.15, dataScore * 0.55 + varianceScore * 0.35 + recurringScore),
  );
  const confidence = confidenceLabel(confidenceScore);
  const zScore = confidence === 'high' ? 1.28 : confidence === 'medium' ? 1.64 : 1.96;
  const topFactors = buildFactors(
    dataDays,
    dailyVarianceCents,
    dailyNetMeanCents,
    currentPace !== null,
    recurringTransactions.length,
  );

  const forecasts = horizons.map((horizonDays): CashFlowForecastPoint => {
    const recurringImpact = recurringImpactThrough(recurringTransactions, asOfDate, horizonDays);
    const expectedBalanceCents = Math.round(
      input.currentBalanceCents + dailyNetMeanCents * horizonDays + recurringImpact,
    );
    const band = Math.round(zScore * dailyVarianceCents * Math.sqrt(horizonDays));

    return {
      horizonDays,
      targetDate: addDays(asOfDate, horizonDays),
      expectedBalanceCents,
      lowBalanceCents: expectedBalanceCents - band,
      highBalanceCents: expectedBalanceCents + band,
      confidence,
      confidenceScore,
      topFactors,
      thresholdCrossings: findThresholdCrossings(
        asOfDate,
        horizonDays,
        input.currentBalanceCents,
        dailyNetMeanCents,
        dailyVarianceCents,
        zScore,
        recurringTransactions,
        safetyBufferCents,
      ),
    };
  });

  return {
    status: 'ready',
    generatedAt: `${asOfDate}T00:00:00.000Z`,
    dailyNetMeanCents,
    dailyVarianceCents,
    dataDays,
    forecasts,
  };
}
