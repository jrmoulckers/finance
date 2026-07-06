// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for the FIRE planning engine (`fire.ts`).
 *
 * Covers known-value cases, banker's rounding, boundary conditions (zero,
 * negative, max-value), and the documented edge cases (already-FI, never-reaches,
 * non-positive return, unreachable SWR). All amounts are integer cents.
 *
 * References: issue #2114
 */

import { describe, it, expect } from 'vitest';

import {
  bankersRound,
  buildFIProjection,
  calculateFIREPlan,
  coastFINumber,
  fiNumber,
  isCoastFI,
  monthlyRateFromAnnual,
  yearsToFI,
  MAX_FI_SEARCH_YEARS,
} from './fire';

// Convenience: dollars → integer cents for readable fixtures.
const $ = (dollars: number): number => Math.round(dollars * 100);

describe('bankersRound (round half to even)', () => {
  it('rounds halves to the nearest even integer', () => {
    expect(bankersRound(0.5)).toBe(0);
    expect(bankersRound(1.5)).toBe(2);
    expect(bankersRound(2.5)).toBe(2);
    expect(bankersRound(3.5)).toBe(4);
  });

  it('rounds non-halves normally', () => {
    expect(bankersRound(2.4)).toBe(2);
    expect(bankersRound(2.6)).toBe(3);
    expect(bankersRound(-2.4)).toBe(-2);
  });

  it('rounds negative halves to even', () => {
    expect(bankersRound(-2.5)).toBe(-2);
    expect(bankersRound(-3.5)).toBe(-4);
  });

  it('returns 0 for non-finite input', () => {
    expect(bankersRound(Number.POSITIVE_INFINITY)).toBe(0);
    expect(bankersRound(Number.NaN)).toBe(0);
  });
});

describe('monthlyRateFromAnnual', () => {
  it('returns 0 for a 0% annual rate', () => {
    expect(monthlyRateFromAnnual(0)).toBe(0);
  });

  it('compounds back to the annual rate over 12 months', () => {
    const monthly = monthlyRateFromAnnual(0.05);
    expect((1 + monthly) ** 12).toBeCloseTo(1.05, 10);
  });

  it('clamps a ≤ -100% annual return to a total monthly loss', () => {
    expect(monthlyRateFromAnnual(-1)).toBe(-1);
    expect(monthlyRateFromAnnual(-2)).toBe(-1);
  });
});

