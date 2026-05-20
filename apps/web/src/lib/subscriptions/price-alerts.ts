// SPDX-License-Identifier: BUSL-1.1

/**
 * Price-increase and recurring anomaly alert engine.
 *
 * Detects price changes between billing cycles, calculates percentage
 * change, flags anomalous charges (>2 standard deviations from the
 * historical mean), and builds a price timeline.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issues #1598, #1619
 */

import type { AnomalyResult, PriceAlert, PriceRecord, Subscription } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Threshold in standard deviations for anomaly detection. */
const ANOMALY_STDDEV_THRESHOLD = 2;

/** Minimum number of price records needed for anomaly detection. */
const MIN_RECORDS_FOR_ANOMALY = 3;

// ---------------------------------------------------------------------------
// Price change detection
// ---------------------------------------------------------------------------

/**
 * Calculates the percentage change between two prices.
 *
 * Returns 0 when the previous price is 0 to avoid division by zero.
 *
 * @param previousCents - Previous price in cents.
 * @param currentCents - Current price in cents.
 * @returns Percentage change (positive = increase, negative = decrease).
 */
export function calculatePercentageChange(previousCents: number, currentCents: number): number {
  if (previousCents === 0) return 0;
  return ((currentCents - previousCents) / previousCents) * 100;
}

/**
 * Detects a price change between two consecutive price records.
 *
 * Returns null if no change occurred.
 *
 * @param subscription - The subscription to check.
 * @param previousRecord - The older price record.
 * @param currentRecord - The newer price record.
 * @returns A PriceAlert if a change was detected, or null.
 */
export function detectPriceChange(
  subscription: Subscription,
  previousRecord: PriceRecord,
  currentRecord: PriceRecord,
): PriceAlert | null {
  const diff = currentRecord.priceCents - previousRecord.priceCents;
  if (diff === 0) return null;

  const percentChange = calculatePercentageChange(
    previousRecord.priceCents,
    currentRecord.priceCents,
  );

  const isIncrease = diff > 0;
  const severity = isIncrease
    ? Math.abs(percentChange) >= 20
      ? 'critical'
      : Math.abs(percentChange) >= 10
        ? 'warning'
        : 'info'
    : 'info';

  const direction = isIncrease ? 'increased' : 'decreased';
  const message =
    `${subscription.name} price ${direction} from ` +
    `$${(previousRecord.priceCents / 100).toFixed(2)} to ` +
    `$${(currentRecord.priceCents / 100).toFixed(2)} ` +
    `(${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(1)}%)`;

  return {
    subscriptionId: subscription.id,
    subscriptionName: subscription.name,
    severity,
    type: isIncrease ? 'price_increase' : 'price_decrease',
    previousPriceCents: previousRecord.priceCents,
    currentPriceCents: currentRecord.priceCents,
    changeCents: diff,
    changePercent: percentChange,
    detectedDate: currentRecord.effectiveDate,
    message,
  };
}

/**
 * Scans a subscription's price history and returns all price change alerts.
 *
 * Alerts are sorted chronologically (oldest first).
 *
 * @param subscription - The subscription to analyze.
 * @returns Array of price change alerts.
 */
