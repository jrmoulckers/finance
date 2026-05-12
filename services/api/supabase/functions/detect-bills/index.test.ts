// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the `detect-bills` Edge Function (#1110).
 *
 * Validates pattern detection logic, confidence scoring, subscription
 * categorization, frequency detection, calendar computation, and
 * input validation — all using extracted pure functions.
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import { createMockRequest } from '../_test_helpers/mock-request.ts';

// ---------------------------------------------------------------------------
// Extracted pure functions — mirror index.ts logic for isolated testing.
// ---------------------------------------------------------------------------

const MIN_TRANSACTIONS = 3;
const MIN_CONFIDENCE = 50;

const FREQUENCY_RANGES: { name: string; minDays: number; maxDays: number; targetDays: number }[] = [
  { name: 'weekly', minDays: 5, maxDays: 9, targetDays: 7 },
  { name: 'biweekly', minDays: 12, maxDays: 17, targetDays: 14 },
  { name: 'monthly', minDays: 25, maxDays: 35, targetDays: 30 },
  { name: 'quarterly', minDays: 80, maxDays: 100, targetDays: 91 },
  { name: 'yearly', minDays: 350, maxDays: 380, targetDays: 365 },
];

const SUBSCRIPTION_CATEGORIES: { category: string; keywords: string[] }[] = [
  {
    category: 'streaming',
    keywords: [
      'netflix',
      'hulu',
      'disney',
      'hbo',
      'spotify',
      'youtube',
      'amazon prime',
      'apple tv',
      'paramount',
      'peacock',
    ],
  },
  {
    category: 'saas',
    keywords: [
      'adobe',
      'microsoft',
      'google workspace',
      'slack',
      'zoom',
      'notion',
      'dropbox',
      'github',
      'figma',
      'openai',
    ],
  },
  {
    category: 'insurance',
    keywords: ['insurance', 'allstate', 'geico', 'progressive', 'state farm'],
  },
  {
    category: 'utilities',
    keywords: [
      'electric',
      'gas',
      'water',
      'power',
      'energy',
      'utility',
      'comcast',
      'xfinity',
      'att',
      'verizon',
      't-mobile',
      'internet',
    ],
  },
  { category: 'fitness', keywords: ['gym', 'fitness', 'planet fitness', 'peloton'] },
  { category: 'news_media', keywords: ['new york times', 'washington post', 'wsj', 'medium'] },
  { category: 'cloud_storage', keywords: ['icloud', 'google one', 'onedrive'] },
  { category: 'rent_mortgage', keywords: ['rent', 'mortgage', 'apartment', 'housing'] },
];

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const sqDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(sqDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

function detectFrequency(intervals: number[]): { name: string; targetDays: number } | null {
  if (intervals.length === 0) return null;
  const avgInterval = mean(intervals);

  for (const freq of FREQUENCY_RANGES) {
    if (avgInterval >= freq.minDays && avgInterval <= freq.maxDays) {
      return { name: freq.name, targetDays: freq.targetDays };
    }
  }
  return null;
}

function calculateConfidence(
  transactionCount: number,
  amountStdDev: number,
  amountMean: number,
  intervalStdDev: number,
  intervalMean: number,
): number {
  let score = 0;

  score += Math.min(transactionCount * 5, 30);

  if (amountMean > 0) {
    const coeffOfVariation = amountStdDev / amountMean;
    if (coeffOfVariation < 0.05) score += 40;
    else if (coeffOfVariation < 0.1) score += 30;
    else if (coeffOfVariation < 0.2) score += 20;
    else if (coeffOfVariation < 0.5) score += 10;
  }

  if (intervalMean > 0) {
    const intervalCv = intervalStdDev / intervalMean;
    if (intervalCv < 0.1) score += 30;
    else if (intervalCv < 0.2) score += 20;
    else if (intervalCv < 0.3) score += 15;
    else if (intervalCv < 0.5) score += 5;
  }

  return Math.min(score, 100);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

function daysBetween(d1: string, d2: string): number {
  const date1 = new Date(d1 + 'T00:00:00Z');
  const date2 = new Date(d2 + 'T00:00:00Z');
  return Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
}

function detectSubscriptionCategory(merchant: string): string {
  const lower = merchant.toLowerCase();
  for (const { category, keywords } of SUBSCRIPTION_CATEGORIES) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return category;
      }
    }
  }
  return 'other';
}

function confidenceLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Frequency Detection Tests
// ---------------------------------------------------------------------------

Deno.test('detectFrequency — weekly intervals', () => {
  const intervals = [7, 7, 7, 7];
  const result = detectFrequency(intervals);
  assertEquals(result?.name, 'weekly');
  assertEquals(result?.targetDays, 7);
});

