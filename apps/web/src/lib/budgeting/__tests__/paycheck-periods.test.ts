// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { PaycheckConfig } from '../advanced-types';
import { PayFrequency } from '../advanced-types';
import { generatePaycheckPeriods, getNextPayDate } from '../paycheck-periods';

// ---------------------------------------------------------------------------
// getNextPayDate
// ---------------------------------------------------------------------------

describe('getNextPayDate', () => {
  it('returns same date when it falls on a weekly pay date', () => {
    const config: PaycheckConfig = {
      frequency: PayFrequency.WEEKLY,
      firstPayDate: '2025-01-03', // Friday
    };

    // 7 weeks later
    expect(getNextPayDate(config, '2025-02-21')).toBe('2025-02-21');
  });

  it('returns next weekly pay date', () => {
    const config: PaycheckConfig = {
      frequency: PayFrequency.WEEKLY,
      firstPayDate: '2025-01-03',
    };

    expect(getNextPayDate(config, '2025-01-04')).toBe('2025-01-10');
  });

  it('returns biweekly pay date', () => {
    const config: PaycheckConfig = {
      frequency: PayFrequency.BIWEEKLY,
      firstPayDate: '2025-01-03',
    };

    expect(getNextPayDate(config, '2025-01-04')).toBe('2025-01-17');
  });

  it('returns monthly pay date this month', () => {
    const config: PaycheckConfig = {
      frequency: PayFrequency.MONTHLY,
      firstPayDate: '2025-01-15',
    };

    expect(getNextPayDate(config, '2025-03-01')).toBe('2025-03-15');
  });

  it('returns monthly pay date next month when past this month', () => {
    const config: PaycheckConfig = {
      frequency: PayFrequency.MONTHLY,
      firstPayDate: '2025-01-15',
    };

    expect(getNextPayDate(config, '2025-03-16')).toBe('2025-04-15');
  });

  it('returns semi-monthly pay date', () => {
    const config: PaycheckConfig = {
      frequency: PayFrequency.SEMI_MONTHLY,
      firstPayDate: '2025-01-01',
      secondPayDay: 15,
    };

    expect(getNextPayDate(config, '2025-03-02')).toBe('2025-03-15');
  });

  it('handles semi-monthly wrapping to next month', () => {
    const config: PaycheckConfig = {
      frequency: PayFrequency.SEMI_MONTHLY,
      firstPayDate: '2025-01-01',
      secondPayDay: 15,
    };

    expect(getNextPayDate(config, '2025-03-16')).toBe('2025-04-01');
  });

  it('clamps monthly pay date for short months', () => {
    const config: PaycheckConfig = {
      frequency: PayFrequency.MONTHLY,
      firstPayDate: '2025-01-31',
    };

    // Feb doesn't have 31 days
    const result = getNextPayDate(config, '2025-02-01');
    expect(result).toBe('2025-02-28');
  });

  it('returns anchor date when from is before anchor', () => {
    const config: PaycheckConfig = {
      frequency: PayFrequency.WEEKLY,
      firstPayDate: '2025-06-01',
    };

    expect(getNextPayDate(config, '2025-05-01')).toBe('2025-06-01');
  });
});

// ---------------------------------------------------------------------------
// generatePaycheckPeriods
// ---------------------------------------------------------------------------

describe('generatePaycheckPeriods', () => {
  it('generates biweekly periods for a month', () => {
    const config: PaycheckConfig = {
      frequency: PayFrequency.BIWEEKLY,
      firstPayDate: '2025-01-03',
    };

    const periods = generatePaycheckPeriods(config, '2025-06-01', '2025-06-30');

    expect(periods.length).toBeGreaterThan(0);

    for (const period of periods) {
      expect(period.days).toBeGreaterThan(0);
      expect(period.startDate <= period.endDate).toBe(true);
      expect(period.label).toBeTruthy();
    }
  });

  it('generates monthly periods', () => {
    const config: PaycheckConfig = {
      frequency: PayFrequency.MONTHLY,
      firstPayDate: '2025-01-01',
    };

    const periods = generatePaycheckPeriods(config, '2025-01-01', '2025-04-01');

    expect(periods.length).toBeGreaterThanOrEqual(3);
  });

  it('returns empty for inverted range', () => {
    const config: PaycheckConfig = {
      frequency: PayFrequency.WEEKLY,
      firstPayDate: '2025-01-01',
    };

    const periods = generatePaycheckPeriods(config, '2025-06-30', '2025-06-01');
    expect(periods).toEqual([]);
  });

  it('returns empty for equal start and end', () => {
    const config: PaycheckConfig = {
      frequency: PayFrequency.WEEKLY,
      firstPayDate: '2025-01-01',
    };

    const periods = generatePaycheckPeriods(config, '2025-06-01', '2025-06-01');
    expect(periods).toEqual([]);
  });

  it('generates semi-monthly periods', () => {
    const config: PaycheckConfig = {
      frequency: PayFrequency.SEMI_MONTHLY,
      firstPayDate: '2025-01-01',
      secondPayDay: 15,
    };

    const periods = generatePaycheckPeriods(config, '2025-03-01', '2025-04-30');

    // Should have ~4 periods (Mar 1, Mar 15, Apr 1, Apr 15)
    expect(periods.length).toBeGreaterThanOrEqual(3);
  });

  it('periods have descriptive labels', () => {
    const config: PaycheckConfig = {
      frequency: PayFrequency.MONTHLY,
      firstPayDate: '2025-01-01',
    };

    const periods = generatePaycheckPeriods(config, '2025-05-01', '2025-06-30');

    expect(periods[0].label).toContain('May');
  });
});
