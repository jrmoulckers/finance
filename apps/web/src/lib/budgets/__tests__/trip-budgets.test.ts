// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for the pure trip / country budget engine (issue #2205).
 *
 * Covers: date-window filtering, country matching, FX roll-up with known
 * rates, banker's rounding, remaining-vs-planned, and archived-state handling
 * that preserves historical totals. All money is integer minor units.
 */

import { describe, it, expect } from 'vitest';

import {
  archiveTripBudget,
  computeTripTotals,
  convertMinorUnits,
  filterTripTransactions,
  summarizeTripBudget,
  summarizeTripBudgets,
  transactionInTripWindow,
  transactionMatchesTrip,
  tripDurationDays,
  tripStatus,
  unarchiveTripBudget,
} from '../trip-budgets';
import type { TripBudget, TripTransaction } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTrip(overrides: Partial<TripBudget> = {}): TripBudget {
  return {
    id: 'trip-bkk',
    name: 'Bangkok Jan–Mar',
    country: 'Thailand',
    startDate: '2026-01-01',
    endDate: '2026-03-31',
    localCurrency: 'THB',
    homeCurrency: 'USD',
    plannedLocalMinor: 100_000, // ฿1,000.00
    fxRateHomePerLocal: 0.03, // 1 satang = 0.03 cents → ฿1 = $0.03
    archived: false,
    archivedAt: null,
    archivedSnapshot: null,
    ...overrides,
  };
}