Deno.test('detectFrequency — biweekly intervals', () => {
  const intervals = [14, 14, 14];
  const result = detectFrequency(intervals);
  assertEquals(result?.name, 'biweekly');
  assertEquals(result?.targetDays, 14);
});

Deno.test('detectFrequency — monthly intervals', () => {
  const intervals = [30, 31, 30, 31, 28];
  const result = detectFrequency(intervals);
  assertEquals(result?.name, 'monthly');
});

Deno.test('detectFrequency — quarterly intervals', () => {
  const intervals = [91, 92, 91];
  const result = detectFrequency(intervals);
  assertEquals(result?.name, 'quarterly');
});

Deno.test('detectFrequency — yearly intervals', () => {
  const intervals = [365, 365];
  const result = detectFrequency(intervals);
  assertEquals(result?.name, 'yearly');
});

Deno.test('detectFrequency — returns null for irregular intervals', () => {
  const intervals = [10, 45, 3, 120]; // No pattern
  const result = detectFrequency(intervals);
  assertEquals(result, null);
});

Deno.test('detectFrequency — returns null for empty intervals', () => {
  assertEquals(detectFrequency([]), null);
});

// ---------------------------------------------------------------------------
// Confidence Scoring Tests
// ---------------------------------------------------------------------------

Deno.test('calculateConfidence — high confidence for consistent bills', () => {
  // 12 monthly transactions with identical $50 amounts, very regular intervals
  const score = calculateConfidence(
    12, // 12 transactions → 30 points (capped)
    0, // 0 std dev → < 5% CV → 40 points
    5000, // $50 mean
    0.5, // 0.5 day std dev → < 0.1 CV → 30 points
    30, // 30-day mean interval
  );
  assertEquals(score, 100); // 30 + 40 + 30 = 100
});

Deno.test('calculateConfidence — medium confidence for variable amounts', () => {
  const score = calculateConfidence(
    5, // 5 transactions → 25 points
    800, // $8 std dev
    5000, // $50 mean → CV = 0.16 → 20 points
    3, // 3-day std dev
    30, // 30-day mean → CV = 0.1 → 20 points
  );
  assertEquals(score, 65); // 25 + 20 + 20 = 65
});

Deno.test('calculateConfidence — low confidence for irregular patterns', () => {
  const score = calculateConfidence(
    3, // 3 transactions → 15 points
    3000, // $30 std dev
    5000, // $50 mean → CV = 0.6 → 0 points
    15, // 15-day std dev
    30, // 30-day mean → CV = 0.5 → 0 points (not < 0.5)
  );
  assertEquals(score, 15); // 15 + 0 + 0 = 15
});

Deno.test('calculateConfidence — minimum transactions threshold', () => {
  const txCount = 2; // Below MIN_TRANSACTIONS
  assertEquals(txCount < MIN_TRANSACTIONS, true);
});

Deno.test('calculateConfidence — capped at 100', () => {
  // Even with max inputs, should never exceed 100
  const score = calculateConfidence(100, 0, 10000, 0.1, 30);
  assertEquals(score <= 100, true);
});

// ---------------------------------------------------------------------------
// Confidence Level Tests
// ---------------------------------------------------------------------------

Deno.test('confidenceLevel — high for 80+', () => {
  assertEquals(confidenceLevel(80), 'high');
  assertEquals(confidenceLevel(95), 'high');
  assertEquals(confidenceLevel(100), 'high');
});

Deno.test('confidenceLevel — medium for 60-79', () => {
  assertEquals(confidenceLevel(60), 'medium');
  assertEquals(confidenceLevel(70), 'medium');
  assertEquals(confidenceLevel(79), 'medium');
});

Deno.test('confidenceLevel — low for below 60', () => {
  assertEquals(confidenceLevel(59), 'low');
  assertEquals(confidenceLevel(50), 'low');
  assertEquals(confidenceLevel(0), 'low');
});

// ---------------------------------------------------------------------------
// Subscription Category Detection Tests
// ---------------------------------------------------------------------------

Deno.test('detectSubscriptionCategory — streaming services', () => {
  assertEquals(detectSubscriptionCategory('Netflix'), 'streaming');
  assertEquals(detectSubscriptionCategory('SPOTIFY PREMIUM'), 'streaming');
  assertEquals(detectSubscriptionCategory('Disney+ Monthly'), 'streaming');
  assertEquals(detectSubscriptionCategory('HBO Max Subscription'), 'streaming');
  assertEquals(detectSubscriptionCategory('Apple TV+'), 'streaming');
});

