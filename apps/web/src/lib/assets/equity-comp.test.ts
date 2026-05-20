// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  computeEquityCompSummary,
  computeGrantSummary,
  computeTaxImplication,
  generateVestingTimeline,
  nextVestingEvent,
  sharesVestedAsOf,
  spreadPerShare,
} from './equity-comp';
import type { EquityGrant, VestingSchedule } from './types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const rsuSchedule: VestingSchedule = {
  grantDate: '2023-01-15',
  totalShares: 1000,
  vestingStartDate: '2023-01-15',
  cliffMonths: 12,
  vestingMonths: 48,
  frequency: 'QUARTERLY',
};

const rsuGrant: EquityGrant = {
  id: 'g1',
  grantType: 'RSU',
  companyName: 'TechCorp',
  grantDate: '2023-01-15',
  totalShares: 1000,
  vestingSchedule: rsuSchedule,
  currentSharePriceCents: 15000,
};

const isoGrant: EquityGrant = {
  id: 'g2',
  grantType: 'ISO',
  companyName: 'TechCorp',
  grantDate: '2022-06-01',
  totalShares: 500,
  vestingSchedule: {
    grantDate: '2022-06-01',
    totalShares: 500,
    vestingStartDate: '2022-06-01',
    cliffMonths: 12,
    vestingMonths: 48,
    frequency: 'MONTHLY',
  },
  currentSharePriceCents: 20000,
  strikePriceCents: 10000,
  fmvAtGrantCents: 10000,
};

const nsoGrant: EquityGrant = {
  id: 'g3',
  grantType: 'NSO',
  companyName: 'StartupInc',
  grantDate: '2023-03-01',
  totalShares: 200,
  vestingSchedule: {
    grantDate: '2023-03-01',
    totalShares: 200,
    vestingStartDate: '2023-03-01',
    cliffMonths: 0,
    vestingMonths: 24,
    frequency: 'MONTHLY',
  },
  currentSharePriceCents: 5000,
  strikePriceCents: 2000,
};

const esppGrant: EquityGrant = {
  id: 'g4',
  grantType: 'ESPP',
  companyName: 'TechCorp',
  grantDate: '2024-01-01',
  totalShares: 100,
  vestingSchedule: {
    grantDate: '2024-01-01',
    totalShares: 100,
    vestingStartDate: '2024-01-01',
    cliffMonths: 0,
    vestingMonths: 6,
    frequency: 'QUARTERLY',
  },
  currentSharePriceCents: 15000,
  esppDiscountRate: 0.15,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateVestingTimeline', () => {
  it('generates RSU cliff + quarterly vesting', () => {
    const events = generateVestingTimeline(rsuSchedule);
    // Cliff at 12 months + (48-12)/3 = 12 quarterly events = 13 total
    expect(events.length).toBe(13);
    // First event is the cliff
    expect(events[0].date).toBe('2024-01-15');
    // Last event should be at month 48
    const lastEvent = events[events.length - 1];
    expect(lastEvent.percentVested).toBe(100);
    expect(lastEvent.vestedCumulativeShares).toBe(1000);
  });

  it('handles no-cliff monthly vesting', () => {
    const schedule: VestingSchedule = {
      grantDate: '2023-01-01',
      totalShares: 24,
      vestingStartDate: '2023-01-01',
      cliffMonths: 0,
      vestingMonths: 24,
      frequency: 'MONTHLY',
    };
    const events = generateVestingTimeline(schedule);
    expect(events).toHaveLength(24);
    expect(events[0].shares).toBe(1);
    expect(events[23].vestedCumulativeShares).toBe(24);
  });

  it('returns empty for zero shares', () => {
    const schedule: VestingSchedule = {
      ...rsuSchedule,
      totalShares: 0,
    };
    expect(generateVestingTimeline(schedule)).toEqual([]);
  });
});

describe('sharesVestedAsOf', () => {
  it('returns 0 before cliff', () => {
    expect(sharesVestedAsOf(rsuSchedule, '2023-06-15')).toBe(0);
  });

  it('returns cliff shares at cliff date', () => {
    const vested = sharesVestedAsOf(rsuSchedule, '2024-01-15');
    expect(vested).toBeGreaterThan(0);
  });

  it('returns all shares after full vesting', () => {
    expect(sharesVestedAsOf(rsuSchedule, '2028-01-15')).toBe(1000);
  });
});

