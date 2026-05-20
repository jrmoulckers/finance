// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { SinkingFund } from '../advanced-types';
import { SinkingFundCadence } from '../advanced-types';
import {
  calculateAllSchedules,
  calculateSinkingFundSchedule,
  monthlyAmortization,
} from '../sinking-funds';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFund(overrides: Partial<SinkingFund> & { id: string }): SinkingFund {
  return {
    name: 'Test Fund',
    targetCents: 120_000,
    savedCents: 0,
    dueDate: '2025-12-31',
    cadence: SinkingFundCadence.MONTHLY,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateSinkingFundSchedule
// ---------------------------------------------------------------------------

describe('calculateSinkingFundSchedule', () => {
  it('calculates monthly contribution for a fund due in 6 months', () => {
    const fund = makeFund({
      id: '1',
      targetCents: 120_000,
      savedCents: 0,
      dueDate: '2025-12-01',
      cadence: SinkingFundCadence.MONTHLY,
    });

    const schedule = calculateSinkingFundSchedule(fund, '2025-06-01');

    expect(schedule.fundId).toBe('1');
    expect(schedule.remainingCents).toBe(120_000);
    expect(schedule.periodsRemaining).toBeGreaterThan(0);
    expect(schedule.contributionPerPeriodCents).toBeGreaterThan(0);
  });

  it('returns full amount when due date is today', () => {
    const fund = makeFund({
      id: '1',
      targetCents: 50_000,
      savedCents: 0,
      dueDate: '2025-06-01',
      cadence: SinkingFundCadence.MONTHLY,
    });

    const schedule = calculateSinkingFundSchedule(fund, '2025-06-01');

    expect(schedule.periodsRemaining).toBe(0);
    expect(schedule.contributionPerPeriodCents).toBe(50_000);
  });

  it('returns zero remaining when fully saved', () => {
    const fund = makeFund({
      id: '1',
      targetCents: 50_000,
      savedCents: 50_000,
      dueDate: '2025-12-31',
    });

    const schedule = calculateSinkingFundSchedule(fund, '2025-06-01');

    expect(schedule.remainingCents).toBe(0);
    expect(schedule.contributionPerPeriodCents).toBe(0);
  });

  it('handles over-saved fund', () => {
    const fund = makeFund({
      id: '1',
      targetCents: 50_000,
      savedCents: 60_000,
      dueDate: '2025-12-31',
    });

    const schedule = calculateSinkingFundSchedule(fund, '2025-06-01');

    expect(schedule.remainingCents).toBe(0);
  });

  it('calculates weekly cadence', () => {
    const fund = makeFund({
      id: '1',
      targetCents: 52_000,
      savedCents: 0,
      dueDate: '2026-06-01',
      cadence: SinkingFundCadence.WEEKLY,
    });

    const schedule = calculateSinkingFundSchedule(fund, '2025-06-01');

    // ~52 weeks, so ~1000 per week
    expect(schedule.periodsRemaining).toBeGreaterThan(40);
    expect(schedule.contributionPerPeriodCents).toBeGreaterThan(0);
  });

  it('marks on-track when saved exceeds expected', () => {
    const fund = makeFund({
      id: '1',
      targetCents: 120_000,
      savedCents: 100_000, // well ahead of schedule
      dueDate: '2025-12-31',
      cadence: SinkingFundCadence.MONTHLY,
    });

    const schedule = calculateSinkingFundSchedule(fund, '2025-06-01');
    expect(schedule.onTrack).toBe(true);
  });

  it('handles past due date', () => {
    const fund = makeFund({
      id: '1',
      targetCents: 50_000,
      savedCents: 30_000,
      dueDate: '2025-01-01',
    });

    const schedule = calculateSinkingFundSchedule(fund, '2025-06-01');

    expect(schedule.periodsRemaining).toBe(0);
    expect(schedule.remainingCents).toBe(20_000);
    expect(schedule.contributionPerPeriodCents).toBe(20_000);
  });
});

// ---------------------------------------------------------------------------
// monthlyAmortization
// ---------------------------------------------------------------------------

describe('monthlyAmortization', () => {
  it('returns same amount for monthly cadence', () => {
    expect(monthlyAmortization(10_000, SinkingFundCadence.MONTHLY)).toBe(10_000);
  });

  it('calculates annual expense monthly', () => {
    // $1200/year = $100/month
    expect(monthlyAmortization(120_000, SinkingFundCadence.ANNUALLY)).toBe(10_000);
  });

  it('calculates quarterly expense monthly', () => {
    // $300/quarter × 4 = $1200/year = $100/month
    expect(monthlyAmortization(30_000, SinkingFundCadence.QUARTERLY)).toBe(10_000);
  });

  it('calculates semi-annual expense monthly', () => {
    // $600 × 2 = $1200/year = $100/month
    expect(monthlyAmortization(60_000, SinkingFundCadence.SEMI_ANNUALLY)).toBe(10_000);
  });

  it('handles zero amount', () => {
    expect(monthlyAmortization(0, SinkingFundCadence.ANNUALLY)).toBe(0);
  });

  it('handles large amounts', () => {
    const result = monthlyAmortization(1_200_000_00, SinkingFundCadence.ANNUALLY);
    expect(result).toBe(10_000_000); // $1.2M/year = $100k/month
  });
});

// ---------------------------------------------------------------------------
// calculateAllSchedules
// ---------------------------------------------------------------------------

describe('calculateAllSchedules', () => {
  it('calculates schedules for multiple funds', () => {
    const funds = [
      makeFund({ id: '1', name: 'Insurance', dueDate: '2025-12-01' }),
      makeFund({ id: '2', name: 'Christmas', dueDate: '2025-12-25' }),
    ];

    const schedules = calculateAllSchedules(funds, '2025-06-01');

    expect(schedules).toHaveLength(2);
    expect(schedules[0].fundId).toBe('1');
    expect(schedules[1].fundId).toBe('2');
  });

  it('returns empty array for empty input', () => {
    expect(calculateAllSchedules([], '2025-06-01')).toEqual([]);
  });
});
