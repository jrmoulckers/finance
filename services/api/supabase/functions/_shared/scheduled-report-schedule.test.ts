// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for `_shared/scheduled-report-schedule.ts` (#2626).
 *
 * Verifies cron next-run resolution for the fixed-time daily/weekly/monthly
 * schedules the app emits, plus the retry backoff logic.
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import {
  computeNextRunAt,
  nextRetryAt,
  parseCron,
  retryDelaySeconds,
  shouldRetry,
} from './scheduled-report-schedule.ts';

Deno.test('parseCron returns null for malformed expressions', () => {
  assertEquals(parseCron('* * *'), null);
  assertEquals(parseCron(''), null);
});

Deno.test('computeNextRunAt resolves a daily 09:00 schedule', () => {
  // 08:30 UTC → next 09:00 same day.
  const from = new Date('2026-04-01T08:30:00.000Z');
  const next = computeNextRunAt('0 9 * * *', from);
  assertEquals(next?.toISOString(), '2026-04-01T09:00:00.000Z');
});

Deno.test('computeNextRunAt rolls to the next day when past the time', () => {
  const from = new Date('2026-04-01T10:00:00.000Z');
  const next = computeNextRunAt('0 9 * * *', from);
  assertEquals(next?.toISOString(), '2026-04-02T09:00:00.000Z');
});

Deno.test('computeNextRunAt resolves a weekly Monday schedule', () => {
  // 2026-04-01 is a Wednesday; next Monday is 2026-04-06.
  const from = new Date('2026-04-01T12:00:00.000Z');
  const next = computeNextRunAt('0 8 * * 1', from);
  assertEquals(next?.toISOString(), '2026-04-06T08:00:00.000Z');
});

Deno.test('computeNextRunAt resolves a monthly day-1 schedule', () => {
  const from = new Date('2026-04-02T00:00:00.000Z');
  const next = computeNextRunAt('30 6 1 * *', from);
  assertEquals(next?.toISOString(), '2026-05-01T06:30:00.000Z');
});

Deno.test('computeNextRunAt returns null for unparseable cron', () => {
  assertEquals(computeNextRunAt('not-a-cron', new Date()), null);
});

Deno.test('retryDelaySeconds uses capped exponential backoff', () => {
  assertEquals(retryDelaySeconds(1), 300);
  assertEquals(retryDelaySeconds(2), 600);
  assertEquals(retryDelaySeconds(3), 1200);
  assertEquals(retryDelaySeconds(10), 3600); // capped at 1 hour
});

Deno.test('shouldRetry respects the max-retries ceiling', () => {
  assertEquals(shouldRetry(0, 3), true);
  assertEquals(shouldRetry(3, 3), false);
});

Deno.test('nextRetryAt returns null once retries are exhausted', () => {
  const from = new Date('2026-04-01T00:00:00.000Z');
  assertEquals(nextRetryAt(3, 3, from), null);
  const scheduled = nextRetryAt(0, 3, from);
  assertEquals(scheduled?.toISOString(), '2026-04-01T00:05:00.000Z');
});
