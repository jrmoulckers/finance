// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { expandEventOccurrences, forecastCashRunway, type ScheduledCashEvent } from './cash-runway';

const TODAY = '2025-01-01';

function event(
  overrides: Partial<ScheduledCashEvent> & Pick<ScheduledCashEvent, 'id'>,
): ScheduledCashEvent {
  return {
    label: overrides.label ?? overrides.id,
    direction: 'outflow',
    amountCents: 0,
    date: TODAY,
    ...overrides,
  };
}

describe('expandEventOccurrences', () => {
  it('returns a single occurrence for one-time events in range', () => {
    const occurrences = expandEventOccurrences(
      event({ id: 'rent', direction: 'outflow', amountCents: 120000, date: '2025-01-10' }),
      TODAY,
      '2025-03-01',
    );

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      sourceId: 'rent',
      date: '2025-01-10',
      amountCents: -120000,
      direction: 'outflow',
    });
  });

  it('skips occurrences before the horizon start', () => {
    const occurrences = expandEventOccurrences(
      event({ id: 'old', amountCents: 5000, date: '2024-12-15' }),
      TODAY,
      '2025-03-01',
    );

    expect(occurrences).toHaveLength(0);
  });

  it('expands weekly recurrence into anchored occurrences within the horizon', () => {
    const occurrences = expandEventOccurrences(
      event({ id: 'payroll', amountCents: 50000, date: '2025-01-03', frequency: 'weekly' }),
      TODAY,
      '2025-01-31',
    );

    expect(occurrences.map((o) => o.date)).toEqual([
      '2025-01-03',
      '2025-01-10',
      '2025-01-17',
      '2025-01-24',
      '2025-01-31',
    ]);
  });

  it('expands monthly recurrence and clamps to month end', () => {
    const occurrences = expandEventOccurrences(
      event({ id: 'loan', amountCents: 30000, date: '2025-01-31', frequency: 'monthly' }),
      TODAY,
      '2025-04-30',
    );

    // Jan 31 → Feb 28 (clamped) → Mar 31 → Apr 30 (clamped).
    expect(occurrences.map((o) => o.date)).toEqual([
      '2025-01-31',
      '2025-02-28',
      '2025-03-31',
      '2025-04-30',
    ]);
  });

  it('signs inflows positive and outflows negative', () => {
    const [inflow] = expandEventOccurrences(
      event({ id: 'invoice', direction: 'inflow', amountCents: 90000, date: '2025-01-05' }),
      TODAY,
      '2025-02-01',
    );

    expect(inflow.amountCents).toBe(90000);
  });
});