function makeTx(overrides: Partial<TripTransaction> = {}): TripTransaction {
  return {
    id: 'tx-1',
    amountMinor: 25_000, // ฿250.00
    currency: 'THB',
    date: '2026-02-15',
    country: 'Thailand',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// FX conversion (banker's rounding)
// ---------------------------------------------------------------------------

describe('convertMinorUnits', () => {
  it('converts local minor units to home minor units with a known rate', () => {
    // ฿500.00 (50,000 satang) at ฿1 = $0.03 → $15.00 (1,500 cents).
    expect(convertMinorUnits(50_000, 0.03)).toBe(1_500);
  });

  it('uses banker\u2019s rounding (HALF_EVEN) on exact halves', () => {
    expect(convertMinorUnits(5, 0.5)).toBe(2); // 2.5 → 2 (even)
    expect(convertMinorUnits(7, 0.5)).toBe(4); // 3.5 → 4 (even)
    expect(convertMinorUnits(9, 0.5)).toBe(4); // 4.5 → 4 (even)
    expect(convertMinorUnits(11, 0.5)).toBe(6); // 5.5 → 6 (even)
  });

  it('returns 0 for non-finite inputs instead of NaN money', () => {
    expect(convertMinorUnits(Number.NaN, 0.03)).toBe(0);
    expect(convertMinorUnits(1000, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Date-window + country filtering
// ---------------------------------------------------------------------------

describe('transactionInTripWindow', () => {
  const trip = makeTrip();

  it('includes the inclusive start and end boundaries', () => {
    expect(transactionInTripWindow(trip, makeTx({ date: '2026-01-01' }))).toBe(true);
    expect(transactionInTripWindow(trip, makeTx({ date: '2026-03-31' }))).toBe(true);
  });

  it('excludes dates before the window and after the window', () => {
    expect(transactionInTripWindow(trip, makeTx({ date: '2025-12-31' }))).toBe(false);
    expect(transactionInTripWindow(trip, makeTx({ date: '2026-04-01' }))).toBe(false);
  });
});

describe('transactionMatchesTrip', () => {
  const trip = makeTrip();

  it('matches an in-window transaction in the trip country', () => {
    expect(transactionMatchesTrip(trip, makeTx())).toBe(true);
  });

  it('matches country case-insensitively', () => {
    expect(transactionMatchesTrip(trip, makeTx({ country: 'thailand' }))).toBe(true);
  });

  it('excludes a transaction from a different country', () => {
    expect(transactionMatchesTrip(trip, makeTx({ country: 'Vietnam' }))).toBe(false);
  });

  it('matches any country when the trip country is empty', () => {
    const anyCountry = makeTrip({ country: '' });
    expect(transactionMatchesTrip(anyCountry, makeTx({ country: 'Laos' }))).toBe(true);
  });

  it('never matches excluded transactions', () => {
    expect(transactionMatchesTrip(trip, makeTx({ excluded: true }))).toBe(false);
  });

  it('honours an explicit trip assignment and bypasses the country filter', () => {
    // Country mismatch but explicitly assigned, in-window → matches.
    expect(transactionMatchesTrip(trip, makeTx({ tripId: 'trip-bkk', country: 'Cambodia' }))).toBe(
      true,
    );
  });

  it('does not match a transaction assigned to a different trip', () => {
    expect(transactionMatchesTrip(trip, makeTx({ tripId: 'other-trip' }))).toBe(false);
  });

  it('keeps the date window authoritative even for assigned transactions', () => {
    expect(transactionMatchesTrip(trip, makeTx({ tripId: 'trip-bkk', date: '2025-11-01' }))).toBe(
      false,
    );
  });
});

describe('filterTripTransactions', () => {
  it('returns only matching transactions in original order', () => {
    const trip = makeTrip();
    const txs = [
      makeTx({ id: 'a', date: '2026-02-01' }),
      makeTx({ id: 'b', date: '2025-12-01' }), // out of window
      makeTx({ id: 'c', date: '2026-03-15', country: 'Vietnam' }), // wrong country
      makeTx({ id: 'd', date: '2026-03-20' }),
    ];
    expect(filterTripTransactions(trip, txs).map((t) => t.id)).toEqual(['a', 'd']);
  });
});

// ---------------------------------------------------------------------------
// Totals + roll-up
// ---------------------------------------------------------------------------

describe('computeTripTotals', () => {
  it('rolls local spend up into the home currency with the trip FX rate', () => {
    const trip = makeTrip();
    const txs = [
      makeTx({ id: 'a', amountMinor: 30_000 }), // ฿300.00
      makeTx({ id: 'b', amountMinor: 20_000 }), // ฿200.00
    ];

    const totals = computeTripTotals(trip, txs);

    expect(totals.transactionCount).toBe(2);
    expect(totals.localSpentMinor).toBe(50_000); // ฿500.00
    expect(totals.homeSpentMinor).toBe(1_500); // $15.00 at 0.03
    expect(totals.plannedLocalMinor).toBe(100_000);
    expect(totals.plannedHomeMinor).toBe(3_000); // $30.00
    expect(totals.remainingLocalMinor).toBe(50_000);
    expect(totals.remainingHomeMinor).toBe(1_500);
    expect(totals.utilizationBps).toBe(5_000); // 50.00%
    expect(totals.overBudget).toBe(false);
  });

  it('treats absolute value of signed amounts as spend', () => {
    const trip = makeTrip();
    const totals = computeTripTotals(trip, [makeTx({ amountMinor: -40_000 })]);
    expect(totals.localSpentMinor).toBe(40_000);
  });

  it('converts foreign-currency spend into local minor units with localRates', () => {
    const trip = makeTrip();
    // €10.00 (1,000 minor) at 1 EUR = 38 THB → ฿380.00 (38,000 satang).
    const tx = makeTx({ currency: 'EUR', amountMinor: 1_000 });
    const totals = computeTripTotals(trip, [tx], { localRates: { EUR: 38 } });
    expect(totals.localSpentMinor).toBe(38_000);
    expect(totals.homeSpentMinor).toBe(1_140); // 38,000 * 0.03
  });

  it('assumes foreign spend is already local when no rate is provided', () => {
    const trip = makeTrip();
    const totals = computeTripTotals(trip, [makeTx({ currency: 'EUR', amountMinor: 1_000 })]);
    expect(totals.localSpentMinor).toBe(1_000);
  });

  it('flags an over-budget trip with a negative remaining balance', () => {
    const trip = makeTrip({ plannedLocalMinor: 40_000 });
    const totals = computeTripTotals(trip, [makeTx({ amountMinor: 50_000 })]);
    expect(totals.overBudget).toBe(true);
    expect(totals.remainingLocalMinor).toBe(-10_000);
    expect(totals.utilizationBps).toBe(12_500); // 125.00%
  });

  it('handles a trip with no spend (all zeros, full remaining)', () => {
    const trip = makeTrip();
    const totals = computeTripTotals(trip, []);
    expect(totals.transactionCount).toBe(0);
    expect(totals.localSpentMinor).toBe(0);
    expect(totals.homeSpentMinor).toBe(0);
    expect(totals.remainingLocalMinor).toBe(100_000);
    expect(totals.utilizationBps).toBe(0);
    expect(totals.overBudget).toBe(false);
  });

  it('handles a trip with no planned amount without dividing by zero', () => {
    const trip = makeTrip({ plannedLocalMinor: 0 });
    const totals = computeTripTotals(trip, [makeTx({ amountMinor: 25_000 })]);
    expect(totals.plannedLocalMinor).toBe(0);
    expect(totals.utilizationBps).toBe(0);
    expect(totals.overBudget).toBe(false);
    expect(totals.remainingLocalMinor).toBe(-25_000);
  });
});

// ---------------------------------------------------------------------------
// Overlapping trips
// ---------------------------------------------------------------------------

describe('overlapping trips', () => {
  it('counts an unassigned transaction in every overlapping trip it matches', () => {
    const bangkok = makeTrip({ id: 'bkk', startDate: '2026-01-01', endDate: '2026-02-28' });
    const sameWindow = makeTrip({
      id: 'bkk-work',
      name: 'Bangkok coworking',
      startDate: '2026-02-01',
      endDate: '2026-03-31',
    });
    const tx = makeTx({ date: '2026-02-15', amountMinor: 10_000 });

    expect(computeTripTotals(bangkok, [tx]).localSpentMinor).toBe(10_000);
    expect(computeTripTotals(sameWindow, [tx]).localSpentMinor).toBe(10_000);
  });

  it('keeps an explicitly-assigned transaction out of an overlapping sibling trip', () => {
    const tripA = makeTrip({ id: 'a' });
    const tripB = makeTrip({ id: 'b', name: 'Sibling' });
    const tx = makeTx({ tripId: 'a', amountMinor: 10_000 });

    expect(computeTripTotals(tripA, [tx]).localSpentMinor).toBe(10_000);
    expect(computeTripTotals(tripB, [tx]).localSpentMinor).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle / status
// ---------------------------------------------------------------------------

describe('tripStatus', () => {
  const trip = makeTrip();

  it('reports upcoming before the window starts', () => {
    expect(tripStatus(trip, '2025-12-15')).toBe('upcoming');
  });

  it('reports active inside the window', () => {
    expect(tripStatus(trip, '2026-02-10')).toBe('active');
  });

  it('reports ended after the window', () => {
    expect(tripStatus(trip, '2026-04-10')).toBe('ended');
  });

  it('reports archived regardless of date when archived', () => {
    expect(tripStatus(makeTrip({ archived: true }), '2026-02-10')).toBe('archived');
  });
});

describe('tripDurationDays', () => {
  it('counts the window inclusively', () => {
    expect(tripDurationDays(makeTrip({ startDate: '2026-01-01', endDate: '2026-01-31' }))).toBe(31);
    expect(tripDurationDays(makeTrip({ startDate: '2026-01-01', endDate: '2026-01-01' }))).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Archiving — preserves historical totals
// ---------------------------------------------------------------------------

describe('archiveTripBudget', () => {
  it('freezes the totals at archive time and preserves them when transactions change', () => {
    const trip = makeTrip();
    const txs = [
      makeTx({ id: 'a', amountMinor: 30_000 }),
      makeTx({ id: 'b', amountMinor: 20_000 }),
    ];

    const archived = archiveTripBudget(trip, txs, '2026-04-01');

    expect(archived.archived).toBe(true);
    expect(archived.archivedAt).toBe('2026-04-01');
    expect(archived.archivedSnapshot?.localSpentMinor).toBe(50_000);

    // Transactions disappear later — the archived snapshot must not change.
    const totalsAfterDataLoss = computeTripTotals(archived, []);
    expect(totalsAfterDataLoss.localSpentMinor).toBe(50_000);
    expect(totalsAfterDataLoss.homeSpentMinor).toBe(1_500);
  });

  it('round-trips through unarchive back to live computation', () => {
    const trip = makeTrip();
    const txs = [makeTx({ amountMinor: 30_000 })];
    const archived = archiveTripBudget(trip, txs, '2026-04-01');
    const reopened = unarchiveTripBudget(archived);

    expect(reopened.archived).toBe(false);
    expect(reopened.archivedSnapshot).toBeNull();
    // With transactions removed the live total is now zero.
    expect(computeTripTotals(reopened, []).localSpentMinor).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Reports + cross-trip roll-up
// ---------------------------------------------------------------------------

describe('summarizeTripBudget', () => {
  it('attaches status and matched transaction ids to the totals', () => {
    const trip = makeTrip();
    const txs = [makeTx({ id: 'a' }), makeTx({ id: 'b', country: 'Vietnam' })];
    const report = summarizeTripBudget(trip, txs, '2026-02-10');

    expect(report.id).toBe('trip-bkk');
    expect(report.status).toBe('active');
    expect(report.includedTransactionIds).toEqual(['a']);
    expect(report.localCurrency).toBe('THB');
    expect(report.homeCurrency).toBe('USD');
  });
});

describe('summarizeTripBudgets', () => {
  it('rolls active trips into a single home-currency total and excludes archived trips', () => {
    const bangkok = makeTrip({ id: 'bkk' });
    const lisbon = makeTrip({
      id: 'lis',
      name: 'Lisbon',
      country: 'Portugal',
      localCurrency: 'EUR',
      homeCurrency: 'USD',
      plannedLocalMinor: 200_000,
      fxRateHomePerLocal: 1.08,
    });
    const archivedTrip = archiveTripBudget(
      makeTrip({ id: 'old', name: 'Old trip' }),
      [makeTx({ amountMinor: 99_000 })],
      '2025-12-31',
    );

    const txs = [
      makeTx({ id: 'a', amountMinor: 50_000 }), // Bangkok ฿500 → $15
      makeTx({ id: 'b', country: 'Portugal', currency: 'EUR', amountMinor: 100_000 }), // Lisbon €1,000 → $1,080
    ];

    const summary = summarizeTripBudgets([bangkok, lisbon, archivedTrip], txs, '2026-02-10');

    expect(summary.activeTripCount).toBe(2);
    expect(summary.homeCurrency).toBe('USD');
    // Bangkok planned $30 + Lisbon planned €2,000 → $2,160 = $2,190.
    expect(summary.totalPlannedHomeMinor).toBe(3_000 + 216_000);
    // Bangkok spent $15 + Lisbon spent $1,080.
    expect(summary.totalSpentHomeMinor).toBe(1_500 + 108_000);
    expect(summary.totalRemainingHomeMinor).toBe(
      summary.totalPlannedHomeMinor - summary.totalSpentHomeMinor,
    );
  });
});
