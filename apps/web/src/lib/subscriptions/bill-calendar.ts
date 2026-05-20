// SPDX-License-Identifier: BUSL-1.1

/**
 * Bill calendar and upcoming bills engine.
 *
 * Generates upcoming bills for configurable windows (30/60/90 days),
 * calculates weekly bill density, cash flow impact per week, and
 * detects overdue bills.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issues #1629, #1619
 */

import type {
  BillCalendar,
  BillingCycle,
  CashFlowImpact,
  Subscription,
  SubscriptionCategory,
  UpcomingBill,
  WeeklyBillDensity,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Milliseconds per day. */
const MS_PER_DAY = 86_400_000;

/** Days per week. */
const DAYS_PER_WEEK = 7;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Returns the number of calendar days between two ISO date strings.
 *
 * Uses UTC to avoid timezone-related shifts.
 *
 * @param start - Start date (ISO string).
 * @param end - End date (ISO string).
 * @returns Number of days (positive when end > start).
 */
function daysBetween(start: string, end: string): number {
  return Math.floor(
    (new Date(end + 'T00:00:00Z').getTime() - new Date(start + 'T00:00:00Z').getTime()) /
      MS_PER_DAY,
  );
}

/**
 * Adds days to an ISO date string.
 *
 * Uses UTC to avoid timezone-related date shifts.
 *
 * @param dateStr - Base date.
 * @param days - Days to add.
 * @returns New ISO date string.
 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the Monday (start of ISO week) for a given date.
 *
 * Uses UTC to avoid timezone-related day shifts.
 *
 * @param dateStr - ISO date string.
 * @returns ISO date string for that week's Monday.
 */
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  // Sunday = 0, Monday = 1 … Saturday = 6
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Billing date projection
// ---------------------------------------------------------------------------

/**
 * Returns the interval in days for a billing cycle.
 *
 * For monthly/quarterly/annual cycles we approximate with 30/91/365 days
 * since we're projecting future bills, not tracking exact calendar dates.
 *
 * @param cycle - Billing frequency.
 * @returns Approximate interval in days.
 */
function billingIntervalDays(cycle: BillingCycle): number {
  switch (cycle) {
    case 'weekly':
      return 7;
    case 'biweekly':
      return 14;
    case 'monthly':
      return 30;
    case 'quarterly':
      return 91;
    case 'annual':
      return 365;
  }
}

/**
 * Projects all billing dates for a subscription within a date window.
 *
 * Starts from the subscription's next billing date and repeats at
 * the billing interval. Also includes past-due dates that fall before
 * `windowStart` but after the most recent billing date.
 *
 * @param subscription - The subscription to project.
 * @param windowStart - Window start date (ISO string, usually "today").
 * @param windowEnd - Window end date (ISO string).
 * @returns Array of ISO date strings for projected billing dates.
 */
export function projectBillingDates(
  subscription: Subscription,
  windowStart: string,
  windowEnd: string,
): readonly string[] {
  if (subscription.status === 'cancelled' || subscription.status === 'expired') {
    return [];
  }

  const interval = billingIntervalDays(subscription.billingCycle);
  const dates: string[] = [];
  let current = subscription.nextBillingDate;

  // Walk backward if next billing date is in the future but we need overdue detection
  const startMs = new Date(windowStart + 'T00:00:00Z').getTime();

  // Walk forward collecting dates in the window
  const endMs = new Date(windowEnd + 'T00:00:00Z').getTime();

  // Handle overdue: if nextBillingDate < windowStart, it's overdue — include it
  if (new Date(current + 'T00:00:00Z').getTime() < startMs) {
    dates.push(current);
    // Advance past windowStart
    while (new Date(current + 'T00:00:00Z').getTime() < startMs) {
      current = addDays(current, interval);
    }
  }

  // Collect future dates within the window
  while (new Date(current + 'T00:00:00Z').getTime() <= endMs) {
    dates.push(current);
    current = addDays(current, interval);
  }

  return dates;
}

// ---------------------------------------------------------------------------
// Upcoming bill generation
// ---------------------------------------------------------------------------

/**
 * Generates upcoming bill entries for a single subscription.
 *
 * @param subscription - The subscription to analyze.
 * @param today - Current date (ISO string).
 * @param windowDays - Number of days to look ahead.
 * @returns Array of upcoming bill entries.
 */
export function generateBillsForSubscription(
  subscription: Subscription,
  today: string,
  windowDays: number,
): readonly UpcomingBill[] {
  const windowEnd = addDays(today, windowDays);
  const dates = projectBillingDates(subscription, today, windowEnd);

  return dates.map((dueDate) => {
    const daysUntilDue = daysBetween(today, dueDate);
    return {
      subscriptionId: subscription.id,
      subscriptionName: subscription.name,
      dueDate,
      amountCents: subscription.priceCents,
      category: subscription.category,
      isOverdue: daysUntilDue < 0,
      daysUntilDue,
    };
  });
}

/**
 * Generates all upcoming bills for multiple subscriptions.
 *
 * Results are sorted by due date (earliest first).
 *
 * @param subscriptions - Subscriptions to analyze.
 * @param today - Current date (ISO string).
 * @param windowDays - Number of days to look ahead (30, 60, or 90).
 * @returns Sorted array of upcoming bills.
 */
export function generateAllUpcomingBills(
  subscriptions: readonly Subscription[],
  today: string,
  windowDays: number,
): readonly UpcomingBill[] {
  const bills: UpcomingBill[] = [];
  for (const sub of subscriptions) {
    bills.push(...generateBillsForSubscription(sub, today, windowDays));
  }
  return bills.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
}

// ---------------------------------------------------------------------------
// Weekly density
// ---------------------------------------------------------------------------

/**
 * Calculates weekly bill density from a list of upcoming bills.
 *
 * Groups bills by ISO week (Monday–Sunday) and sums the totals.
 *
 * @param bills - Upcoming bills to analyze.
 * @returns Array of weekly density summaries.
 */
export function calculateWeeklyDensity(
  bills: readonly UpcomingBill[],
): readonly WeeklyBillDensity[] {
  const weekMap = new Map<string, { count: number; totalCents: number }>();

  for (const bill of bills) {
    const weekStart = getWeekStart(bill.dueDate);
    const existing = weekMap.get(weekStart) ?? { count: 0, totalCents: 0 };
    weekMap.set(weekStart, {
      count: existing.count + 1,
      totalCents: existing.totalCents + bill.amountCents,
    });
  }

  return [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, data]) => ({
      weekStart,
      weekEnd: addDays(weekStart, DAYS_PER_WEEK - 1),
      billCount: data.count,
      totalAmountCents: data.totalCents,
    }));
}

