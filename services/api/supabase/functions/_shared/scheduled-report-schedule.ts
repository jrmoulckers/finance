// SPDX-License-Identifier: BUSL-1.1

/**
 * Scheduled-report scheduling helpers (#2626).
 *
 * Pure, dependency-free utilities the process-scheduled-reports Edge Function
 * uses to decide when a schedule next runs and how failed deliveries retry.
 * Kept free of Deno / network imports so the logic is unit-testable in
 * isolation.
 *
 * `scheduled_reports.cron_expression` is a standard 5-field cron string
 * (minute hour day-of-month month day-of-week). The app currently emits
 * fixed-time daily / weekly / monthly schedules, so this evaluator supports
 * `*`, single integers, and comma lists for each field and finds the next
 * matching instant via a bounded minute-by-minute search.
 */

/** Exponential-backoff base delay (seconds) between failed delivery retries. */
export const RETRY_BASE_DELAY_SECONDS = 300; // 5 minutes

/** Upper bound on the forward search window when resolving the next run. */
const MAX_LOOKAHEAD_MINUTES = 366 * 24 * 60;

interface CronFields {
  minutes: (n: number) => boolean;
  hours: (n: number) => boolean;
  daysOfMonth: (n: number) => boolean;
  months: (n: number) => boolean;
  daysOfWeek: (n: number) => boolean;
}

function matcherFor(field: string, min: number, max: number): (n: number) => boolean {
  const trimmed = field.trim();
  if (trimmed === '*') {
    return () => true;
  }
  const allowed = new Set<number>();
  for (const part of trimmed.split(',')) {
    const value = Number(part);
    if (!Number.isInteger(value) || value < min || value > max) {
      // Unsupported token (ranges/steps) — treat conservatively as "matches",
      // so the scheduler still advances rather than stalling forever.
      return () => true;
    }
    allowed.add(value);
  }
  return (n: number) => allowed.has(n);
}

/**
 * Parse a 5-field cron expression into field matchers. Returns `null` when the
 * expression does not have exactly five fields.
 */
export function parseCron(expression: string): CronFields | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return null;
  }
  const [minute, hour, dom, month, dow] = fields;
  return {
    minutes: matcherFor(minute, 0, 59),
    hours: matcherFor(hour, 0, 23),
    daysOfMonth: matcherFor(dom, 1, 31),
    months: matcherFor(month, 1, 12),
    // Support both 0 and 7 as Sunday.
    daysOfWeek: (n: number) => matcherFor(dow, 0, 7)(n) || (n === 0 && matcherFor(dow, 0, 7)(7)),
  };
}

/**
 * Compute the next UTC run time strictly after `from` for the given cron
 * expression. Returns `null` when the expression is unparseable or no match is
 * found within the lookahead window.
 */
export function computeNextRunAt(cronExpression: string, from: Date): Date | null {
  const cron = parseCron(cronExpression);
  if (!cron) {
    return null;
  }

  // Start at the next whole minute after `from`.
  const cursor = new Date(from.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  for (let i = 0; i < MAX_LOOKAHEAD_MINUTES; i += 1) {
    const minute = cursor.getUTCMinutes();
    const hour = cursor.getUTCHours();
    const dom = cursor.getUTCDate();
    const month = cursor.getUTCMonth() + 1;
    const dow = cursor.getUTCDay();

    if (
      cron.minutes(minute) &&
      cron.hours(hour) &&
      cron.months(month) &&
      cron.daysOfMonth(dom) &&
      cron.daysOfWeek(dow)
    ) {
      return new Date(cursor.getTime());
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }

  return null;
}

/**
 * Delay (seconds) before the next retry of a failed delivery, using capped
 * exponential backoff: 5m, 10m, 20m, ... up to 1 hour.
 */
export function retryDelaySeconds(attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  const delay = RETRY_BASE_DELAY_SECONDS * 2 ** exponent;
  return Math.min(delay, 3600);
}

/** Whether another delivery attempt should be scheduled. */
export function shouldRetry(retryCount: number, maxRetries: number): boolean {
  return retryCount < maxRetries;
}

/**
 * Resolve the next `next_retry_at` for a failed delivery, or `null` when the
 * schedule has exhausted its retries.
 */
export function nextRetryAt(retryCount: number, maxRetries: number, from: Date): Date | null {
  if (!shouldRetry(retryCount, maxRetries)) {
    return null;
  }
  return new Date(from.getTime() + retryDelaySeconds(retryCount + 1) * 1000);
}
