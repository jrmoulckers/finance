// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the bill calendar engine.
 *
 * Covers: billing date projection, single/multi subscription bill
 * generation, weekly density, cash flow impact, overdue detection,
 * and full calendar building.
 *
 * Edge cases: cancelled subscriptions, overdue bills, weekly billing,
 * empty subscription list, zero-cost bills.
 *
 * References: issues #1629, #1619
 */

import { describe, expect, it } from 'vitest';
import {
  buildBillCalendar,
  calculateCashFlowImpact,
  calculateWeeklyDensity,
  generateAllUpcomingBills,
  generateBillsForSubscription,
  projectBillingDates,
} from './bill-calendar';
import type { Subscription } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    name: 'StreamService',
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

// ---------------------------------------------------------------------------
// projectBillingDates
// ---------------------------------------------------------------------------

describe('projectBillingDates', () => {
  it('projects monthly bills within a 90-day window', () => {
    const sub = makeSub({ nextBillingDate: '2025-02-01' });
    const dates = projectBillingDates(sub, '2025-01-15', '2025-04-15');

    // Should include Feb 1, Mar 3, Apr 2 (approx 30-day intervals)
    expect(dates.length).toBeGreaterThanOrEqual(2);
    expect(dates[0]).toBe('2025-02-01');
  });

  it('returns empty for cancelled subscriptions', () => {
    const sub = makeSub({ status: 'cancelled' });
    expect(projectBillingDates(sub, '2025-01-15', '2025-04-15')).toHaveLength(0);
  });

  it('returns empty for expired subscriptions', () => {
    const sub = makeSub({ status: 'expired' });
    expect(projectBillingDates(sub, '2025-01-15', '2025-04-15')).toHaveLength(0);
  });

  it('includes overdue billing dates', () => {
    const sub = makeSub({ nextBillingDate: '2025-01-01' }); // Past due
    const dates = projectBillingDates(sub, '2025-01-15', '2025-04-15');

    expect(dates[0]).toBe('2025-01-01'); // Overdue date included
    expect(dates.length).toBeGreaterThanOrEqual(2);
  });

  it('handles weekly billing', () => {
    const sub = makeSub({
      billingCycle: 'weekly',
      nextBillingDate: '2025-01-06',
    });
    const dates = projectBillingDates(sub, '2025-01-06', '2025-02-03');

    // 4 weeks + start = about 4-5 dates
    expect(dates.length).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// generateBillsForSubscription
// ---------------------------------------------------------------------------

describe('generateBillsForSubscription', () => {
  it('generates bills with correct metadata', () => {
    const sub = makeSub({ nextBillingDate: '2025-02-01' });
    const bills = generateBillsForSubscription(sub, '2025-01-15', 30);

    expect(bills.length).toBeGreaterThanOrEqual(1);
    expect(bills[0].subscriptionId).toBe('sub-1');
    expect(bills[0].subscriptionName).toBe('StreamService');
    expect(bills[0].amountCents).toBe(1599);
    expect(bills[0].category).toBe('streaming');
  });

  it('marks overdue bills correctly', () => {
    const sub = makeSub({ nextBillingDate: '2025-01-01' });
    const bills = generateBillsForSubscription(sub, '2025-01-15', 30);

    const overdue = bills.filter((b) => b.isOverdue);
    expect(overdue.length).toBeGreaterThanOrEqual(1);
    expect(overdue[0].daysUntilDue).toBeLessThan(0);
  });

  it('calculates days until due correctly', () => {
    const sub = makeSub({ nextBillingDate: '2025-02-01' });
    const bills = generateBillsForSubscription(sub, '2025-01-15', 30);

    const feb1Bill = bills.find((b) => b.dueDate === '2025-02-01');
    expect(feb1Bill).toBeDefined();
    expect(feb1Bill!.daysUntilDue).toBe(17);
  });
});

// ---------------------------------------------------------------------------
// generateAllUpcomingBills
// ---------------------------------------------------------------------------

describe('generateAllUpcomingBills', () => {
  it('merges and sorts bills from multiple subscriptions', () => {
    const subs = [
      makeSub({ id: 'sub-1', nextBillingDate: '2025-02-15' }),
      makeSub({ id: 'sub-2', name: 'Other', nextBillingDate: '2025-02-01' }),
    ];

    const bills = generateAllUpcomingBills(subs, '2025-01-15', 60);
    expect(bills.length).toBeGreaterThanOrEqual(2);
    // Should be sorted by date
    for (let i = 1; i < bills.length; i++) {
      expect(new Date(bills[i].dueDate).getTime()).toBeGreaterThanOrEqual(
        new Date(bills[i - 1].dueDate).getTime(),
      );
    }
  });

  it('returns empty for empty subscription list', () => {
    expect(generateAllUpcomingBills([], '2025-01-15', 30)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// calculateWeeklyDensity
// ---------------------------------------------------------------------------

describe('calculateWeeklyDensity', () => {
  it('groups bills by week', () => {
    const bills = [
      {
        subscriptionId: 'sub-1',
        subscriptionName: 'A',
        dueDate: '2025-02-03', // Monday
        amountCents: 1000,
        category: 'streaming' as const,
        isOverdue: false,
        daysUntilDue: 10,
      },
      {
        subscriptionId: 'sub-2',
        subscriptionName: 'B',
        dueDate: '2025-02-05', // Wednesday same week
        amountCents: 500,
        category: 'software' as const,
        isOverdue: false,
        daysUntilDue: 12,
      },
      {
        subscriptionId: 'sub-3',
        subscriptionName: 'C',
        dueDate: '2025-02-10', // Next Monday
        amountCents: 800,
        category: 'gaming' as const,
        isOverdue: false,
        daysUntilDue: 17,
      },
    ];

    const density = calculateWeeklyDensity(bills);
    expect(density).toHaveLength(2);
    expect(density[0].billCount).toBe(2);
    expect(density[0].totalAmountCents).toBe(1500);
    expect(density[1].billCount).toBe(1);
    expect(density[1].totalAmountCents).toBe(800);
  });

  it('returns empty for no bills', () => {
    expect(calculateWeeklyDensity([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// calculateCashFlowImpact
// ---------------------------------------------------------------------------

describe('calculateCashFlowImpact', () => {
  it('calculates cash flow with category breakdown', () => {
    const bills = [
      {
        subscriptionId: 'sub-1',
        subscriptionName: 'A',
        dueDate: '2025-02-03',
        amountCents: 1000,
        category: 'streaming' as const,
        isOverdue: false,
        daysUntilDue: 10,
      },
      {
        subscriptionId: 'sub-2',
        subscriptionName: 'B',
        dueDate: '2025-02-04',
        amountCents: 500,
        category: 'streaming' as const,
        isOverdue: false,
        daysUntilDue: 11,
      },
    ];

    const impact = calculateCashFlowImpact(bills);
    expect(impact).toHaveLength(1);
    expect(impact[0].totalOutflowCents).toBe(1500);
    expect(impact[0].byCategory.get('streaming')).toBe(1500);
  });
});

// ---------------------------------------------------------------------------
// buildBillCalendar
// ---------------------------------------------------------------------------

describe('buildBillCalendar', () => {
  it('builds a complete calendar with all metadata', () => {
    const subs = [
      makeSub({ nextBillingDate: '2025-02-01' }),
      makeSub({
        id: 'sub-2',
        name: 'SoftTool',
        nextBillingDate: '2025-01-05',
        category: 'software',
      }),
    ];

    const calendar = buildBillCalendar(subs, '2025-01-15', 30);

    expect(calendar.upcomingBills.length).toBeGreaterThanOrEqual(1);
    expect(calendar.weeklyDensity.length).toBeGreaterThanOrEqual(1);
    expect(calendar.cashFlowByWeek.length).toBeGreaterThanOrEqual(1);
    expect(calendar.totalAmountCents).toBeGreaterThan(0);
  });

  it('detects overdue bills', () => {
    const subs = [makeSub({ nextBillingDate: '2025-01-01' })]; // Past due
    const calendar = buildBillCalendar(subs, '2025-01-15', 30);
    expect(calendar.overdueCount).toBeGreaterThanOrEqual(1);
  });

  it('defaults to 30-day window', () => {
    const subs = [makeSub({ nextBillingDate: '2025-02-01' })];
    const calendar = buildBillCalendar(subs, '2025-01-15');
    expect(calendar.upcomingBills.length).toBeGreaterThanOrEqual(1);
  });

  it('handles empty subscription list', () => {
    const calendar = buildBillCalendar([], '2025-01-15', 30);
    expect(calendar.upcomingBills).toHaveLength(0);
    expect(calendar.weeklyDensity).toHaveLength(0);
    expect(calendar.totalAmountCents).toBe(0);
    expect(calendar.overdueCount).toBe(0);
  });

  it('handles zero-cost subscriptions', () => {
    const subs = [makeSub({ priceCents: 0, nextBillingDate: '2025-02-01' })];
    const calendar = buildBillCalendar(subs, '2025-01-15', 30);
    expect(calendar.totalAmountCents).toBe(0);
  });
});