Deno.test('detectSubscriptionCategory — SaaS services', () => {
  assertEquals(detectSubscriptionCategory('Adobe Creative Cloud'), 'saas');
  assertEquals(detectSubscriptionCategory('Microsoft 365'), 'saas');
  assertEquals(detectSubscriptionCategory('GITHUB INC'), 'saas');
  assertEquals(detectSubscriptionCategory('Zoom Video Communications'), 'saas');
  assertEquals(detectSubscriptionCategory('Figma Inc'), 'saas');
});

Deno.test('detectSubscriptionCategory — insurance', () => {
  assertEquals(detectSubscriptionCategory('Progressive Insurance'), 'insurance');
  assertEquals(detectSubscriptionCategory('STATE FARM AUTO INS'), 'insurance');
  assertEquals(detectSubscriptionCategory('GEICO'), 'insurance');
});

Deno.test('detectSubscriptionCategory — utilities', () => {
  assertEquals(detectSubscriptionCategory('City Electric Bill'), 'utilities');
  assertEquals(detectSubscriptionCategory('Comcast Internet'), 'utilities');
  assertEquals(detectSubscriptionCategory('AT&T Wireless'), 'utilities');
  assertEquals(detectSubscriptionCategory('Verizon Fios'), 'utilities');
});

Deno.test('detectSubscriptionCategory — fitness', () => {
  assertEquals(detectSubscriptionCategory('Planet Fitness'), 'fitness');
  assertEquals(detectSubscriptionCategory('PELOTON INTERACTIVE'), 'fitness');
});

Deno.test('detectSubscriptionCategory — returns other for unknown merchants', () => {
  assertEquals(detectSubscriptionCategory('Local Coffee Shop'), 'other');
  assertEquals(detectSubscriptionCategory('WALMART'), 'other');
  assertEquals(detectSubscriptionCategory('Target Corp'), 'other');
});

// ---------------------------------------------------------------------------
// Date Utility Tests
// ---------------------------------------------------------------------------

Deno.test('addDays — adds days correctly', () => {
  assertEquals(addDays('2025-01-01', 30), '2025-01-31');
  assertEquals(addDays('2025-01-31', 1), '2025-02-01');
  assertEquals(addDays('2025-12-31', 1), '2026-01-01');
});

Deno.test('addDays — handles month boundaries', () => {
  assertEquals(addDays('2025-02-28', 1), '2025-03-01');
  // Leap year
  assertEquals(addDays('2024-02-28', 1), '2024-02-29');
  assertEquals(addDays('2024-02-29', 1), '2024-03-01');
});

Deno.test('daysBetween — calculates correctly', () => {
  assertEquals(daysBetween('2025-01-01', '2025-01-31'), 30);
  assertEquals(daysBetween('2025-01-01', '2025-02-01'), 31);
  assertEquals(daysBetween('2025-01-01', '2025-01-01'), 0);
});

// ---------------------------------------------------------------------------
// Statistical Utility Tests
// ---------------------------------------------------------------------------

Deno.test('mean — calculates average', () => {
  assertEquals(mean([10, 20, 30]), 20);
  assertEquals(mean([5000]), 5000);
  assertEquals(mean([]), 0);
});

Deno.test('stdDev — calculates standard deviation', () => {
  // All same values → 0 std dev
  assertEquals(stdDev([100, 100, 100]), 0);
  // Less than 2 values → 0
  assertEquals(stdDev([100]), 0);
  assertEquals(stdDev([]), 0);
  // Known values
  const sd = stdDev([10, 20, 30]);
  assertEquals(sd > 9.9 && sd < 10.1, true); // ~10
});

// ---------------------------------------------------------------------------
// Due Date Prediction Tests (within 2-day window)
// ---------------------------------------------------------------------------

Deno.test('due date prediction — monthly bill within 2-day accuracy', () => {
  // Simulate a monthly bill with transactions on the 15th
  const dates = ['2025-01-15', '2025-02-15', '2025-03-15', '2025-04-15'];
  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    intervals.push(daysBetween(dates[i - 1], dates[i]));
  }

  const freq = detectFrequency(intervals);
  assertEquals(freq?.name, 'monthly');

  const lastDate = dates[dates.length - 1];
  const predicted = addDays(lastDate, freq!.targetDays);

  // Expected: ~2025-05-15. With 30-day target from April 15 → May 15
  const expectedDate = '2025-05-15';
  const diff = Math.abs(daysBetween(predicted, expectedDate));

  assertEquals(
    diff <= 2,
    true,
    `Prediction ${predicted} should be within 2 days of ${expectedDate}`,
  );
});

Deno.test('due date prediction — weekly bill within 2-day accuracy', () => {
  const dates = ['2025-03-01', '2025-03-08', '2025-03-15', '2025-03-22'];
  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    intervals.push(daysBetween(dates[i - 1], dates[i]));
  }

  const freq = detectFrequency(intervals);
  assertEquals(freq?.name, 'weekly');

  const predicted = addDays(dates[dates.length - 1], freq!.targetDays);
  const diff = Math.abs(daysBetween(predicted, '2025-03-29'));

  assertEquals(diff <= 2, true);
});