describe('forecastCashRunway', () => {
  it('reports a healthy runway when cash never goes negative', () => {
    const forecast = forecastCashRunway({
      startingCashCents: 1_000_000,
      today: TODAY,
      horizonWeeks: 4,
      events: [
        event({ id: 'payroll', amountCents: 200000, date: '2025-01-15' }),
        event({ id: 'revenue', direction: 'inflow', amountCents: 300000, date: '2025-01-20' }),
      ],
    });

    expect(forecast.status).toBe('healthy');
    expect(forecast.shortfallDate).toBeNull();
    expect(forecast.runwayDays).toBeNull();
    expect(forecast.endingBalanceCents).toBe(1_100_000);
    expect(forecast.totalNetCents).toBe(100000);
  });

  it('detects the first date the balance goes negative', () => {
    const forecast = forecastCashRunway({
      startingCashCents: 250000,
      today: TODAY,
      horizonWeeks: 6,
      events: [
        event({ id: 'payroll', amountCents: 150000, date: '2025-01-10' }),
        event({ id: 'taxes', amountCents: 200000, date: '2025-01-20' }),
        event({ id: 'invoice', direction: 'inflow', amountCents: 400000, date: '2025-01-25' }),
      ],
    });

    expect(forecast.status).toBe('shortfall');
    // 250000 - 150000 = 100000 on the 10th; - 200000 = -100000 on the 20th.
    expect(forecast.shortfallDate).toBe('2025-01-20');
    expect(forecast.runwayDays).toBe(19);
  });

  it('nets multiple same-day events into a single timeline point', () => {
    const forecast = forecastCashRunway({
      startingCashCents: 500000,
      today: TODAY,
      horizonWeeks: 2,
      events: [
        event({ id: 'payroll', amountCents: 180000, date: '2025-01-08' }),
        event({ id: 'rent', amountCents: 120000, date: '2025-01-08' }),
        event({ id: 'client', direction: 'inflow', amountCents: 250000, date: '2025-01-08' }),
      ],
    });

    expect(forecast.timeline).toHaveLength(1);
    const [point] = forecast.timeline;
    expect(point.date).toBe('2025-01-08');
    expect(point.inflowCents).toBe(250000);
    expect(point.outflowCents).toBe(300000);
    expect(point.netChangeCents).toBe(-50000);
    expect(point.balanceCents).toBe(450000);
    expect(point.events).toHaveLength(3);
    // Outflows are ordered before inflows, larger magnitude first.
    expect(point.events.map((e) => e.sourceId)).toEqual(['payroll', 'rent', 'client']);
  });

  it('tracks the minimum projected balance and its date', () => {
    const forecast = forecastCashRunway({
      startingCashCents: 300000,
      today: TODAY,
      horizonWeeks: 8,
      events: [
        event({ id: 'bill-1', amountCents: 100000, date: '2025-01-05' }),
        event({ id: 'bill-2', amountCents: 150000, date: '2025-01-12' }),
        event({ id: 'revenue', direction: 'inflow', amountCents: 500000, date: '2025-01-19' }),
      ],
    });

    // Balances: 200000 (5th), 50000 (12th, the trough), 550000 (19th).
    expect(forecast.minBalanceCents).toBe(50000);
    expect(forecast.minBalanceDate).toBe('2025-01-12');
    expect(forecast.endingBalanceCents).toBe(550000);
  });

  it('keeps the opening balance as the minimum when every event is an inflow', () => {
    const forecast = forecastCashRunway({
      startingCashCents: 75000,
      today: TODAY,
      horizonWeeks: 4,
      events: [
        event({ id: 'revenue', direction: 'inflow', amountCents: 100000, date: '2025-01-15' }),
      ],
    });

    expect(forecast.minBalanceCents).toBe(75000);
    expect(forecast.minBalanceDate).toBe(TODAY);
    expect(forecast.status).toBe('healthy');
  });

  it('flags an already-negative opening balance as a shortfall on the start date', () => {
    const forecast = forecastCashRunway({
      startingCashCents: -5000,
      today: TODAY,
      horizonWeeks: 4,
      events: [],
    });

    expect(forecast.status).toBe('shortfall');
    expect(forecast.shortfallDate).toBe(TODAY);
    expect(forecast.runwayDays).toBe(0);
    expect(forecast.timeline).toHaveLength(0);
  });

  it('expands recurring outflows across the horizon and accumulates totals', () => {
    const forecast = forecastCashRunway({
      startingCashCents: 1_000_000,
      today: TODAY,
      horizonWeeks: 4,
      events: [
        event({ id: 'payroll', amountCents: 200000, date: '2025-01-03', frequency: 'weekly' }),
      ],
    });

    // Horizon ends 2025-01-29. Weekly payroll on Jan 3, 10, 17, 24 falls in
    // range; Jan 31 is beyond the horizon → 4 occurrences.
    expect(forecast.endDate).toBe('2025-01-29');
    expect(forecast.timeline).toHaveLength(4);
    expect(forecast.totalOutflowCents).toBe(800000);
    expect(forecast.totalInflowCents).toBe(0);
    expect(forecast.endingBalanceCents).toBe(200000);
    expect(forecast.status).toBe('healthy');
  });

  it('excludes occurrences beyond the horizon end', () => {
    const forecast = forecastCashRunway({
      startingCashCents: 1_000_000,
      today: TODAY,
      horizonWeeks: 2,
      events: [
        event({ id: 'monthly-bill', amountCents: 50000, date: '2025-01-05', frequency: 'monthly' }),
      ],
    });

    // Horizon ends 2025-01-15, so only the Jan 5 occurrence is in range.
    expect(forecast.endDate).toBe('2025-01-15');
    expect(forecast.timeline).toHaveLength(1);
    expect(forecast.timeline[0].date).toBe('2025-01-05');
  });

  it('orders the timeline deterministically by date ascending', () => {
    const forecast = forecastCashRunway({
      startingCashCents: 1_000_000,
      today: TODAY,
      horizonWeeks: 12,
      events: [
        event({ id: 'c', amountCents: 1000, date: '2025-02-01' }),
        event({ id: 'a', amountCents: 1000, date: '2025-01-05' }),
        event({ id: 'b', amountCents: 1000, date: '2025-01-20' }),
      ],
    });

    expect(forecast.timeline.map((p) => p.date)).toEqual([
      '2025-01-05',
      '2025-01-20',
      '2025-02-01',
    ]);
  });

  it('defaults to a 12-week horizon when none is provided', () => {
    const forecast = forecastCashRunway({
      startingCashCents: 100000,
      today: TODAY,
      events: [],
    });

    expect(forecast.horizonWeeks).toBe(12);
    expect(forecast.endDate).toBe('2025-03-26');
  });
});
