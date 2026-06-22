// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INCOME_TAX_RESERVE_RATE,
  aggregateProfitability,
  computeGigTakeHome,
  weekStartKey,
  type ShiftRecord,
} from './gig-take-home';

describe('computeGigTakeHome', () => {
  it('estimates take-home with standard-mileage deductions and SE + income tax', () => {
    const result = computeGigTakeHome({
      grossPayoutsCents: 5_000_000, // $50,000 gross
      operatingCostsCents: 800_000, // $8,000 actual vehicle cash costs
      mileageDeductionCents: 1_000_000, // $10,000 standard mileage deduction
      otherDeductionsCents: 100_000, // $1,000 phone/supplies
      config: { incomeTaxReserveRate: 0.15 },
    });

    expect(result.deductionMethod).toBe('standard-mileage');
    expect(result.netCashProfitCents).toBe(4_100_000); // 50k - 8k - 1k
    expect(result.taxDeductibleExpensesCents).toBe(1_100_000); // mileage + other
    expect(result.netSelfEmploymentEarningsCents).toBe(3_900_000); // 50k - 11k
    expect(result.selfEmploymentTaxCents).toBe(551_053);
    expect(result.selfEmploymentTaxDeductionCents).toBe(275_527);
    expect(result.incomeTaxBaseCents).toBe(3_624_473);
    expect(result.incomeTaxReserveCents).toBe(543_671);
    expect(result.totalTaxSetAsideCents).toBe(1_094_724);
    expect(result.estimatedTakeHomeCents).toBe(3_005_276);
    expect(result.effectiveTaxRate).toBeCloseTo(0.218945, 5);
  });

  it('defaults the income-tax reserve rate when not provided', () => {
    const result = computeGigTakeHome({ grossPayoutsCents: 100_000 });
    expect(result.incomeTaxReserveRate).toBe(DEFAULT_INCOME_TAX_RESERVE_RATE);
  });

  it('returns all-zero output for zero income', () => {
    const result = computeGigTakeHome({ grossPayoutsCents: 0 });

    expect(result.netCashProfitCents).toBe(0);
    expect(result.netSelfEmploymentEarningsCents).toBe(0);
    expect(result.selfEmploymentTaxCents).toBe(0);
    expect(result.incomeTaxReserveCents).toBe(0);
    expect(result.totalTaxSetAsideCents).toBe(0);
    expect(result.estimatedTakeHomeCents).toBe(0);
    expect(result.effectiveTaxRate).toBe(0);
  });

  it('reports a loss (negative take-home) when costs exceed income with no taxable profit', () => {
    const result = computeGigTakeHome({
      grossPayoutsCents: 4_000,
      operatingCostsCents: 6_000,
      config: { deductionMethod: 'actual-expenses' },
    });

    // Actual-expense method deducts the operating costs, so there is no
    // taxable SE profit and no tax is owed — just a cash loss.
    expect(result.netSelfEmploymentEarningsCents).toBe(0);
    expect(result.selfEmploymentTaxCents).toBe(0);
    expect(result.totalTaxSetAsideCents).toBe(0);
    expect(result.netCashProfitCents).toBe(-2_000);
    expect(result.estimatedTakeHomeCents).toBe(-2_000);
  });

  it('applies the $400 annual SE-tax floor by default for a small single shift', () => {
    const result = computeGigTakeHome({
      grossPayoutsCents: 8_000, // $80 shift
      operatingCostsCents: 5_000, // $50 gas + repairs
      config: { incomeTaxReserveRate: 0.15 },
    });

    // Taxable base ($73.88) is under $400 → no SE tax with the floor on.
    expect(result.selfEmploymentTaxCents).toBe(0);
    expect(result.incomeTaxReserveCents).toBe(1_200); // 15% of $80 net SE
    expect(result.totalTaxSetAsideCents).toBe(1_200);
    expect(result.netCashProfitCents).toBe(3_000);
    expect(result.estimatedTakeHomeCents).toBe(1_800);
  });

  it('disables the SE-tax floor for per-shift set-aside estimates', () => {
    const result = computeGigTakeHome({
      grossPayoutsCents: 8_000,
      operatingCostsCents: 5_000,
      config: { incomeTaxReserveRate: 0.15, applySelfEmploymentFloor: false },
    });

    expect(result.selfEmploymentTaxCents).toBe(1_130);
    expect(result.selfEmploymentTaxDeductionCents).toBe(565);
    expect(result.incomeTaxReserveCents).toBe(1_115); // 15% of ($80 - $5.65)
    expect(result.totalTaxSetAsideCents).toBe(2_245);
    expect(result.estimatedTakeHomeCents).toBe(755);
  });

  it('caps Social Security tax at the wage base for very high earners', () => {
    const result = computeGigTakeHome({
      grossPayoutsCents: 20_000_000, // $200,000 net SE
      config: { applySelfEmploymentTax: true },
    });

    // SS capped at $168,600 wage base; Medicare on the full 92.35% base.
    expect(result.selfEmploymentTaxCents).toBe(2_626_270);
  });

  it('can disable self-employment tax entirely', () => {
    const withSe = computeGigTakeHome({ grossPayoutsCents: 5_000_000 });
    const withoutSe = computeGigTakeHome({
      grossPayoutsCents: 5_000_000,
      config: { applySelfEmploymentTax: false },
    });

    expect(withSe.selfEmploymentTaxCents).toBeGreaterThan(0);
    expect(withoutSe.selfEmploymentTaxCents).toBe(0);
  });

  it('clamps negative gross payouts to zero and ignores non-finite inputs', () => {
    const result = computeGigTakeHome({
      grossPayoutsCents: -1_000,
      operatingCostsCents: Number.NaN,
    });
    expect(result.grossPayoutsCents).toBe(0);
    expect(result.operatingCostsCents).toBe(0);
    expect(result.estimatedTakeHomeCents).toBe(0);
  });

  it('clamps an out-of-range reserve rate into [0, 1]', () => {
    const over = computeGigTakeHome({
      grossPayoutsCents: 1_000_000,
      config: { incomeTaxReserveRate: 5 },
    });
    const under = computeGigTakeHome({
      grossPayoutsCents: 1_000_000,
      config: { incomeTaxReserveRate: -1 },
    });
    expect(over.incomeTaxReserveRate).toBe(1);
    expect(under.incomeTaxReserveRate).toBe(0);
  });
});