describe('fiNumber (annual spending ÷ SWR)', () => {
  it('computes the classic $40k @ 4% → $1,000,000 case', () => {
    expect(fiNumber($(40_000), 0.04)).toBe($(1_000_000));
  });

  it('computes other known SWR cases', () => {
    expect(fiNumber($(25_000), 0.04)).toBe($(625_000));
    // $50k / 3.5% = $1,428,571.4285… → banker's rounded cents.
    expect(fiNumber($(50_000), 0.035)).toBe(142_857_143);
  });

  it('handles very large spending without overflow (within safe integer range)', () => {
    expect(fiNumber($(100_000_000), 0.04)).toBe($(2_500_000_000));
  });

  it('returns 0 for zero or negative spending', () => {
    expect(fiNumber(0, 0.04)).toBe(0);
    expect(fiNumber(-100, 0.04)).toBe(0);
  });

  it('returns Infinity for a non-positive SWR (unreachable target)', () => {
    expect(fiNumber($(40_000), 0)).toBe(Number.POSITIVE_INFINITY);
    expect(fiNumber($(40_000), -0.01)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('yearsToFI', () => {
  it('reports already-FI when current assets meet the target', () => {
    const result = yearsToFI({
      currentInvestedCents: $(1_000_000),
      annualContributionCents: $(20_000),
      realReturnRate: 0.05,
      fiNumberCents: $(1_000_000),
    });
    expect(result.alreadyFI).toBe(true);
    expect(result.reachedFI).toBe(true);
    expect(result.totalMonths).toBe(0);
    expect(result.years).toBe(0);
    expect(result.months).toBe(0);
    expect(result.projectedCents).toBe($(1_000_000));
  });

  it('computes an exact whole-year case at 0% return (linear accumulation)', () => {
    // $1,000/mo, no growth, target $120,000 → exactly 120 months.
    const result = yearsToFI({
      currentInvestedCents: 0,
      annualContributionCents: $(12_000),
      realReturnRate: 0,
      fiNumberCents: $(120_000),
    });
    expect(result.reachedFI).toBe(true);
    expect(result.totalMonths).toBe(120);
    expect(result.years).toBe(10);
    expect(result.months).toBe(0);
    expect(result.projectedCents).toBe($(120_000));
  });

  it('reports the remainder months at 0% return', () => {
    // $1,000/mo, no growth, target $125,000 → 125 months = 10y 5m.
    const result = yearsToFI({
      currentInvestedCents: 0,
      annualContributionCents: $(12_000),
      realReturnRate: 0,
      fiNumberCents: $(125_000),
    });
    expect(result.totalMonths).toBe(125);
    expect(result.years).toBe(10);
    expect(result.months).toBe(5);
  });

  it('reaches FI sooner with a positive return than with none', () => {
    const base = {
      currentInvestedCents: $(50_000),
      annualContributionCents: $(20_000),
      fiNumberCents: $(500_000),
    };
    const withGrowth = yearsToFI({ ...base, realReturnRate: 0.06 });
    const noGrowth = yearsToFI({ ...base, realReturnRate: 0 });
    expect(withGrowth.reachedFI).toBe(true);
    expect(noGrowth.reachedFI).toBe(true);
    expect(withGrowth.totalMonths).toBeLessThan(noGrowth.totalMonths);
  });

  it('reaches FI via compounding alone — a 10-year doubling', () => {
    // Return chosen so the portfolio doubles every 10 years; $500k → $1M at ~120 months.
    const tenYearDoubleReturn = 2 ** (1 / 10) - 1;
    const result = yearsToFI({
      currentInvestedCents: $(500_000),
      annualContributionCents: 0,
      realReturnRate: tenYearDoubleReturn,
      fiNumberCents: $(1_000_000),
    });
    expect(result.reachedFI).toBe(true);
    expect(result.totalMonths).toBeGreaterThanOrEqual(119);
    expect(result.totalMonths).toBeLessThanOrEqual(121);
  });

  it('matches the closed-form future value of an ordinary annuity', () => {
    const input = {
      currentInvestedCents: $(100_000),
      annualContributionCents: $(24_000),
      realReturnRate: 0.05,
      fiNumberCents: $(1_000_000),
    };
    const result = yearsToFI(input);
    expect(result.reachedFI).toBe(true);
    expect(result.projectedCents).toBeGreaterThanOrEqual(input.fiNumberCents);

    const i = monthlyRateFromAnnual(input.realReturnRate);
    const pmt = input.annualContributionCents / 12;
    const n = result.totalMonths;
    const growth = (1 + i) ** n;
    const fv = input.currentInvestedCents * growth + pmt * ((growth - 1) / i);
    expect(Math.abs(result.projectedCents - bankersRound(fv))).toBeLessThanOrEqual(10);
  });

  it('reports unreachable (capped) when nothing grows toward the target', () => {
    const result = yearsToFI({
      currentInvestedCents: $(50_000),
      annualContributionCents: 0,
      realReturnRate: 0,
      fiNumberCents: $(120_000),
    });
    expect(result.reachedFI).toBe(false);
    expect(result.alreadyFI).toBe(false);
    expect(result.totalMonths).toBe(MAX_FI_SEARCH_YEARS * 12);
    expect(result.years).toBe(MAX_FI_SEARCH_YEARS);
    expect(result.projectedCents).toBe($(50_000));
  });

  it('reports unreachable when negative contributions (drawdown) drain the portfolio', () => {
    const result = yearsToFI({
      currentInvestedCents: $(50_000),
      annualContributionCents: $(-12_000),
      realReturnRate: 0,
      fiNumberCents: $(120_000),
    });
    expect(result.reachedFI).toBe(false);
  });

  it('reports unreachable when the FI target is infinite', () => {
    const result = yearsToFI({
      currentInvestedCents: $(50_000),
      annualContributionCents: $(20_000),
      realReturnRate: 0.05,
      fiNumberCents: Number.POSITIVE_INFINITY,
    });
    expect(result.reachedFI).toBe(false);
  });

  it('keeps totalMonths === years*12 + months', () => {
    const result = yearsToFI({
      currentInvestedCents: $(30_000),
      annualContributionCents: $(18_000),
      realReturnRate: 0.05,
      fiNumberCents: $(750_000),
    });
    expect(result.years * 12 + result.months).toBe(result.totalMonths);
  });
});

describe('coastFINumber', () => {
  it('discounts the FI number back to today (exact 1-year, 100% return)', () => {
    // FI = $1M; doubling in 1 year ⇒ need exactly half today.
    expect(
      coastFINumber({
        annualSpendingCents: $(40_000),
        swrRate: 0.04,
        realReturnRate: 1.0,
        yearsToTraditionalRetirement: 1,
      }),
    ).toBe($(500_000));
  });

  it('equals the FI number when there is no time to grow', () => {
    expect(
      coastFINumber({
        annualSpendingCents: $(40_000),
        swrRate: 0.04,
        realReturnRate: 0.05,
        yearsToTraditionalRetirement: 0,
      }),
    ).toBe($(1_000_000));
  });

  it('equals the FI number when the real return is 0%', () => {
    expect(
      coastFINumber({
        annualSpendingCents: $(40_000),
        swrRate: 0.04,
        realReturnRate: 0,
        yearsToTraditionalRetirement: 30,
      }),
    ).toBe($(1_000_000));
  });

  it('computes a realistic 30-year coast number (≈ $231,377)', () => {
    const coast = coastFINumber({
      annualSpendingCents: $(40_000),
      swrRate: 0.04,
      realReturnRate: 0.05,
      yearsToTraditionalRetirement: 30,
    });
    // $1M / 1.05^30 ≈ $231,377.45.
    expect(Math.abs(coast - 23_137_745)).toBeLessThanOrEqual(50);
  });

  it('exceeds the FI number when the real return is negative', () => {
    const coast = coastFINumber({
      annualSpendingCents: $(40_000),
      swrRate: 0.04,
      realReturnRate: -0.02,
      yearsToTraditionalRetirement: 20,
    });
    expect(coast).toBeGreaterThan($(1_000_000));
  });

  it('is Infinity when the FI number is unreachable', () => {
    expect(
      coastFINumber({
        annualSpendingCents: $(40_000),
        swrRate: 0,
        realReturnRate: 0.05,
        yearsToTraditionalRetirement: 30,
      }),
    ).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('isCoastFI', () => {
  it('is true when current assets meet/exceed the coast number', () => {
    expect(isCoastFI($(600_000), $(500_000))).toBe(true);
    expect(isCoastFI($(500_000), $(500_000))).toBe(true);
  });

  it('is false when current assets fall short', () => {
    expect(isCoastFI($(400_000), $(500_000))).toBe(false);
  });

  it('is false when the coast number is infinite', () => {
    expect(isCoastFI($(1_000_000), Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('buildFIProjection', () => {
  it('starts at today with no contributions or growth', () => {
    const series = buildFIProjection({
      currentInvestedCents: $(100_000),
      annualContributionCents: $(24_000),
      realReturnRate: 0.05,
      fiNumberCents: $(1_000_000),
    });
    expect(series[0].year).toBe(0);
    expect(series[0].balanceCents).toBe($(100_000));
    expect(series[0].contributionsToDateCents).toBe(0);
    expect(series[0].growthToDateCents).toBe(0);
    expect(series[0].reachedFI).toBe(false);
  });

  it('flips reachedFI at the correct year and keeps a buffer afterward', () => {
    // $1,000/mo, 0% return, target $120,000 → FI at year 10; default 3-year buffer.
    const series = buildFIProjection({
      currentInvestedCents: 0,
      annualContributionCents: $(12_000),
      realReturnRate: 0,
      fiNumberCents: $(120_000),
    });
    expect(series).toHaveLength(14); // years 0..13
    expect(series[9].reachedFI).toBe(false);
    expect(series[10].reachedFI).toBe(true);
    expect(series.at(-1)?.year).toBe(13);
  });

  it('keeps the balance = current + contributions + growth identity at every point', () => {
    const current = $(100_000);
    const series = buildFIProjection({
      currentInvestedCents: current,
      annualContributionCents: $(24_000),
      realReturnRate: 0.05,
      fiNumberCents: $(1_000_000),
    });
    for (const point of series) {
      expect(point.balanceCents).toBe(
        current + point.contributionsToDateCents + point.growthToDateCents,
      );
    }
  });

  it('produces a monotonically increasing balance with positive contributions', () => {
    const series = buildFIProjection({
      currentInvestedCents: $(10_000),
      annualContributionCents: $(12_000),
      realReturnRate: 0.04,
      fiNumberCents: $(1_000_000),
    });
    for (let i = 1; i < series.length; i += 1) {
      expect(series[i].balanceCents).toBeGreaterThan(series[i - 1].balanceCents);
    }
  });

  it('honours maxYears when the target is never reached', () => {
    const series = buildFIProjection({
      currentInvestedCents: 0,
      annualContributionCents: 0,
      realReturnRate: 0,
      fiNumberCents: $(120_000),
      maxYears: 5,
    });
    expect(series).toHaveLength(6); // years 0..5
    expect(series.every((p) => !p.reachedFI)).toBe(true);
  });
});

describe('calculateFIREPlan (integration)', () => {
  const baseInput = {
    currentInvestedCents: $(100_000),
    annualSpendingCents: $(40_000),
    annualContributionCents: $(36_000),
    realReturnRate: 0.05,
    swrRate: 0.04,
    currentAge: 35,
    traditionalRetirementAge: 65,
    now: new Date('2020-06-15T12:00:00Z'),
  };

  it('produces a complete, internally-consistent plan', () => {
    const plan = calculateFIREPlan(baseInput);

    expect(plan.fiNumberCents).toBe($(1_000_000));
    expect(plan.swrRate).toBe(0.04);
    expect(plan.yearsToFI.reachedFI).toBe(true);
    expect(plan.yearsToTraditionalRetirement).toBe(30);

    // Coast number ≈ $231k; current $100k is below it.
    expect(Math.abs(plan.coastFINumberCents - 23_137_745)).toBeLessThanOrEqual(50);
    expect(plan.isCoastFI).toBe(false);

    // Projection begins at today's balance.
    expect(plan.projection.length).toBeGreaterThan(0);
    expect(plan.projection[0].balanceCents).toBe($(100_000));

    // FI date is a calendar date string.
    expect(plan.fiDateIso).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Contributions/growth split reconciles with the projected portfolio.
    const monthlyContribution = baseInput.annualContributionCents / 12;
    expect(plan.totalContributionsToFICents).toBe(
      bankersRound(monthlyContribution * plan.yearsToFI.totalMonths),
    );
    expect(plan.totalGrowthToFICents).toBeGreaterThan(0);
    expect(
      baseInput.currentInvestedCents + plan.totalContributionsToFICents + plan.totalGrowthToFICents,
    ).toBe(plan.yearsToFI.projectedCents);
  });

  it('flags an already-FI / already-Coast-FI saver', () => {
    const plan = calculateFIREPlan({
      ...baseInput,
      currentInvestedCents: $(2_000_000),
    });
    expect(plan.yearsToFI.alreadyFI).toBe(true);
    expect(plan.yearsToFI.totalMonths).toBe(0);
    expect(plan.isCoastFI).toBe(true);
    expect(plan.fiDateIso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('reports an unreachable plan for a non-positive SWR', () => {
    const plan = calculateFIREPlan({ ...baseInput, swrRate: 0 });
    expect(plan.fiNumberCents).toBe(Number.POSITIVE_INFINITY);
    expect(plan.yearsToFI.reachedFI).toBe(false);
    expect(plan.fiDateIso).toBeNull();
    expect(plan.coastFINumberCents).toBe(Number.POSITIVE_INFINITY);
    expect(plan.isCoastFI).toBe(false);
  });

  it('falls back to a default horizon when age is omitted', () => {
    const plan = calculateFIREPlan({
      currentInvestedCents: $(100_000),
      annualSpendingCents: $(40_000),
      annualContributionCents: $(36_000),
      realReturnRate: 0.05,
      swrRate: 0.04,
    });
    expect(plan.yearsToTraditionalRetirement).toBe(30);
  });

  it('extends the projection horizon to the year FI is actually reached (#3286)', () => {
    // Slow-growth inputs put FI well beyond the default 50-year display horizon
    // but within the 100-year search horizon.
    const plan = calculateFIREPlan({
      currentInvestedCents: $(10_000),
      annualSpendingCents: $(60_000),
      annualContributionCents: $(3_000),
      realReturnRate: 0.03,
      swrRate: 0.04,
      now: new Date('2020-06-15T12:00:00Z'),
    });

    expect(plan.yearsToFI.reachedFI).toBe(true);
    expect(plan.yearsToFI.years).toBeGreaterThan(50);

    // The chart must run at least to the year FI is reached so the crossover is
    // visible and consistent with the "time to FI" headline (not capped at 50).
    const lastPoint = plan.projection[plan.projection.length - 1];
    expect(lastPoint.year).toBeGreaterThanOrEqual(plan.yearsToFI.years);
    expect(lastPoint.year).toBeLessThanOrEqual(MAX_FI_SEARCH_YEARS);
    expect(plan.projection.some((point) => point.reachedFI)).toBe(true);
  });

  it('keeps the default display horizon when FI is unreachable (#3286)', () => {
    // Spending dwarfs contributions + growth capacity → FI is never reached.
    const plan = calculateFIREPlan({
      currentInvestedCents: $(1_000),
      annualSpendingCents: $(400_000),
      annualContributionCents: $(0),
      realReturnRate: 0.01,
      swrRate: 0.04,
      now: new Date('2020-06-15T12:00:00Z'),
    });

    expect(plan.yearsToFI.reachedFI).toBe(false);
    const lastPoint = plan.projection[plan.projection.length - 1];
    expect(lastPoint.year).toBe(50);
  });

  it('builds the projected FI date from local calendar components (#3310)', () => {
    const now = new Date('2020-06-15T12:00:00Z');
    const plan = calculateFIREPlan({ ...baseInput, now });

    // Independently reproduce the local add-months + local-format pipeline; the
    // serialized FI date must match it (no UTC `toISOString` month drift).
    const expected = new Date(now.getTime());
    expected.setMonth(expected.getMonth() + plan.yearsToFI.totalMonths);
    const year = expected.getFullYear();
    const month = String(expected.getMonth() + 1).padStart(2, '0');
    const day = String(expected.getDate()).padStart(2, '0');
    expect(plan.fiDateIso).toBe(`${year}-${month}-${day}`);
  });
});

describe('compounding math — single source of truth (#3305)', () => {
  it('compounds monthly geometrically rather than as a naive annual r ÷ 12', () => {
    const annual = 0.12;
    const geometric = monthlyRateFromAnnual(annual);
    const naive = annual / 12;
    // The geometric monthly rate is strictly smaller than r/12 and reproduces the
    // annual return exactly over twelve steps, whereas r/12 overstates it. This is
    // the discrepancy that made the retired annual engines (fire-calculator /
    // shared-fire) disagree with this wired one — now the only source of truth.
    expect(geometric).toBeLessThan(naive);
    expect((1 + geometric) ** 12).toBeCloseTo(1 + annual, 12);
    expect((1 + naive) ** 12).toBeGreaterThan(1 + annual);
  });

  it('accrues compounding growth on contributions, not just principal', () => {
    const plan = calculateFIREPlan({
      currentInvestedCents: $(100_000),
      annualSpendingCents: $(40_000),
      annualContributionCents: $(24_000),
      realReturnRate: 0.05,
      swrRate: 0.04,
      now: new Date('2020-06-15T12:00:00Z'),
    });
    expect(plan.totalGrowthToFICents).toBeGreaterThan(0);
    // The projected portfolio exceeds principal + the raw (un-grown) contribution
    // stream, proving the contributions themselves compound (a growing annuity).
    expect(plan.yearsToFI.projectedCents).toBeGreaterThan(
      $(100_000) + plan.totalContributionsToFICents,
    );
  });

  it('separates real growth from contributions (0% real → no growth; >0% real → growth)', () => {
    const base = {
      currentInvestedCents: $(100_000),
      annualSpendingCents: $(40_000),
      annualContributionCents: $(24_000),
      swrRate: 0.04,
      now: new Date('2020-06-15T12:00:00Z'),
    } as const;
    const zeroReal = calculateFIREPlan({ ...base, realReturnRate: 0 });
    const positiveReal = calculateFIREPlan({ ...base, realReturnRate: 0.05 });

    // Returns are modelled as **real** (inflation-adjusted): a 0% real return is
    // pure linear accrual, so the portfolio is exactly principal + contributions
    // with no growth component.
    expect(zeroReal.totalGrowthToFICents).toBe(0);
    expect(positiveReal.totalGrowthToFICents).toBeGreaterThan(0);
    // A larger real return never reaches FI later than none.
    expect(positiveReal.yearsToFI.totalMonths).toBeLessThanOrEqual(zeroReal.yearsToFI.totalMonths);
  });
});
