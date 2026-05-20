// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  aggregateByType,
  buildIncomeCalendar,
  computePassiveIncomeSummary,
  computeWeightedYield,
  filterYTD,
  projectAnnualIncome,
  projectMonthlyIncome,
  totalIncome,
} from './passive-income';
import type { PassiveIncomeRecord, PassiveIncomeStream } from './types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const records: PassiveIncomeRecord[] = [
  {
    id: 'r1',
    source: 'AAPL',
    type: 'DIVIDEND',
    amountCents: 5000,
    date: '2024-01-15',
    symbol: 'AAPL',
    isQualified: true,
  },
  {
    id: 'r2',
    source: 'AAPL',
    type: 'DIVIDEND',
    amountCents: 5500,
    date: '2024-04-15',
    symbol: 'AAPL',
    isQualified: true,
  },
  {
    id: 'r3',
    source: 'Marcus Savings',
    type: 'INTEREST',
    amountCents: 12000,
    date: '2024-02-28',
  },
  {
    id: 'r4',
    source: 'Rental Unit A',
    type: 'RENTAL',
    amountCents: 150000,
    date: '2024-03-01',
  },
  {
    id: 'r5',
    source: 'Book Royalties',
    type: 'ROYALTY',
    amountCents: 25000,
    date: '2023-12-01',
  },
];

const streams: PassiveIncomeStream[] = [
  {
    id: 's1',
    source: 'AAPL Dividends',
    type: 'DIVIDEND',
    amountPerPaymentCents: 5000,
    frequency: 'QUARTERLY',
    startDate: '2024-01-01',
    yieldPercent: 1.5,
    principalCents: 1333333,
  },
  {
    id: 's2',
    source: 'Marcus Savings',
    type: 'INTEREST',
    amountPerPaymentCents: 12000,
    frequency: 'MONTHLY',
    startDate: '2024-01-01',
    yieldPercent: 4.5,
    principalCents: 3200000,
  },
  {
    id: 's3',
    source: 'Rental Unit A',
    type: 'RENTAL',
    amountPerPaymentCents: 150000,
    frequency: 'MONTHLY',
    startDate: '2022-01-01',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildIncomeCalendar', () => {
  it('groups by month', () => {
    const calendar = buildIncomeCalendar(records);
    // Dec 2023, Jan 2024, Feb 2024, Mar 2024, Apr 2024 = 5 months
    expect(calendar).toHaveLength(5);
    // Jan 2024 should have 1 record with 5000
    const jan = calendar.find((e) => e.month === 1 && e.year === 2024);
    expect(jan?.totalCents).toBe(5000);
  });

  it('returns empty for no records', () => {
    expect(buildIncomeCalendar([])).toEqual([]);
  });
});

describe('aggregateByType', () => {
  it('aggregates correctly', () => {
    const byType = aggregateByType(records);
    expect(byType.length).toBeGreaterThan(0);
    // Rental should be highest (150000)
    expect(byType[0].type).toBe('RENTAL');
    expect(byType[0].totalCents).toBe(150000);
  });

  it('returns empty for no records', () => {
    expect(aggregateByType([])).toEqual([]);
  });
});

describe('projectAnnualIncome', () => {
  it('projects annual income from streams', () => {
    const annual = projectAnnualIncome(streams);
    // AAPL: 5000 * 4 = 20000
    // Marcus: 12000 * 12 = 144000
    // Rental: 150000 * 12 = 1800000
    expect(annual).toBe(1964000);
  });
});

describe('projectMonthlyIncome', () => {
  it('projects monthly income', () => {
    const monthly = projectMonthlyIncome(streams);
    // 1964000 / 12 ≈ 163667
    expect(monthly).toBeCloseTo(163667, -1);
  });
});

describe('computeWeightedYield', () => {
  it('computes weighted average yield', () => {
    const yield_ = computeWeightedYield(streams);
    // AAPL: 1.5% * 1333333, Marcus: 4.5% * 3200000
    // Weighted = (1.5*1333333 + 4.5*3200000) / (1333333+3200000) ≈ 3.62%
    expect(yield_).toBeGreaterThan(3);
    expect(yield_).toBeLessThan(5);
  });

  it('returns 0 for streams without yield', () => {
    const noYield: PassiveIncomeStream[] = [
      { ...streams[2] }, // Rental has no yield
    ];
    expect(computeWeightedYield(noYield)).toBe(0);
  });
});

describe('filterYTD', () => {
  it('filters to specified year', () => {
    const ytd = filterYTD(records, 2024);
    expect(ytd).toHaveLength(4);
  });

  it('filters to previous year', () => {
    const ytd = filterYTD(records, 2023);
    expect(ytd).toHaveLength(1);
  });
});

describe('totalIncome', () => {
  it('sums all records', () => {
    // 5000 + 5500 + 12000 + 150000 + 25000 = 197500
    expect(totalIncome(records)).toBe(197500);
  });
});

describe('computePassiveIncomeSummary', () => {
  it('computes full summary', () => {
    const summary = computePassiveIncomeSummary(records, streams, 2024);
    expect(summary.totalYtdIncomeCents).toBe(172500); // 2024 records only
    expect(summary.annualProjectionCents).toBe(1964000);
    expect(summary.byType.length).toBeGreaterThan(0);
    expect(summary.weightedYieldPercent).toBeGreaterThan(0);
  });
});
