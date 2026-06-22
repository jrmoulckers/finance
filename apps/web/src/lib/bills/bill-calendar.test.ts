// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildBillCalendar,
  expandBillOccurrences,
  generatePaydays,
  type PaydaySchedule,
} from './bill-calendar';
import type { Bill, BillFrequency, BillStatus } from '../../kmp/bridge';

// ---------------------------------------------------------------------------
// Test factories
// ---------------------------------------------------------------------------

const SYNC_METADATA = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as const;

function makeBill(overrides: {
  id?: string;
  name?: string;
  payee?: string;
  amountCents: number;
  dueDate: string;
  frequency?: BillFrequency;
  status?: BillStatus;
  isAutoPay?: boolean;
}): Bill {
  return {
    ...SYNC_METADATA,
    id: overrides.id ?? `bill-${overrides.dueDate}-${overrides.amountCents}`,
    householdId: 'h1',
    name: overrides.name ?? 'Bill',
    payee: overrides.payee ?? 'Payee',
    amount: { amount: overrides.amountCents },
    currency: { code: 'USD', decimalPlaces: 2 },
    dueDate: overrides.dueDate,
    frequency: overrides.frequency ?? 'MONTHLY',
    status: overrides.status ?? 'UPCOMING',
    categoryId: null,
    accountId: null,
    note: null,
    isAutoPay: overrides.isAutoPay ?? false,
    reminderDaysBefore: 3,
    lastPaidDate: null,
  };
}

// ---------------------------------------------------------------------------
// generatePaydays
// ---------------------------------------------------------------------------

describe('generatePaydays', () => {
  it('generates biweekly paydays anchored to a known payday', () => {
    const schedule: PaydaySchedule = {
      cadence: 'BIWEEKLY',
      anchorDate: '2025-01-03', // a Friday payday
      expectedIncomeCents: 200_000,
    };
    // from a date mid-cycle; most recent payday on/before is 2025-01-17.
    const paydays = generatePaydays(schedule, '2025-01-20', 4);
    expect(paydays).toEqual(['2025-01-17', '2025-01-31', '2025-02-14', '2025-02-28']);
  });

  it('returns the anchor itself when fromDate equals a payday', () => {
    const schedule: PaydaySchedule = {
      cadence: 'BIWEEKLY',
      anchorDate: '2025-01-03',
      expectedIncomeCents: 200_000,
    };
    const paydays = generatePaydays(schedule, '2025-01-31', 2);
    expect(paydays).toEqual(['2025-01-31', '2025-02-14']);
  });

  it('handles a future anchor date by stepping backwards', () => {
    const schedule: PaydaySchedule = {
      cadence: 'WEEKLY',
      anchorDate: '2025-02-07',
      expectedIncomeCents: 100_000,
    };
    const paydays = generatePaydays(schedule, '2025-01-20', 3);
    // most recent weekly payday on/before 2025-01-20 is 2025-01-17.
    expect(paydays).toEqual(['2025-01-17', '2025-01-24', '2025-01-31']);
  });

  it('generates semi-monthly paydays on the 15th and last day of the month', () => {
    const schedule: PaydaySchedule = {
      cadence: 'SEMI_MONTHLY',
      anchorDate: '2025-01-15',
      expectedIncomeCents: 150_000,
    };
    const paydays = generatePaydays(schedule, '2025-02-10', 4);
    expect(paydays).toEqual(['2025-01-31', '2025-02-15', '2025-02-28', '2025-03-15']);
  });

  it('generates monthly paydays clamped to the last valid day for short months', () => {
    const schedule: PaydaySchedule = {
      cadence: 'MONTHLY',
      anchorDate: '2025-01-31',
      expectedIncomeCents: 300_000,
    };
    const paydays = generatePaydays(schedule, '2025-01-31', 4);
    // Feb clamps to the 28th, March returns to the 31st (no drift).
    expect(paydays).toEqual(['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30']);
  });
});

// ---------------------------------------------------------------------------
// expandBillOccurrences
// ---------------------------------------------------------------------------