describe('weekStartKey', () => {
  it('maps any weekday to the preceding Monday', () => {
    expect(weekStartKey('2024-02-14')).toBe('2024-02-12'); // Wed -> Mon
    expect(weekStartKey('2024-02-12')).toBe('2024-02-12'); // Mon -> Mon
    expect(weekStartKey('2024-02-18')).toBe('2024-02-12'); // Sun -> Mon
  });
});

describe('aggregateProfitability', () => {
  const shifts: ShiftRecord[] = [
    {
      id: 's1',
      date: '2024-02-12',
      grossCents: 8_000,
      operatingCostsCents: 2_000,
      mileageDeductionCents: 1_340,
      miles: 20,
      activeHours: 4,
    },
    {
      id: 's2',
      date: '2024-02-13',
      grossCents: 12_000,
      operatingCostsCents: 3_000,
      mileageDeductionCents: 2_010,
      miles: 30,
      activeHours: 5,
    },
    {
      id: 's3',
      date: '2024-02-18',
      grossCents: 10_000,
      operatingCostsCents: 2_500,
      mileageDeductionCents: 1_675,
      miles: 25,
      activeHours: 4,
    },
  ];

  it('buckets each shift individually', () => {
    const periods = aggregateProfitability(shifts, 'shift');
    expect(periods.map((p) => p.key)).toEqual(['s1', 's2', 's3']);
    expect(periods.every((p) => p.shiftCount === 1)).toBe(true);
  });

  it('buckets by calendar day', () => {
    const periods = aggregateProfitability(shifts, 'day');
    expect(periods.map((p) => p.key)).toEqual(['2024-02-12', '2024-02-13', '2024-02-18']);
  });

  it('buckets by Monday-based week and sums the period', () => {
    const config = { applySelfEmploymentFloor: false, incomeTaxReserveRate: 0.15 };
    const periods = aggregateProfitability(shifts, 'week', config);

    expect(periods).toHaveLength(1);
    const [week] = periods;
    expect(week.key).toBe('2024-02-12');
    expect(week.label).toBe('Week of 2024-02-12');
    expect(week.shiftCount).toBe(3);
    expect(week.grossCents).toBe(30_000);
    expect(week.operatingCostsCents).toBe(7_500);
    expect(week.miles).toBe(75);
    expect(week.activeHours).toBe(13);

    // The bucket math must equal a direct computation over the summed inputs.
    const expected = computeGigTakeHome({
      grossPayoutsCents: 30_000,
      operatingCostsCents: 7_500,
      mileageDeductionCents: 5_025,
      otherDeductionsCents: 0,
      config,
    });
    expect(week.netCashProfitCents).toBe(expected.netCashProfitCents);
    expect(week.totalTaxSetAsideCents).toBe(expected.totalTaxSetAsideCents);
    expect(week.estimatedTakeHomeCents).toBe(expected.estimatedTakeHomeCents);
    expect(week.takeHomePerMileCents).toBe(Math.round(expected.estimatedTakeHomeCents / 75));
    expect(week.takeHomePerHourCents).toBe(Math.round(expected.estimatedTakeHomeCents / 13));
  });

  it('returns null per-mile/per-hour metrics when miles or hours are zero', () => {
    const periods = aggregateProfitability(
      [{ id: 'x', date: '2024-02-12', grossCents: 5_000 }],
      'shift',
    );
    expect(periods[0].takeHomePerMileCents).toBeNull();
    expect(periods[0].takeHomePerHourCents).toBeNull();
  });

  it('returns an empty array for no shifts', () => {
    expect(aggregateProfitability([], 'week')).toEqual([]);
  });
});
