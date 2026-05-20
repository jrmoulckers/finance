// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the dividend calendar and forward income estimation engine.
 *
 * References: issue #1631
 */

import { describe, expect, it } from 'vitest';
import type { DividendHoldingInput } from './dividends';
import {
  buildDividendCalendar,
  detectDividendFrequency,
  estimateForwardIncome,
  getUpcomingExDates,
  paymentsPerYear,
} from './dividends';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const quarterlyDates = ['2024-01-15', '2024-04-15', '2024-07-15', '2024-10-15'];

const monthlyDates = [
  '2024-01-01',
  '2024-02-01',
  '2024-03-01',
  '2024-04-01',
  '2024-05-01',
  '2024-06-01',
];

const annualDates = ['2023-06-15', '2024-06-15'];

const semiAnnualDates = ['2024-01-15', '2024-07-15'];

const holdingInput: DividendHoldingInput = {
  holdingId: 'h1',
  symbol: 'VYM',
  shares: 100,
  dividendPerShareCents: 50, // $0.50/share per payment
  historicalExDates: quarterlyDates,
  marketValueCents: 10000_00, // $10,000
};

// ---------------------------------------------------------------------------
// detectDividendFrequency
// ---------------------------------------------------------------------------

describe('detectDividendFrequency', () => {
  it('detects quarterly payments', () => {
    expect(detectDividendFrequency(quarterlyDates)).toBe('QUARTERLY');
  });

  it('detects monthly payments', () => {
    expect(detectDividendFrequency(monthlyDates)).toBe('MONTHLY');
  });

  it('detects annual payments', () => {
    expect(detectDividendFrequency(annualDates)).toBe('ANNUAL');
  });

  it('detects semi-annual payments', () => {
    expect(detectDividendFrequency(semiAnnualDates)).toBe('SEMI_ANNUAL');
  });

  it('returns IRREGULAR for fewer than 2 dates', () => {
    expect(detectDividendFrequency([])).toBe('IRREGULAR');
    expect(detectDividendFrequency(['2024-01-15'])).toBe('IRREGULAR');
  });
});

// ---------------------------------------------------------------------------
// paymentsPerYear
// ---------------------------------------------------------------------------

describe('paymentsPerYear', () => {
  it('returns 12 for monthly', () => {
    expect(paymentsPerYear('MONTHLY')).toBe(12);
  });

  it('returns 4 for quarterly', () => {
    expect(paymentsPerYear('QUARTERLY')).toBe(4);
  });

  it('returns 2 for semi-annual', () => {
    expect(paymentsPerYear('SEMI_ANNUAL')).toBe(2);
  });

  it('returns 1 for annual', () => {
    expect(paymentsPerYear('ANNUAL')).toBe(1);
  });

  it('returns 4 as default for irregular', () => {
    expect(paymentsPerYear('IRREGULAR')).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// buildDividendCalendar
// ---------------------------------------------------------------------------

describe('buildDividendCalendar', () => {
  it('projects future dividend events', () => {
    const calendar = buildDividendCalendar([holdingInput], '2024-11-01');
    expect(calendar.length).toBeGreaterThan(0);

    for (const event of calendar) {
      expect(event.isProjected).toBe(true);
      expect(event.symbol).toBe('VYM');
      expect(event.totalAmountCents).toBe(5000); // 100 shares × $0.50
      expect(event.exDate > '2024-11-01').toBe(true);
    }
  });

  it('returns empty for holdings with zero dividends', () => {
    const noDiv: DividendHoldingInput = {
      ...holdingInput,
      dividendPerShareCents: 0,
    };
    const calendar = buildDividendCalendar([noDiv], '2024-11-01');
    expect(calendar).toHaveLength(0);
  });

  it('sorts events by ex-date', () => {
    const multiHolding: DividendHoldingInput = {
      holdingId: 'h2',
      symbol: 'SCHD',
      shares: 50,
      dividendPerShareCents: 75,
      historicalExDates: quarterlyDates,
      marketValueCents: 5000_00,
    };
    const calendar = buildDividendCalendar([holdingInput, multiHolding], '2024-11-01');

    for (let i = 1; i < calendar.length; i++) {
      expect(calendar[i].exDate >= calendar[i - 1].exDate).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// estimateForwardIncome
// ---------------------------------------------------------------------------

describe('estimateForwardIncome', () => {
  it('calculates annual income from quarterly dividends', () => {
    const estimate = estimateForwardIncome([holdingInput]);

    // 100 shares × $0.50/share × 4 payments = $200/year = 20000 cents
    expect(estimate.annualIncomeCents).toBe(20000);
    expect(estimate.monthlyIncomeCents).toBe(1667); // 20000 / 12 rounded
    expect(estimate.currentYieldPercent).toBe(2); // $200 / $10,000 = 2%
  });

  it('aggregates across multiple holdings', () => {
    const holding2: DividendHoldingInput = {
      holdingId: 'h2',
      symbol: 'SCHD',
      shares: 200,
      dividendPerShareCents: 25,
      historicalExDates: quarterlyDates,
      marketValueCents: 8000_00,
    };

    const estimate = estimateForwardIncome([holdingInput, holding2]);
    // h1: 100 × 50 × 4 = 20000
    // h2: 200 × 25 × 4 = 20000
    expect(estimate.annualIncomeCents).toBe(40000);
    expect(estimate.holdingEstimates).toHaveLength(2);
  });

  it('excludes holdings with zero dividends', () => {
    const noDiv: DividendHoldingInput = {
      ...holdingInput,
      dividendPerShareCents: 0,
    };
    const estimate = estimateForwardIncome([noDiv]);
    expect(estimate.annualIncomeCents).toBe(0);
    expect(estimate.holdingEstimates).toHaveLength(0);
  });

  it('returns zero yield for zero-value portfolio', () => {
    const zeroVal: DividendHoldingInput = {
      ...holdingInput,
      marketValueCents: 0,
    };
    const estimate = estimateForwardIncome([zeroVal]);
    expect(estimate.currentYieldPercent).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getUpcomingExDates
// ---------------------------------------------------------------------------

describe('getUpcomingExDates', () => {
  it('filters events within the specified window', () => {
    const calendar = buildDividendCalendar([holdingInput], '2024-11-01');
    const upcoming = getUpcomingExDates(calendar, 120, '2024-11-01');

    for (const event of upcoming) {
      const exDate = new Date(event.exDate + 'T00:00:00Z');
      const ref = new Date('2024-11-01T00:00:00Z');
      const daysDiff = (exDate.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeGreaterThanOrEqual(0);
      expect(daysDiff).toBeLessThanOrEqual(120);
    }
  });

  it('returns empty for very short window', () => {
    const calendar = buildDividendCalendar([holdingInput], '2024-11-01');
    const upcoming = getUpcomingExDates(calendar, 1, '2024-11-01');
    // Unlikely to have an ex-date within 1 day of our reference
    expect(upcoming.length).toBeLessThanOrEqual(1);
  });
});
