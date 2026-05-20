// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the price-increase and anomaly alert engine.
 *
 * Covers: percentage change calculation, single price change detection,
 * full history scanning, statistical helpers, anomaly detection, price
 * timeline building, and multi-subscription scanning.
 *
 * Edge cases: zero previous price, identical prices, single record,
 * no history, large spikes, all-identical history.
 *
 * References: issues #1598, #1619
 */

import { describe, expect, it } from 'vitest';
import {
  buildPriceTimeline,
  calculatePercentageChange,
  detectAllPriceChanges,
  detectAnomaly,
  detectPriceChange,
  mean,
  scanForPriceAlerts,
  standardDeviation,
} from './price-alerts';
import type { PriceRecord, Subscription } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    name: 'StreamMax',
    priceCents: 1599,
    billingCycle: 'monthly',
    category: 'streaming',
    status: 'active',
    startDate: '2024-01-01',
    nextBillingDate: '2025-02-01',
    provider: 'StreamCo',
    priceHistory: [],
    ...overrides,
  };
}

function makeRecord(priceCents: number, date: string): PriceRecord {
  return { priceCents, effectiveDate: date };
}

// ---------------------------------------------------------------------------
// calculatePercentageChange
// ---------------------------------------------------------------------------

describe('calculatePercentageChange', () => {
  it('calculates positive percentage for an increase', () => {
    // 1000 → 1200 = 20%
    expect(calculatePercentageChange(1000, 1200)).toBeCloseTo(20);
  });

  it('calculates negative percentage for a decrease', () => {
    // 1200 → 1000 = -16.67%
    expect(calculatePercentageChange(1200, 1000)).toBeCloseTo(-16.667, 1);
  });

  it('returns 0 when prices are equal', () => {
    expect(calculatePercentageChange(1000, 1000)).toBe(0);
  });

  it('returns 0 when previous price is 0', () => {
    expect(calculatePercentageChange(0, 1000)).toBe(0);
  });

  it('handles 100% increase', () => {
    expect(calculatePercentageChange(500, 1000)).toBeCloseTo(100);
  });
});

// ---------------------------------------------------------------------------
// detectPriceChange
// ---------------------------------------------------------------------------