// ---------------------------------------------------------------------------
// Cash flow impact
// ---------------------------------------------------------------------------

/**
 * Calculates weekly cash flow impact from subscription bills.
 *
 * @param bills - Upcoming bills to analyze.
 * @returns Array of weekly cash flow impacts with category breakdowns.
 */
export function calculateCashFlowImpact(bills: readonly UpcomingBill[]): readonly CashFlowImpact[] {
  const weekMap = new Map<
    string,
    { totalCents: number; byCategory: Map<SubscriptionCategory, number> }
  >();

  for (const bill of bills) {
    const weekStart = getWeekStart(bill.dueDate);
    const existing = weekMap.get(weekStart) ?? {
      totalCents: 0,
      byCategory: new Map<SubscriptionCategory, number>(),
    };

    existing.totalCents += bill.amountCents;
    existing.byCategory.set(
      bill.category,
      (existing.byCategory.get(bill.category) ?? 0) + bill.amountCents,
    );
    weekMap.set(weekStart, existing);
  }

  return [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, data]) => ({
      periodStart: weekStart,
      periodEnd: addDays(weekStart, DAYS_PER_WEEK - 1),
      totalOutflowCents: data.totalCents,
      byCategory: new Map(data.byCategory),
    }));
}

// ---------------------------------------------------------------------------
// Full calendar builder
// ---------------------------------------------------------------------------

/**
 * Builds a complete bill calendar for a set of subscriptions.
 *
 * Includes upcoming bills, weekly density, overdue detection, and
 * cash flow impact.
 *
 * @param subscriptions - Subscriptions to analyze.
 * @param today - Current date (ISO string).
 * @param windowDays - Number of days to look ahead (default: 30).
 * @returns Complete bill calendar.
 */
export function buildBillCalendar(
  subscriptions: readonly Subscription[],
  today: string,
  windowDays: number = 30,
): BillCalendar {
  const upcomingBills = generateAllUpcomingBills(subscriptions, today, windowDays);
  const weeklyDensity = calculateWeeklyDensity(upcomingBills);
  const cashFlowByWeek = calculateCashFlowImpact(upcomingBills);

  const totalAmountCents = upcomingBills.reduce((sum, b) => sum + b.amountCents, 0);
  const overdueCount = upcomingBills.filter((b) => b.isOverdue).length;

  return {
    upcomingBills,
    weeklyDensity,
    totalAmountCents,
    overdueCount,
    cashFlowByWeek,
  };
}
