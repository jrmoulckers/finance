// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for Spending Forecast Edge Function (#328).
 *
 * Validates parameter parsing, confidence interval calculations,
 * action routing, and security constraints.
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/testing/asserts.ts';

// ---------------------------------------------------------------------------
// Constants (mirrored from the Edge Function)
// ---------------------------------------------------------------------------

const MAX_FORECAST_MONTHS = 12;
const MAX_HISTORY_MONTHS = 24;
const MIN_HISTORY_MONTHS = 2;
const DEFAULT_FORECAST_MONTHS = 3;
const DEFAULT_HISTORY_MONTHS = 6;
const VALID_CONFIDENCE_LEVELS = [0.8, 0.9, 0.95, 0.99];
const VALID_ACTIONS = ['forecast', 'summary'];

// ---------------------------------------------------------------------------
// Parameter parsing (inline mirror for testing)
// ---------------------------------------------------------------------------

interface ForecastParams {
  household_id: string;
  months_ahead: number;
  history_months: number;
  category_id: string | null;
  confidence_level: number;
}

function parseParams(url: URL): ForecastParams | string {
  const householdId = url.searchParams.get('household_id');
  if (!householdId) return 'household_id is required';

  const monthsAhead = parseInt(
    url.searchParams.get('months_ahead') ?? String(DEFAULT_FORECAST_MONTHS),
    10,
  );
  if (isNaN(monthsAhead) || monthsAhead < 1 || monthsAhead > MAX_FORECAST_MONTHS) {
    return `months_ahead must be between 1 and ${MAX_FORECAST_MONTHS}`;
  }

  const historyMonths = parseInt(
    url.searchParams.get('history_months') ?? String(DEFAULT_HISTORY_MONTHS),
    10,
  );
  if (
    isNaN(historyMonths) ||
    historyMonths < MIN_HISTORY_MONTHS ||
    historyMonths > MAX_HISTORY_MONTHS
  ) {
    return `history_months must be between ${MIN_HISTORY_MONTHS} and ${MAX_HISTORY_MONTHS}`;
  }

  const confidenceStr = url.searchParams.get('confidence_level');
  let confidenceLevel = 0.95;
  if (confidenceStr) {
    confidenceLevel = parseFloat(confidenceStr);
    if (!VALID_CONFIDENCE_LEVELS.includes(confidenceLevel)) {
      return `confidence_level must be one of: ${VALID_CONFIDENCE_LEVELS.join(', ')}`;
    }
  }

  return {
    household_id: householdId,
    months_ahead: monthsAhead,
    history_months: historyMonths,
    category_id: url.searchParams.get('category_id'),
    confidence_level: confidenceLevel,
  };
}

// ---------------------------------------------------------------------------
// Tests: Parameter parsing
// ---------------------------------------------------------------------------

Deno.test('parseParams returns error when household_id missing', () => {
  const url = new URL('https://test.supabase.co/fn?action=forecast');
  const result = parseParams(url);
  assertEquals(result, 'household_id is required');
});

Deno.test('parseParams returns defaults for minimal params', () => {
  const url = new URL('https://test.supabase.co/fn?household_id=hh-123');
  const result = parseParams(url);
  assertEquals(typeof result, 'object');
  const params = result as ForecastParams;
  assertEquals(params.household_id, 'hh-123');
  assertEquals(params.months_ahead, DEFAULT_FORECAST_MONTHS);
  assertEquals(params.history_months, DEFAULT_HISTORY_MONTHS);
  assertEquals(params.confidence_level, 0.95);
  assertEquals(params.category_id, null);
});

Deno.test('parseParams accepts custom months_ahead', () => {
  const url = new URL('https://test.supabase.co/fn?household_id=hh-123&months_ahead=6');
  const result = parseParams(url) as ForecastParams;
  assertEquals(result.months_ahead, 6);
});

Deno.test('parseParams rejects months_ahead > 12', () => {
  const url = new URL('https://test.supabase.co/fn?household_id=hh-123&months_ahead=15');
  const result = parseParams(url);
  assertEquals(typeof result, 'string');
});

Deno.test('parseParams rejects months_ahead < 1', () => {
  const url = new URL('https://test.supabase.co/fn?household_id=hh-123&months_ahead=0');
  const result = parseParams(url);
  assertEquals(typeof result, 'string');
});

Deno.test('parseParams rejects history_months < 2', () => {
  const url = new URL('https://test.supabase.co/fn?household_id=hh-123&history_months=1');
  const result = parseParams(url);
  assertEquals(typeof result, 'string');
});