describe('detectPriceChange', () => {
  it('detects a price increase', () => {
    const sub = makeSub();
    const prev = makeRecord(1299, '2024-06-01');
    const curr = makeRecord(1599, '2024-07-01');

    const alert = detectPriceChange(sub, prev, curr);
    expect(alert).not.toBeNull();
    expect(alert!.type).toBe('price_increase');
    expect(alert!.changeCents).toBe(300);
    expect(alert!.changePercent).toBeCloseTo(23.1, 0);
    expect(alert!.severity).toBe('critical'); // ≥20%
  });

  it('detects a price decrease', () => {
    const sub = makeSub();
    const prev = makeRecord(1599, '2024-06-01');
    const curr = makeRecord(1299, '2024-07-01');

    const alert = detectPriceChange(sub, prev, curr);
    expect(alert).not.toBeNull();
    expect(alert!.type).toBe('price_decrease');
    expect(alert!.changeCents).toBe(-300);
    expect(alert!.severity).toBe('info');
  });

  it('returns null when prices are identical', () => {
    const sub = makeSub();
    const prev = makeRecord(1599, '2024-06-01');
    const curr = makeRecord(1599, '2024-07-01');

    expect(detectPriceChange(sub, prev, curr)).toBeNull();
  });

  it('classifies 10-19% increase as warning', () => {
    const sub = makeSub();
    const prev = makeRecord(1000, '2024-06-01');
    const curr = makeRecord(1150, '2024-07-01'); // 15%

    const alert = detectPriceChange(sub, prev, curr);
    expect(alert!.severity).toBe('warning');
  });

  it('classifies <10% increase as info', () => {
    const sub = makeSub();
    const prev = makeRecord(1000, '2024-06-01');
    const curr = makeRecord(1050, '2024-07-01'); // 5%

    const alert = detectPriceChange(sub, prev, curr);
    expect(alert!.severity).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// detectAllPriceChanges
// ---------------------------------------------------------------------------

describe('detectAllPriceChanges', () => {
  it('returns empty for single-record history', () => {
    const sub = makeSub({
      priceHistory: [makeRecord(1599, '2024-01-01')],
    });
    expect(detectAllPriceChanges(sub)).toHaveLength(0);
  });

  it('returns empty for no history', () => {
    const sub = makeSub({ priceHistory: [] });
    expect(detectAllPriceChanges(sub)).toHaveLength(0);
  });

  it('detects multiple price changes', () => {
    const sub = makeSub({
      priceHistory: [
        makeRecord(999, '2024-01-01'),
        makeRecord(1299, '2024-04-01'),
        makeRecord(1599, '2024-07-01'),
      ],
    });

    const alerts = detectAllPriceChanges(sub);
    expect(alerts).toHaveLength(2);
    expect(alerts[0].previousPriceCents).toBe(999);
    expect(alerts[0].currentPriceCents).toBe(1299);
    expect(alerts[1].previousPriceCents).toBe(1299);
    expect(alerts[1].currentPriceCents).toBe(1599);
  });

  it('sorts by date regardless of input order', () => {
    const sub = makeSub({
      priceHistory: [
        makeRecord(1599, '2024-07-01'),
        makeRecord(999, '2024-01-01'),
        makeRecord(1299, '2024-04-01'),
      ],
    });

    const alerts = detectAllPriceChanges(sub);
    expect(alerts[0].detectedDate).toBe('2024-04-01');
    expect(alerts[1].detectedDate).toBe('2024-07-01');
  });

  it('skips periods with no change', () => {
    const sub = makeSub({
      priceHistory: [
        makeRecord(999, '2024-01-01'),
        makeRecord(999, '2024-04-01'),
        makeRecord(1299, '2024-07-01'),
      ],
    });

    const alerts = detectAllPriceChanges(sub);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].currentPriceCents).toBe(1299);
  });
});

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

describe('mean', () => {
  it('calculates the arithmetic mean', () => {
    expect(mean([10, 20, 30])).toBe(20);
  });

  it('returns 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('returns the value for single element', () => {
    expect(mean([42])).toBe(42);
  });
});

describe('standardDeviation', () => {
  it('calculates population std dev', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] → mean=5, stddev=2
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(standardDeviation([])).toBe(0);
  });

  it('returns 0 for single element', () => {
    expect(standardDeviation([42])).toBe(0);
  });

  it('returns 0 for identical values', () => {
    expect(standardDeviation([5, 5, 5, 5])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// detectAnomaly
// ---------------------------------------------------------------------------

describe('detectAnomaly', () => {
  it('detects anomalous price spike', () => {
    const sub = makeSub({
      priceCents: 5000, // Far above history
      priceHistory: [
        makeRecord(1000, '2024-01-01'),
        makeRecord(1000, '2024-02-01'),
        makeRecord(1000, '2024-03-01'),
        makeRecord(1000, '2024-04-01'),
      ],
    });

    const result = detectAnomaly(sub);
    expect(result.isAnomaly).toBe(true);
    expect(result.currentPriceCents).toBe(5000);
    expect(result.meanPriceCents).toBe(1000);
  });

  it('does not flag normal price', () => {
    const sub = makeSub({
      priceCents: 1050,
      priceHistory: [
        makeRecord(1000, '2024-01-01'),
        makeRecord(1020, '2024-02-01'),
        makeRecord(1050, '2024-03-01'),
        makeRecord(1030, '2024-04-01'),
      ],
    });

    const result = detectAnomaly(sub);
    expect(result.isAnomaly).toBe(false);
  });

  it('returns not anomaly for insufficient history', () => {
    const sub = makeSub({
      priceCents: 5000,
      priceHistory: [makeRecord(1000, '2024-01-01'), makeRecord(1000, '2024-02-01')],
    });

    const result = detectAnomaly(sub);
    expect(result.isAnomaly).toBe(false);
    expect(result.message).toContain('Insufficient');
  });

  it('handles all-identical history gracefully', () => {
    const sub = makeSub({
      priceCents: 1000,
      priceHistory: [
        makeRecord(1000, '2024-01-01'),
        makeRecord(1000, '2024-02-01'),
        makeRecord(1000, '2024-03-01'),
      ],
    });

    const result = detectAnomaly(sub);
    expect(result.isAnomaly).toBe(false);
    expect(result.stdDevCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildPriceTimeline
// ---------------------------------------------------------------------------

describe('buildPriceTimeline', () => {
  it('sorts records chronologically', () => {
    const sub = makeSub({
      priceHistory: [
        makeRecord(1599, '2024-07-01'),
        makeRecord(999, '2024-01-01'),
        makeRecord(1299, '2024-04-01'),
      ],
    });

    const timeline = buildPriceTimeline(sub);
    expect(timeline[0].effectiveDate).toBe('2024-01-01');
    expect(timeline[1].effectiveDate).toBe('2024-04-01');
    expect(timeline[2].effectiveDate).toBe('2024-07-01');
  });

  it('returns empty array for no history', () => {
    const sub = makeSub({ priceHistory: [] });
    expect(buildPriceTimeline(sub)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// scanForPriceAlerts
// ---------------------------------------------------------------------------

describe('scanForPriceAlerts', () => {
  it('combines price changes and anomalies from multiple subs', () => {
    const subs = [
      makeSub({
        id: 'sub-1',
        name: 'Service A',
        priceCents: 5000,
        priceHistory: [
          makeRecord(1000, '2024-01-01'),
          makeRecord(1000, '2024-02-01'),
          makeRecord(1000, '2024-03-01'),
          makeRecord(5000, '2024-04-01'),
        ],
      }),
      makeSub({
        id: 'sub-2',
        name: 'Service B',
        priceCents: 1599,
        priceHistory: [makeRecord(1299, '2024-01-01'), makeRecord(1599, '2024-04-01')],
      }),
    ];

    const alerts = scanForPriceAlerts(subs);
    // sub-1: 3 price changes (1000→1000 skipped, 1000→5000) + anomaly
    // sub-2: 1 price change
    expect(alerts.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty for subscriptions with no history', () => {
    const subs = [makeSub({ priceHistory: [] })];
    expect(scanForPriceAlerts(subs)).toHaveLength(0);
  });
});
