// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECTION_SCENARIOS,
  MAX_PROJECTION_YEARS,
  buildProjectionChartData,
  clampProjectionYears,
  deriveProjectionScenarios,
  futureValueAnnuity,
  futureValueLumpSum,
  periodsPerYearForFrequency,
  projectPortfolioGrowth,
  projectScenario,
  type ProjectionScenario,
} from './projections';

/** Assert every numeric field on a year point is a whole number (no float cents). */
function expectAllInteger(values: readonly number[]): void {
  for (const value of values) {
    expect(Number.isInteger(value)).toBe(true);
  }
}

describe('futureValueLumpSum', () => {
  it('computes a known compound-interest value (P(1+r)^t)', () => {
    // $1,000.00 at 7% for 10 years = 100000 * 1.07^10 = 196715.13… cents.
    expect(futureValueLumpSum(100_000, 0.07, 10)).toBe(196_715);
  });

  it('returns the principal when there are zero periods', () => {
    expect(futureValueLumpSum(250_000, 0.07, 0)).toBe(250_000);
  });

  it('returns the principal unchanged at a zero rate', () => {
    expect(futureValueLumpSum(250_000, 0, 30)).toBe(250_000);
  });

  it('decays the principal at a negative rate', () => {
    // -10% annual for 5 years, compounded annually.
    expect(futureValueLumpSum(1_000_000, -0.1, 5)).toBe(590_490);
  });

  it('never returns NaN for non-finite inputs', () => {
    expect(futureValueLumpSum(Number.NaN, 0.07, 10)).toBe(0);
  });
});

describe('futureValueAnnuity', () => {
  it('computes a known annuity future value (PMT((1+r)^n - 1)/r)', () => {
    // $100.00/period at 5% for 10 periods = 10000 * ((1.05^10 - 1) / 0.05).
    expect(futureValueAnnuity(10_000, 0.05, 10)).toBe(125_779);
  });

  it('falls back to PMT * n at a zero rate', () => {
    expect(futureValueAnnuity(10_000, 0, 120)).toBe(1_200_000);
  });

  it('returns zero for zero payment or zero periods', () => {
    expect(futureValueAnnuity(0, 0.05, 120)).toBe(0);
    expect(futureValueAnnuity(10_000, 0.05, 0)).toBe(0);
  });
});

describe('periodsPerYearForFrequency', () => {
  it('maps monthly to 12 and annual to 1', () => {
    expect(periodsPerYearForFrequency('monthly')).toBe(12);
    expect(periodsPerYearForFrequency('annual')).toBe(1);
  });
});

describe('clampProjectionYears', () => {
  it('floors fractional years', () => {
    expect(clampProjectionYears(3.9)).toBe(3);
  });

  it('clamps negative, zero, and non-finite to 0', () => {
    expect(clampProjectionYears(-5)).toBe(0);
    expect(clampProjectionYears(0)).toBe(0);
    expect(clampProjectionYears(Number.NaN)).toBe(0);
  });

  it('caps at MAX_PROJECTION_YEARS', () => {
    expect(clampProjectionYears(500)).toBe(MAX_PROJECTION_YEARS);
  });
});

describe('projectScenario', () => {
  const scenario: ProjectionScenario = {
    id: 'expected',
    label: 'Expected',
    annualReturnRate: 0.07,
  };

  it('starts year 0 at the current value with no contributions or growth', () => {
    const projection = projectScenario(1_000_000, 50_000, 12, 20, scenario);
    const first = projection.series[0];
    expect(first.year).toBe(0);
    expect(first.endValueCents).toBe(1_000_000);
    expect(first.cumulativeContributionsCents).toBe(0);
    expect(first.cumulativeGrowthCents).toBe(0);
  });

  it('matches the closed-form lump-sum + annuity future value at the horizon', () => {
    // 1,000,000 cents start, 50,000 cents/month, 7% real, 20 years, monthly.
    const projection = projectScenario(1_000_000, 50_000, 12, 20, scenario);
    expect(projection.finalValueCents).toBe(30_085_072);
    expect(projection.totalContributionsCents).toBe(12_000_000);
    expect(projection.totalGrowthCents).toBe(17_085_072);
  });

  it('keeps the series length equal to years + 1 and reports whole cents only', () => {
    const projection = projectScenario(1_000_000, 50_000, 12, 20, scenario);
    expect(projection.series).toHaveLength(21);
    for (const point of projection.series) {
      expectAllInteger([
        point.startValueCents,
        point.endValueCents,
        point.contributionsThisYearCents,
        point.growthThisYearCents,
        point.cumulativeContributionsCents,
        point.cumulativeGrowthCents,
      ]);
    }
  });

  it('reconciles end value to start + contributions + growth each year', () => {
    const projection = projectScenario(500_000, 25_000, 12, 15, scenario);
    for (const point of projection.series) {
      expect(point.endValueCents).toBe(
        point.startValueCents + point.contributionsThisYearCents + point.growthThisYearCents,
      );
    }
  });
});