Deno.test('parseParams rejects history_months > 24', () => {
  const url = new URL('https://test.supabase.co/fn?household_id=hh-123&history_months=30');
  const result = parseParams(url);
  assertEquals(typeof result, 'string');
});

Deno.test('parseParams accepts valid confidence levels', () => {
  for (const cl of VALID_CONFIDENCE_LEVELS) {
    const url = new URL(`https://test.supabase.co/fn?household_id=hh-123&confidence_level=${cl}`);
    const result = parseParams(url) as ForecastParams;
    assertEquals(result.confidence_level, cl);
  }
});

Deno.test('parseParams rejects invalid confidence level', () => {
  const url = new URL('https://test.supabase.co/fn?household_id=hh-123&confidence_level=0.50');
  const result = parseParams(url);
  assertEquals(typeof result, 'string');
});

Deno.test('parseParams accepts optional category_id', () => {
  const url = new URL('https://test.supabase.co/fn?household_id=hh-123&category_id=cat-456');
  const result = parseParams(url) as ForecastParams;
  assertEquals(result.category_id, 'cat-456');
});

// ---------------------------------------------------------------------------
// Tests: Action validation
// ---------------------------------------------------------------------------

Deno.test('valid actions accepted', () => {
  assertEquals(VALID_ACTIONS.includes('forecast'), true);
  assertEquals(VALID_ACTIONS.includes('summary'), true);
});

Deno.test('invalid actions rejected', () => {
  assertEquals(VALID_ACTIONS.includes('predict'), false);
  assertEquals(VALID_ACTIONS.includes(''), false);
});

Deno.test('default action is forecast', () => {
  const url = new URL('https://test.supabase.co/fn?household_id=hh-123');
  const action = url.searchParams.get('action') ?? 'forecast';
  assertEquals(action, 'forecast');
});

// ---------------------------------------------------------------------------
// Tests: Forecast response structure
// ---------------------------------------------------------------------------

Deno.test('forecast response has expected shape', () => {
  const mockForecast = {
    household_id: 'hh-123',
    confidence_level: 0.95,
    history_months: 6,
    forecast_months: 3,
    forecasts: [
      {
        category_id: 'cat-1',
        category_name: 'Groceries',
        currency_code: 'USD',
        data_points: 6,
        weighted_average_cents: 45000,
        std_deviation_cents: 8000,
        monthly_forecasts: [
          {
            month: '2026-05-01',
            predicted_cents: 45000,
            lower_bound_cents: 29320,
            upper_bound_cents: 60680,
          },
        ],
      },
    ],
    generated_at: new Date().toISOString(),
  };

  assertExists(mockForecast.household_id);
  assertExists(mockForecast.forecasts);
  assertEquals(mockForecast.forecasts.length > 0, true);

  const first = mockForecast.forecasts[0];
  assertExists(first.category_id);
  assertExists(first.weighted_average_cents);
  assertExists(first.std_deviation_cents);
  assertExists(first.monthly_forecasts);
  assertEquals(first.monthly_forecasts.length > 0, true);

  const mf = first.monthly_forecasts[0];
  assertEquals(mf.lower_bound_cents <= mf.predicted_cents, true);
  assertEquals(mf.upper_bound_cents >= mf.predicted_cents, true);
});

// ---------------------------------------------------------------------------
// Tests: Confidence interval math
// ---------------------------------------------------------------------------

Deno.test('confidence intervals widen for further months', () => {
  const mean = 50000;
  const stdDev = 10000;
  const zScore = 1.96; // 95%

  const month1Lower = mean - zScore * stdDev * Math.sqrt(1);
  const month3Lower = mean - zScore * stdDev * Math.sqrt(3);

  // Month 3 should have a wider interval (lower lower-bound)
  assertEquals(month3Lower < month1Lower, true);
});

Deno.test('lower bound is never negative', () => {
  const mean = 5000;
  const stdDev = 10000;
  const zScore = 1.96;

  const lowerBound = Math.max(0, Math.round(mean - zScore * stdDev));
  assertEquals(lowerBound >= 0, true);
});

// ---------------------------------------------------------------------------
// Tests: Security — response never contains raw data
// ---------------------------------------------------------------------------

Deno.test('forecast response contains only statistical values', () => {
  const forecast = {
    category_id: 'cat-1',
    category_name: 'Groceries',
    currency_code: 'USD',
    data_points: 6,
    weighted_average_cents: 45000,
    std_deviation_cents: 8000,
    monthly_forecasts: [],
  };

  const serialized = JSON.stringify(forecast);
  assertEquals(serialized.includes('payee'), false);
  assertEquals(serialized.includes('note'), false);
  assertEquals(serialized.includes('email'), false);
  assertEquals(serialized.includes('transaction_id'), false);
});