export function detectAllPriceChanges(subscription: Subscription): readonly PriceAlert[] {
  const history = subscription.priceHistory;
  if (history.length < 2) return [];

  const sorted = [...history].sort(
    (a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime(),
  );

  const alerts: PriceAlert[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const alert = detectPriceChange(subscription, sorted[i - 1], sorted[i]);
    if (alert) alerts.push(alert);
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

/**
 * Calculates the arithmetic mean of an array of numbers.
 *
 * Returns 0 for an empty array.
 *
 * @param values - Array of numeric values.
 * @returns The mean.
 */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

/**
 * Calculates the population standard deviation of an array of numbers.
 *
 * Returns 0 for an empty array or a single-element array.
 *
 * @param values - Array of numeric values.
 * @returns The population standard deviation.
 */
export function standardDeviation(values: readonly number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  const variance = squaredDiffs.reduce((acc, v) => acc + v, 0) / values.length;
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Anomaly detection
// ---------------------------------------------------------------------------

/**
 * Detects whether a subscription's current price is anomalous relative
 * to its historical prices.
 *
 * An anomaly is flagged when the current price is more than 2 standard
 * deviations from the historical mean. Requires at least 3 price records
 * for meaningful statistical analysis.
 *
 * @param subscription - The subscription to analyze.
 * @returns An AnomalyResult describing whether an anomaly was detected.
 */
export function detectAnomaly(subscription: Subscription): AnomalyResult {
  const prices = subscription.priceHistory.map((r) => r.priceCents);

  if (prices.length < MIN_RECORDS_FOR_ANOMALY) {
    return {
      subscriptionId: subscription.id,
      isAnomaly: false,
      currentPriceCents: subscription.priceCents,
      meanPriceCents: Math.round(mean(prices)),
      stdDevCents: 0,
      zScore: 0,
      message: 'Insufficient price history for anomaly detection.',
    };
  }

  const avg = mean(prices);
  const stdDev = standardDeviation(prices);

  if (stdDev === 0) {
    // When all historical prices are identical, any deviation is anomalous.
    const differs = subscription.priceCents !== Math.round(avg);
    return {
      subscriptionId: subscription.id,
      isAnomaly: differs,
      currentPriceCents: subscription.priceCents,
      meanPriceCents: Math.round(avg),
      stdDevCents: 0,
      zScore: differs ? Infinity : 0,
      message: differs
        ? `${subscription.name} current price ($${(subscription.priceCents / 100).toFixed(2)}) ` +
          `differs from the consistent historical price ` +
          `($${(avg / 100).toFixed(2)}). This may indicate an unexpected charge.`
        : 'All historical prices are identical — no anomaly.',
    };
  }

  const zScore = (subscription.priceCents - avg) / stdDev;
  const isAnomaly = Math.abs(zScore) > ANOMALY_STDDEV_THRESHOLD;

  const message = isAnomaly
    ? `${subscription.name} current price ($${(subscription.priceCents / 100).toFixed(2)}) ` +
      `is ${Math.abs(zScore).toFixed(1)} standard deviations from the mean ` +
      `($${(avg / 100).toFixed(2)}). This may indicate an unexpected charge.`
    : `${subscription.name} price is within normal range.`;

  return {
    subscriptionId: subscription.id,
    isAnomaly,
    currentPriceCents: subscription.priceCents,
    meanPriceCents: Math.round(avg),
    stdDevCents: Math.round(stdDev),
    zScore,
    message,
  };
}

/**
 * Builds a chronological price timeline for a subscription.
 *
 * Returns price records sorted from earliest to latest.
 *
 * @param subscription - The subscription whose timeline to build.
 * @returns Sorted array of price records.
 */
export function buildPriceTimeline(subscription: Subscription): readonly PriceRecord[] {
  return [...subscription.priceHistory].sort(
    (a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime(),
  );
}

/**
 * Scans multiple subscriptions and returns all price alerts (changes + anomalies).
 *
 * @param subscriptions - Array of subscriptions to analyze.
 * @returns Combined array of price alerts sorted by date.
 */
export function scanForPriceAlerts(subscriptions: readonly Subscription[]): readonly PriceAlert[] {
  const alerts: PriceAlert[] = [];

  for (const sub of subscriptions) {
    // Detect price changes
    const changes = detectAllPriceChanges(sub);
    alerts.push(...changes);

    // Detect anomalies
    const anomaly = detectAnomaly(sub);
    if (anomaly.isAnomaly) {
      const lastRecord =
        sub.priceHistory.length > 0
          ? [...sub.priceHistory].sort(
              (a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime(),
            )[0]
          : null;

      alerts.push({
        subscriptionId: sub.id,
        subscriptionName: sub.name,
        severity: 'warning',
        type: 'anomaly',
        previousPriceCents: anomaly.meanPriceCents,
        currentPriceCents: anomaly.currentPriceCents,
        changeCents: anomaly.currentPriceCents - anomaly.meanPriceCents,
        changePercent: calculatePercentageChange(anomaly.meanPriceCents, anomaly.currentPriceCents),
        detectedDate: lastRecord?.effectiveDate ?? new Date().toISOString().slice(0, 10),
        message: anomaly.message,
      });
    }
  }

  return alerts.sort(
    (a, b) => new Date(a.detectedDate).getTime() - new Date(b.detectedDate).getTime(),
  );
}