describe('expandBillOccurrences', () => {
  it('expands a monthly bill into one occurrence per month in the window', () => {
    const bill = makeBill({ amountCents: 5_000, dueDate: '2025-01-10', frequency: 'MONTHLY' });
    const occ = expandBillOccurrences([bill], '2025-01-01', '2025-04-01');
    expect(occ.map((o) => o.dueDate)).toEqual(['2025-01-10', '2025-02-10', '2025-03-10']);
  });

  it('keeps a one-time bill only when it falls inside the window', () => {
    const inside = makeBill({ amountCents: 1_000, dueDate: '2025-01-15', frequency: 'ONE_TIME' });
    const outside = makeBill({ amountCents: 1_000, dueDate: '2025-05-15', frequency: 'ONE_TIME' });
    const occ = expandBillOccurrences([inside, outside], '2025-01-01', '2025-04-01');
    expect(occ).toHaveLength(1);
    expect(occ[0].dueDate).toBe('2025-01-15');
  });

  it('excludes PAID and CANCELLED bills', () => {
    const paid = makeBill({ amountCents: 1_000, dueDate: '2025-01-10', status: 'PAID' });
    const cancelled = makeBill({ amountCents: 1_000, dueDate: '2025-01-10', status: 'CANCELLED' });
    const active = makeBill({ amountCents: 1_000, dueDate: '2025-01-10', status: 'UPCOMING' });
    const occ = expandBillOccurrences([paid, cancelled, active], '2025-01-01', '2025-02-01');
    expect(occ).toHaveLength(1);
    expect(occ[0].billId).toBe(active.id);
  });

  it('expands weekly bills every 7 days from the base due date', () => {
    const bill = makeBill({ amountCents: 1_200, dueDate: '2025-01-02', frequency: 'WEEKLY' });
    const occ = expandBillOccurrences([bill], '2025-01-01', '2025-01-30');
    expect(occ.map((o) => o.dueDate)).toEqual([
      '2025-01-02',
      '2025-01-09',
      '2025-01-16',
      '2025-01-23',
    ]);
  });
});

// ---------------------------------------------------------------------------
// buildBillCalendar — bucketing + totals + coverage
// ---------------------------------------------------------------------------