describe('projectPortfolioGrowth', () => {
  const baseInput = {
    currentValueCents: 1_000_000,
    contributionCents: 50_000,
    contributionFrequency: 'monthly' as const,
    years: 20,
  };

  it('projects all three default scenarios', () => {
    const result = projectPortfolioGrowth(baseInput);
    expect(result.scenarios).toHaveLength(DEFAULT_PROJECTION_SCENARIOS.length);
    expect(result.scenarios.map((s) => s.scenario.id)).toEqual([
      'conservative',
      'expected',
      'optimistic',
    ]);
  });

  it('produces a known final value for the expected scenario', () => {
    const result = projectPortfolioGrowth(baseInput);
    const expected = result.scenarios.find((s) => s.scenario.id === 'expected');
    expect(expected?.finalValueCents).toBe(30_085_072);
  });

  it('orders scenario outcomes monotonically by return rate', () => {
    const result = projectPortfolioGrowth(baseInput);
    const [conservative, expected, optimistic] = result.scenarios;
    expect(conservative.finalValueCents).toBeLessThanOrEqual(expected.finalValueCents);
    expect(expected.finalValueCents).toBeLessThanOrEqual(optimistic.finalValueCents);
  });

  it('handles zero contributions as pure compound growth', () => {
    const result = projectPortfolioGrowth({ ...baseInput, contributionCents: 0 });
    const expected = result.scenarios.find((s) => s.scenario.id === 'expected');
    expect(expected?.totalContributionsCents).toBe(0);
    expect(expected?.finalValueCents).toBeGreaterThan(baseInput.currentValueCents);
  });

  it('produces zero growth when the return rate is zero', () => {
    const result = projectPortfolioGrowth({
      ...baseInput,
      scenarios: [{ id: 'flat', label: 'Flat', annualReturnRate: 0 }],
    });
    const flat = result.scenarios[0];
    expect(flat.totalGrowthCents).toBe(0);
    expect(flat.finalValueCents).toBe(result.startingValueCents + flat.totalContributionsCents);
  });

  it('models a drawdown for a negative return with no contributions', () => {
    const result = projectPortfolioGrowth({
      currentValueCents: 1_000_000,
      contributionCents: 0,
      contributionFrequency: 'monthly',
      years: 5,
      scenarios: [{ id: 'bear', label: 'Bear', annualReturnRate: -0.1 }],
    });
    const bear = result.scenarios[0];
    expect(bear.finalValueCents).toBe(605_261);
    expect(bear.totalGrowthCents).toBeLessThan(0);
  });

  it('returns only the baseline when the horizon is zero years', () => {
    const result = projectPortfolioGrowth({ ...baseInput, years: 0 });
    const expected = result.scenarios.find((s) => s.scenario.id === 'expected');
    expect(expected?.series).toHaveLength(1);
    expect(expected?.finalValueCents).toBe(result.startingValueCents);
  });

  it('clamps long horizons to MAX_PROJECTION_YEARS', () => {
    const result = projectPortfolioGrowth({ ...baseInput, years: 500 });
    expect(result.years).toBe(MAX_PROJECTION_YEARS);
    expect(result.scenarios[0].series).toHaveLength(MAX_PROJECTION_YEARS + 1);
  });

  it('clamps negative starting value and contributions to zero', () => {
    const result = projectPortfolioGrowth({
      currentValueCents: -100,
      contributionCents: -100,
      contributionFrequency: 'monthly',
      years: 10,
    });
    expect(result.startingValueCents).toBe(0);
    expect(result.contributionCents).toBe(0);
    expect(result.scenarios.every((s) => s.finalValueCents === 0)).toBe(true);
  });

  it('matches a known monthly contribution (SIP) future value', () => {
    // $100.00/month, 0 start, 6% real, 10 years => 1,638,793 cents.
    const result = projectPortfolioGrowth({
      currentValueCents: 0,
      contributionCents: 10_000,
      contributionFrequency: 'monthly',
      years: 10,
      scenarios: [{ id: 'sip', label: 'SIP', annualReturnRate: 0.06 }],
    });
    expect(result.scenarios[0].finalValueCents).toBe(1_638_793);
  });
});

describe('deriveProjectionScenarios', () => {
  it('centres on the expected rate with a symmetric spread', () => {
    const scenarios = deriveProjectionScenarios(0.07, 0.03);
    expect(scenarios[0].annualReturnRate).toBeCloseTo(0.04, 10);
    expect(scenarios[1].annualReturnRate).toBeCloseTo(0.07, 10);
    expect(scenarios[2].annualReturnRate).toBeCloseTo(0.1, 10);
    expect(scenarios.map((s) => s.id)).toEqual(['conservative', 'expected', 'optimistic']);
  });

  it('keeps scenarios ordered by return rate', () => {
    const scenarios = deriveProjectionScenarios(0.05);
    expect(scenarios[0].annualReturnRate).toBeLessThan(scenarios[1].annualReturnRate);
    expect(scenarios[1].annualReturnRate).toBeLessThan(scenarios[2].annualReturnRate);
  });
});

describe('buildProjectionChartData', () => {
  const result = projectPortfolioGrowth({
    currentValueCents: 1_000_000,
    contributionCents: 50_000,
    contributionFrequency: 'monthly',
    years: 20,
  });

  it('produces one row per year plus the baseline', () => {
    const { data } = buildProjectionChartData(result);
    expect(data).toHaveLength(21);
    expect(data[0].label).toBe('Now');
    expect(data[1].label).toBe('Yr 1');
  });

  it('exposes a series per scenario plus a total-invested baseline', () => {
    const { series } = buildProjectionChartData(result);
    expect(series.map((s) => s.dataKey)).toEqual([
      'conservative',
      'expected',
      'optimistic',
      'contributions',
    ]);
  });

  it('tracks total invested (start + cumulative contributions) on the baseline', () => {
    const { data } = buildProjectionChartData(result);
    expect(data[0].contributions).toBe(result.startingValueCents);
    const last = data[data.length - 1];
    const expected = result.scenarios.find((s) => s.scenario.id === 'expected');
    expect(last.contributions).toBe(
      result.startingValueCents + (expected?.totalContributionsCents ?? 0),
    );
  });
});
