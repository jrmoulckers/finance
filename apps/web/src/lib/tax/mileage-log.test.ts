// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  MileagePurpose,
  MILEAGE_RATES_2024,
  getMileageRate,
  calculateTripDeduction,
  calculateTripDeductions,
  filterTripsByYear,
  filterTripsByPurpose,
  summarizeByPurpose,
  generateAnnualMileageSummary,
  validateTripEntry,
  type TripEntry,
} from './mileage-log';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const TRIPS: TripEntry[] = [
  {
    tripId: 'trip-1',
    date: '2024-03-15',
    miles: 50,
    purpose: MileagePurpose.BUSINESS,
    startLocation: 'Home Office',
    endLocation: 'Client Site',
  },
  {
    tripId: 'trip-2',
    date: '2024-04-20',
    miles: 120,
    purpose: MileagePurpose.BUSINESS,
    startLocation: 'Office',
    endLocation: 'Conference Center',
  },
  {
    tripId: 'trip-3',
    date: '2024-05-10',
    miles: 30,
    purpose: MileagePurpose.MEDICAL,
    startLocation: 'Home',
    endLocation: 'Hospital',
  },
  {
    tripId: 'trip-4',
    date: '2024-06-01',
    miles: 15,
    purpose: MileagePurpose.CHARITY,
    startLocation: 'Home',
    endLocation: 'Food Bank',
  },
  {
    tripId: 'trip-5',
    date: '2023-12-15',
    miles: 80,
    purpose: MileagePurpose.BUSINESS,
    startLocation: 'Office',
    endLocation: 'Client',
  },
];