describe('nextVestingEvent', () => {
  it('returns cliff as first event before cliff', () => {
    const next = nextVestingEvent(rsuSchedule, '2023-06-15');
    expect(next?.date).toBe('2024-01-15');
  });

  it('returns undefined after full vesting', () => {
    expect(nextVestingEvent(rsuSchedule, '2028-01-15')).toBeUndefined();
  });
});

describe('spreadPerShare', () => {
  it('computes RSU spread as full price', () => {
    expect(spreadPerShare(rsuGrant)).toBe(15000);
  });

  it('computes ISO spread as price - strike', () => {
    // 20000 - 10000 = 10000
    expect(spreadPerShare(isoGrant)).toBe(10000);
  });

  it('computes NSO spread as price - strike', () => {
    // 5000 - 2000 = 3000
    expect(spreadPerShare(nsoGrant)).toBe(3000);
  });

  it('computes ESPP spread from discount', () => {
    // Purchase price = 15000 * (1 - 0.15) = 12750, spread = 15000 - 12750 = 2250
    expect(spreadPerShare(esppGrant)).toBe(2250);
  });

  it('never returns negative spread', () => {
    const underwaterISO = { ...isoGrant, strikePriceCents: 30000 };
    expect(spreadPerShare(underwaterISO)).toBe(0);
  });
});

describe('computeGrantSummary', () => {
  it('computes RSU summary with partially vested', () => {
    // After cliff (2024-01-15), check at 2024-06-15
    const summary = computeGrantSummary(rsuGrant, '2024-06-15');
    expect(summary.grantType).toBe('RSU');
    expect(summary.vestedShares).toBeGreaterThan(0);
    expect(summary.unvestedShares).toBeLessThan(1000);
    expect(summary.vestedValueCents).toBeGreaterThan(0);
    expect(summary.nextVestingDate).toBeDefined();
  });
});

describe('computeTaxImplication', () => {
  it('computes RSU ordinary income', () => {
    const tax = computeTaxImplication(rsuGrant, 100);
    // 100 * 15000 = 1500000 ordinary income
    expect(tax.ordinaryIncomeCents).toBe(1500000);
    expect(tax.amtAdjustmentCents).toBe(0);
  });

  it('computes ISO AMT adjustment', () => {
    const tax = computeTaxImplication(isoGrant, 50);
    expect(tax.ordinaryIncomeCents).toBe(0);
    // 50 * (10000 - 10000) = 0 AMT (fmv = strike at grant)
    expect(tax.amtAdjustmentCents).toBe(0);
  });

  it('computes ISO AMT when FMV exceeds strike', () => {
    const isoWithSpread = { ...isoGrant, fmvAtGrantCents: 15000 };
    const tax = computeTaxImplication(isoWithSpread, 50);
    // 50 * (15000 - 10000) = 250000
    expect(tax.amtAdjustmentCents).toBe(250000);
  });

  it('computes NSO ordinary income on spread', () => {
    const tax = computeTaxImplication(nsoGrant, 100);
    // 100 * (5000 - 2000) = 300000
    expect(tax.ordinaryIncomeCents).toBe(300000);
  });

  it('computes ESPP discount income', () => {
    const tax = computeTaxImplication(esppGrant, 50);
    // Purchase: 15000 * 0.85 = 12750, discount income: 50 * (15000 - 12750) = 112500
    expect(tax.ordinaryIncomeCents).toBe(112500);
  });
});

describe('computeEquityCompSummary', () => {
  it('computes full summary across grants', () => {
    const summary = computeEquityCompSummary([rsuGrant, isoGrant, nsoGrant], '2025-01-15');
    expect(summary.totalGrantedShares).toBeGreaterThan(0);
    expect(summary.grants).toHaveLength(3);
    expect(summary.totalVestedValueCents).toBeGreaterThan(0);
  });

  it('returns zeros for empty grants', () => {
    const summary = computeEquityCompSummary([], '2025-01-15');
    expect(summary.totalGrantedShares).toBe(0);
    expect(summary.grants).toEqual([]);
  });
});