describe('buildBillCalendar', () => {
  const biweekly: PaydaySchedule = {
    cadence: 'BIWEEKLY',
    anchorDate: '2025-01-03',
    expectedIncomeCents: 200_000,
  };

  it('buckets bills into the correct biweekly pay period', () => {
    const bills = [
      // due 2025-01-20 -> period [2025-01-17, 2025-01-31)
      makeBill({
        name: 'Rent',
        amountCents: 120_000,
        dueDate: '2025-01-20',
        frequency: 'ONE_TIME',
      }),
      // due 2025-02-01 -> period [2025-01-31, 2025-02-14)
      makeBill({
        name: 'Internet',
        amountCents: 8_000,
        dueDate: '2025-02-01',
        frequency: 'ONE_TIME',
      }),
    ];
    const calendar = buildBillCalendar({
      bills,
      schedule: biweekly,
      fromDate: '2025-01-20',
      periodsToShow: 3,
    });

    expect(calendar.periods.map((p) => p.paydayDate)).toEqual([
      '2025-01-17',
      '2025-01-31',
      '2025-02-14',
    ]);
    expect(calendar.periods[0].bills.map((b) => b.name)).toEqual(['Rent']);
    expect(calendar.periods[1].bills.map((b) => b.name)).toEqual(['Internet']);
    expect(calendar.periods[2].bills).toHaveLength(0);
  });

  it('computes the total due before each payday', () => {
    const bills = [
      makeBill({ amountCents: 50_000, dueDate: '2025-01-20', frequency: 'ONE_TIME' }),
      makeBill({ amountCents: 25_000, dueDate: '2025-01-28', frequency: 'ONE_TIME' }),
    ];
    const calendar = buildBillCalendar({
      bills,
      schedule: biweekly,
      fromDate: '2025-01-20',
      periodsToShow: 1,
    });
    expect(calendar.periods[0].totalDueCents).toBe(75_000);
    expect(calendar.totalDueCents).toBe(75_000);
  });

  it('flags a covered period and reports the surplus', () => {
    const bills = [
      makeBill({ amountCents: 120_000, dueDate: '2025-01-20', frequency: 'ONE_TIME' }),
    ];
    const calendar = buildBillCalendar({
      bills,
      schedule: biweekly,
      fromDate: '2025-01-20',
      periodsToShow: 1,
    });
    expect(calendar.periods[0].covered).toBe(true);
    expect(calendar.periods[0].coverageCents).toBe(80_000); // 200000 - 120000
  });

  it('flags a shortfall when bills exceed expected income', () => {
    const bills = [
      makeBill({ amountCents: 180_000, dueDate: '2025-01-20', frequency: 'ONE_TIME' }),
      makeBill({ amountCents: 60_000, dueDate: '2025-01-25', frequency: 'ONE_TIME' }),
    ];
    const calendar = buildBillCalendar({
      bills,
      schedule: biweekly,
      fromDate: '2025-01-20',
      periodsToShow: 1,
    });
    expect(calendar.periods[0].covered).toBe(false);
    expect(calendar.periods[0].coverageCents).toBe(-40_000); // 200000 - 240000
  });

  it('spreads a recurring monthly bill across multiple pay periods', () => {
    const bills = [
      makeBill({ name: 'Phone', amountCents: 9_000, dueDate: '2025-01-18', frequency: 'MONTHLY' }),
    ];
    const calendar = buildBillCalendar({
      bills,
      schedule: biweekly,
      fromDate: '2025-01-17',
      periodsToShow: 3,
    });
    // 2025-01-18 -> period 0 [01-17,01-31); 2025-02-18 -> period 2 [02-14,02-28).
    expect(calendar.periods[0].bills.map((b) => b.dueDate)).toEqual(['2025-01-18']);
    expect(calendar.periods[1].bills).toHaveLength(0);
    expect(calendar.periods[2].bills.map((b) => b.dueDate)).toEqual(['2025-02-18']);
  });

  it('buckets bills into semi-monthly pay periods', () => {
    const semiMonthly: PaydaySchedule = {
      cadence: 'SEMI_MONTHLY',
      anchorDate: '2025-01-15',
      expectedIncomeCents: 150_000,
    };
    const bills = [
      // due 2025-02-05 -> period [2025-01-31, 2025-02-15)
      makeBill({ name: 'Car', amountCents: 40_000, dueDate: '2025-02-05', frequency: 'ONE_TIME' }),
      // due 2025-02-20 -> period [2025-02-15, 2025-02-28)
      makeBill({ name: 'Gym', amountCents: 5_000, dueDate: '2025-02-20', frequency: 'ONE_TIME' }),
    ];
    const calendar = buildBillCalendar({
      bills,
      schedule: semiMonthly,
      fromDate: '2025-02-01',
      periodsToShow: 2,
    });
    expect(calendar.periods.map((p) => p.paydayDate)).toEqual(['2025-01-31', '2025-02-15']);
    expect(calendar.periods[0].bills.map((b) => b.name)).toEqual(['Car']);
    expect(calendar.periods[1].bills.map((b) => b.name)).toEqual(['Gym']);
  });

  it('buckets bills into monthly pay periods and totals income across periods', () => {
    const monthly: PaydaySchedule = {
      cadence: 'MONTHLY',
      anchorDate: '2025-01-01',
      expectedIncomeCents: 300_000,
    };
    const bills = [
      makeBill({ name: 'Rent', amountCents: 150_000, dueDate: '2025-01-05', frequency: 'MONTHLY' }),
    ];
    const calendar = buildBillCalendar({
      bills,
      schedule: monthly,
      fromDate: '2025-01-03',
      periodsToShow: 2,
    });
    expect(calendar.periods.map((p) => p.paydayDate)).toEqual(['2025-01-01', '2025-02-01']);
    expect(calendar.periods[0].bills.map((b) => b.dueDate)).toEqual(['2025-01-05']);
    expect(calendar.periods[1].bills.map((b) => b.dueDate)).toEqual(['2025-02-05']);
    expect(calendar.totalIncomeCents).toBe(600_000);
    expect(calendar.totalDueCents).toBe(300_000);
    expect(calendar.totalCoverageCents).toBe(300_000);
  });

  it('orders bills within a period by due date then name', () => {
    const bills = [
      makeBill({ name: 'Zebra', amountCents: 1_000, dueDate: '2025-01-25', frequency: 'ONE_TIME' }),
      makeBill({ name: 'Apple', amountCents: 1_000, dueDate: '2025-01-20', frequency: 'ONE_TIME' }),
      makeBill({ name: 'Beta', amountCents: 1_000, dueDate: '2025-01-20', frequency: 'ONE_TIME' }),
    ];
    const calendar = buildBillCalendar({
      bills,
      schedule: biweekly,
      fromDate: '2025-01-17',
      periodsToShow: 1,
    });
    expect(calendar.periods[0].bills.map((b) => b.name)).toEqual(['Apple', 'Beta', 'Zebra']);
  });

  it('returns empty periods when there are no bills', () => {
    const calendar = buildBillCalendar({
      bills: [],
      schedule: biweekly,
      fromDate: '2025-01-20',
      periodsToShow: 3,
    });
    expect(calendar.periods).toHaveLength(3);
    expect(calendar.totalDueCents).toBe(0);
    expect(calendar.periods.every((p) => p.covered)).toBe(true);
  });
});