describe('mileage-log', () => {
  // -----------------------------------------------------------------------
  // MILEAGE_RATES_2024
  // -----------------------------------------------------------------------
  describe('MILEAGE_RATES_2024', () => {
    it('business rate is $0.67/mile (67 cents)', () => {
      const rate = MILEAGE_RATES_2024.find((r) => r.purpose === MileagePurpose.BUSINESS);
      expect(rate?.centsPerMile).toBe(67);
    });

    it('medical rate is $0.21/mile (21 cents)', () => {
      const rate = MILEAGE_RATES_2024.find((r) => r.purpose === MileagePurpose.MEDICAL);
      expect(rate?.centsPerMile).toBe(21);
    });

    it('charity rate is $0.14/mile (14 cents)', () => {
      const rate = MILEAGE_RATES_2024.find((r) => r.purpose === MileagePurpose.CHARITY);
      expect(rate?.centsPerMile).toBe(14);
    });
  });

  // -----------------------------------------------------------------------
  // getMileageRate
  // -----------------------------------------------------------------------
  describe('getMileageRate', () => {
    it('returns business rate for 2024', () => {
      expect(getMileageRate(MileagePurpose.BUSINESS)).toBe(67);
    });

    it('returns medical rate for 2024', () => {
      expect(getMileageRate(MileagePurpose.MEDICAL)).toBe(21);
    });

    it('returns charity rate for 2024', () => {
      expect(getMileageRate(MileagePurpose.CHARITY)).toBe(14);
    });

    it('returns null for unsupported year', () => {
      expect(getMileageRate(MileagePurpose.BUSINESS, 2025)).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // calculateTripDeduction
  // -----------------------------------------------------------------------
  describe('calculateTripDeduction', () => {
    it('test vector: 50 business miles at $0.67', () => {
      const result = calculateTripDeduction(TRIPS[0]);

      expect(result.rate).toBe(67);
      // 50 miles * 67 cents = 3,350 cents = $33.50
      expect(result.deduction).toBe(3_350);
    });

    it('test vector: 120 business miles', () => {
      const result = calculateTripDeduction(TRIPS[1]);
      // 120 * 67 = 8,040 cents = $80.40
      expect(result.deduction).toBe(8_040);
    });

    it('medical trip deduction', () => {
      const result = calculateTripDeduction(TRIPS[2]);
      // 30 miles * 21 cents = 630 cents = $6.30
      expect(result.deduction).toBe(630);
    });

    it('charity trip deduction', () => {
      const result = calculateTripDeduction(TRIPS[3]);
      // 15 miles * 14 cents = 210 cents = $2.10
      expect(result.deduction).toBe(210);
    });

    it('handles fractional miles', () => {
      const trip: TripEntry = {
        tripId: 'frac-1',
        date: '2024-01-15',
        miles: 12.5,
        purpose: MileagePurpose.BUSINESS,
        startLocation: 'A',
        endLocation: 'B',
      };
      const result = calculateTripDeduction(trip);
      // 12.5 * 67 = 837.5, rounds to 838 (Banker's: nearest even, 838)
      expect(result.deduction).toBe(838);
    });

    it('throws for unsupported tax year', () => {
      expect(() => calculateTripDeduction(TRIPS[0], 2025)).toThrow('No mileage rate found');
    });
  });

  // -----------------------------------------------------------------------
  // calculateTripDeductions
  // -----------------------------------------------------------------------
  describe('calculateTripDeductions', () => {
    it('calculates deductions for multiple trips', () => {
      const results = calculateTripDeductions(TRIPS.slice(0, 4));
      expect(results).toHaveLength(4);
      expect(results.every((r) => r.deduction > 0)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // filterTripsByYear
  // -----------------------------------------------------------------------
  describe('filterTripsByYear', () => {
    it('filters to 2024 trips', () => {
      const result = filterTripsByYear(TRIPS, 2024);
      expect(result).toHaveLength(4);
    });

    it('filters to 2023 trips', () => {
      const result = filterTripsByYear(TRIPS, 2023);
      expect(result).toHaveLength(1);
    });

    it('returns empty for year with no trips', () => {
      const result = filterTripsByYear(TRIPS, 2022);
      expect(result).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // filterTripsByPurpose
  // -----------------------------------------------------------------------
  describe('filterTripsByPurpose', () => {
    it('filters business trips', () => {
      const result = filterTripsByPurpose(TRIPS, MileagePurpose.BUSINESS);
      expect(result).toHaveLength(3);
    });

    it('filters medical trips', () => {
      const result = filterTripsByPurpose(TRIPS, MileagePurpose.MEDICAL);
      expect(result).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // summarizeByPurpose
  // -----------------------------------------------------------------------
  describe('summarizeByPurpose', () => {
    it('summarizes business mileage for 2024', () => {
      const yearTrips = filterTripsByYear(TRIPS, 2024);
      const summary = summarizeByPurpose(yearTrips, MileagePurpose.BUSINESS);

      expect(summary.purpose).toBe(MileagePurpose.BUSINESS);
      expect(summary.totalMiles).toBe(170); // 50 + 120
      expect(summary.rate).toBe(67);
      // 170 * 67 = 11,390 cents = $113.90
      expect(summary.totalDeduction).toBe(11_390);
      expect(summary.tripCount).toBe(2);
    });

    it('summarizes medical mileage', () => {
      const yearTrips = filterTripsByYear(TRIPS, 2024);
      const summary = summarizeByPurpose(yearTrips, MileagePurpose.MEDICAL);

      expect(summary.totalMiles).toBe(30);
      expect(summary.totalDeduction).toBe(630); // 30 * 21
      expect(summary.tripCount).toBe(1);
    });

    it('returns zero for purpose with no trips', () => {
      const summary = summarizeByPurpose([], MileagePurpose.BUSINESS);

      expect(summary.totalMiles).toBe(0);
      expect(summary.totalDeduction).toBe(0);
      expect(summary.tripCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // generateAnnualMileageSummary
  // -----------------------------------------------------------------------
  describe('generateAnnualMileageSummary', () => {
    it('generates complete 2024 summary', () => {
      const summary = generateAnnualMileageSummary(TRIPS, 2024);

      expect(summary.year).toBe(2024);
      expect(summary.byPurpose).toHaveLength(3);
      expect(summary.totalMiles).toBe(215); // 50+120+30+15
      expect(summary.totalTrips).toBe(4);

      // Total deduction: business 170*67 + medical 30*21 + charity 15*14
      // = 11390 + 630 + 210 = 12230 cents = $122.30
      expect(summary.totalDeduction).toBe(12_230);
    });

    it('excludes prior year trips', () => {
      const summary = generateAnnualMileageSummary(TRIPS, 2024);
      expect(summary.totalTrips).toBe(4); // Not 5
    });

    it('handles empty trip list', () => {
      const summary = generateAnnualMileageSummary([], 2024);

      expect(summary.totalMiles).toBe(0);
      expect(summary.totalDeduction).toBe(0);
      expect(summary.totalTrips).toBe(0);
      expect(summary.byPurpose).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // validateTripEntry
  // -----------------------------------------------------------------------
  describe('validateTripEntry', () => {
    it('returns empty array for valid trip', () => {
      const errors = validateTripEntry(TRIPS[0]);
      expect(errors).toHaveLength(0);
    });

    it('flags zero miles', () => {
      const trip: TripEntry = { ...TRIPS[0], miles: 0 };
      const errors = validateTripEntry(trip);
      expect(errors).toContain('Miles must be greater than zero.');
    });

    it('flags negative miles', () => {
      const trip: TripEntry = { ...TRIPS[0], miles: -5 };
      const errors = validateTripEntry(trip);
      expect(errors).toContain('Miles must be greater than zero.');
    });

    it('warns on extremely high mileage', () => {
      const trip: TripEntry = { ...TRIPS[0], miles: 15_000 };
      const errors = validateTripEntry(trip);
      expect(errors.some((e) => e.includes('10,000'))).toBe(true);
    });

    it('flags invalid date format', () => {
      const trip: TripEntry = { ...TRIPS[0], date: '03/15/2024' };
      const errors = validateTripEntry(trip);
      expect(errors.some((e) => e.includes('YYYY-MM-DD'))).toBe(true);
    });

    it('flags empty start location', () => {
      const trip: TripEntry = { ...TRIPS[0], startLocation: '  ' };
      const errors = validateTripEntry(trip);
      expect(errors).toContain('Start location is required.');
    });

    it('flags empty end location', () => {
      const trip: TripEntry = { ...TRIPS[0], endLocation: '' };
      const errors = validateTripEntry(trip);
      expect(errors).toContain('End location is required.');
    });

    it('can return multiple errors', () => {
      const trip: TripEntry = {
        tripId: 'bad',
        date: 'invalid',
        miles: -1,
        purpose: MileagePurpose.BUSINESS,
        startLocation: '',
        endLocation: '',
      };
      const errors = validateTripEntry(trip);
      expect(errors.length).toBeGreaterThanOrEqual(4);
    });
  });
});