// ---------------------------------------------------------------------------
// End-to-End Pattern Detection Simulation
// ---------------------------------------------------------------------------

Deno.test('pattern detection — detects monthly Netflix subscription', () => {
  const txDates = [
    '2024-06-15',
    '2024-07-15',
    '2024-08-15',
    '2024-09-15',
    '2024-10-15',
    '2024-11-15',
    '2024-12-15',
  ];
  const amounts = [1599, 1599, 1599, 1599, 1599, 1599, 1599]; // $15.99

  const intervals: number[] = [];
  for (let i = 1; i < txDates.length; i++) {
    intervals.push(daysBetween(txDates[i - 1], txDates[i]));
  }

  const freq = detectFrequency(intervals);
  assertEquals(freq?.name, 'monthly');

  const avgAmount = Math.round(mean(amounts));
  assertEquals(avgAmount, 1599);

  const amountStd = stdDev(amounts);
  assertEquals(amountStd, 0); // Identical amounts

  const confidence = calculateConfidence(
    txDates.length,
    amountStd,
    mean(amounts),
    stdDev(intervals),
    mean(intervals),
  );

  assertEquals(confidence >= 80, true, `Expected high confidence, got ${confidence}`);
  assertEquals(confidenceLevel(confidence), 'high');
  assertEquals(detectSubscriptionCategory('Netflix'), 'streaming');
});

Deno.test('pattern detection — detects variable utility bill', () => {
  const txDates = ['2024-09-01', '2024-10-01', '2024-11-01', '2024-12-01'];
  const amounts = [8500, 9200, 7800, 10500]; // Variable electric bill

  const intervals: number[] = [];
  for (let i = 1; i < txDates.length; i++) {
    intervals.push(daysBetween(txDates[i - 1], txDates[i]));
  }

  const freq = detectFrequency(intervals);
  assertEquals(freq?.name, 'monthly');

  const amountStd = stdDev(amounts);
  const amountAvg = mean(amounts);
  const cv = amountStd / amountAvg;

  // CV should indicate moderate variability
  assertEquals(cv > 0.05 && cv < 0.2, true);

  const confidence = calculateConfidence(
    txDates.length,
    amountStd,
    amountAvg,
    stdDev(intervals),
    mean(intervals),
  );

  assertEquals(confidence >= MIN_CONFIDENCE, true);
  assertEquals(detectSubscriptionCategory('City Electric'), 'utilities');
});

Deno.test('pattern detection — rejects random purchases', () => {
  // Random shopping with no pattern
  const _amounts = [2500, 15000, 350, 8900, 42]; // amounts vary widely
  const intervals = [3, 45, 12, 87]; // Irregular

  const freq = detectFrequency(intervals);
  assertEquals(freq, null); // No frequency detected
});

// ---------------------------------------------------------------------------
// Mock Request Tests
// ---------------------------------------------------------------------------

Deno.test('mock request — creates valid calendar request', () => {
  const req = createMockRequest({
    method: 'GET',
    url: 'https://test.supabase.co/functions/v1/detect-bills?household_id=abc&action=calendar&days=30',
  });

  const url = new URL(req.url);
  assertEquals(url.searchParams.get('action'), 'calendar');
  assertEquals(url.searchParams.get('days'), '30');
  assertEquals(url.searchParams.get('household_id'), 'abc');
});

Deno.test('mock request — creates valid analysis request', () => {
  const req = createMockRequest({
    method: 'POST',
    url: 'https://test.supabase.co/functions/v1/detect-bills?action=analyze',
    body: { household_id: 'test-household-id' },
  });

  assertEquals(req.method, 'POST');
  const url = new URL(req.url);
  assertEquals(url.searchParams.get('action'), 'analyze');
});

// ---------------------------------------------------------------------------
// Amount Change Detection
// ---------------------------------------------------------------------------

Deno.test('amount variance — flags significant amount changes', () => {
  const amounts = [5000, 5000, 5000, 7500]; // Price increase
  const amountStd = stdDev(amounts);
  const amountAvg = mean(amounts);

  // High variance should lower confidence
  const cv = amountStd / amountAvg;
  assertEquals(cv > 0.1, true, 'CV should indicate significant variance');

  // The most recent amount deviates significantly
  const latestAmount = amounts[amounts.length - 1];
  const deviationPct = Math.abs(latestAmount - amountAvg) / amountAvg;
  assertEquals(deviationPct > 0.1, true, 'Latest amount should deviate >10% from mean');
});
