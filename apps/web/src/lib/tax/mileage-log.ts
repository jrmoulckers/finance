// SPDX-License-Identifier: BUSL-1.1

/**
 * Mileage deduction log with IRS standard mileage rates.
 *
 * Supports trip entry, IRS standard mileage rate calculations for
 * business, medical/moving, and charitable purposes, and annual
 * mileage deduction summaries.
 *
 * All monetary values are in cents (integers) to avoid floating-point errors.
 *
 * References: IRS Notice 2024-08 (2024 mileage rates), issue #1709
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Purpose category for mileage deduction. */
export enum MileagePurpose {
  BUSINESS = 'BUSINESS',
  MEDICAL = 'MEDICAL',
  CHARITY = 'CHARITY',
}

/** A single trip entry in the mileage log. */
export interface TripEntry {
  /** Unique trip identifier. */
  readonly tripId: string;
  /** Date of trip (ISO 8601). */
  readonly date: string;
  /** Miles driven (supports fractional miles). */
  readonly miles: number;
  /** Purpose of the trip. */
  readonly purpose: MileagePurpose;
  /** Starting location or description. */
  readonly startLocation: string;
  /** Ending location or description. */
  readonly endLocation: string;
  /** Optional notes about the trip. */
  readonly notes?: string;
}

/** Mileage rate configuration for a specific purpose and year. */
export interface MileageRate {
  /** Purpose this rate applies to. */
  readonly purpose: MileagePurpose;
  /** Rate in cents per mile. */
  readonly centsPerMile: number;
  /** Tax year. */
  readonly taxYear: number;
}

/** Deduction calculation for a single trip. */
export interface TripDeduction {
  /** The trip entry. */
  readonly trip: TripEntry;
  /** Applicable rate in cents per mile. */
  readonly rate: number;
  /** Calculated deduction amount in cents. */
  readonly deduction: number;
}

/** Summary of mileage deductions by purpose. */
export interface MileagePurposeSummary {
  /** Purpose category. */
  readonly purpose: MileagePurpose;
  /** Total miles driven for this purpose. */
  readonly totalMiles: number;
  /** Rate used (cents per mile). */
  readonly rate: number;
  /** Total deduction for this purpose (cents). */
  readonly totalDeduction: number;
  /** Number of trips. */
  readonly tripCount: number;
}

/** Annual mileage deduction summary. */
export interface AnnualMileageSummary {
  /** Tax year. */
  readonly year: number;
  /** Summaries by purpose category. */
  readonly byPurpose: readonly MileagePurposeSummary[];
  /** Total miles driven across all purposes. */
  readonly totalMiles: number;
  /** Total deduction across all purposes (cents). */
  readonly totalDeduction: number;
  /** Total number of trips. */
  readonly totalTrips: number;
}

// ---------------------------------------------------------------------------
// 2024 IRS Standard Mileage Rates (IRS Notice 2024-08)
// ---------------------------------------------------------------------------

/** 2024 IRS standard mileage rates (in cents per mile). */
export const MILEAGE_RATES_2024: readonly MileageRate[] = [
  { purpose: MileagePurpose.BUSINESS, centsPerMile: 67, taxYear: 2024 },
  { purpose: MileagePurpose.MEDICAL, centsPerMile: 21, taxYear: 2024 },
  { purpose: MileagePurpose.CHARITY, centsPerMile: 14, taxYear: 2024 },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the IRS standard mileage rate for a given purpose and year.
 *
 * @param purpose - Trip purpose category
 * @param taxYear - Tax year (default 2024)
 * @returns Rate in cents per mile, or null if not found
 */
export function getMileageRate(purpose: MileagePurpose, taxYear: number = 2024): number | null {
  if (taxYear !== 2024) return null;
  const rate = MILEAGE_RATES_2024.find((r) => r.purpose === purpose);
  return rate?.centsPerMile ?? null;
}

/**
 * Calculate the mileage deduction for a single trip.
 *
 * @param trip - Trip entry
 * @param taxYear - Tax year (default 2024)
 * @returns Trip deduction result
 * @throws Error if no rate found for the purpose/year
 */
export function calculateTripDeduction(trip: TripEntry, taxYear: number = 2024): TripDeduction {
  const rate = getMileageRate(trip.purpose, taxYear);
  if (rate === null) {
    throw new Error(`No mileage rate found for ${trip.purpose} in ${taxYear}.`);
  }

  // Deduction = miles * rate (cents per mile), rounded to nearest cent
  const deduction = Math.round(trip.miles * rate);

  return {
    trip,
    rate,
    deduction,
  };
}

/**
 * Calculate deductions for multiple trips.
 *
 * @param trips - Array of trip entries
 * @param taxYear - Tax year (default 2024)
 * @returns Array of trip deductions
 */
export function calculateTripDeductions(
  trips: readonly TripEntry[],
  taxYear: number = 2024,
): TripDeduction[] {
  return trips.map((t) => calculateTripDeduction(t, taxYear));
}

/**
 * Filter trips by tax year.
 *
 * @param trips - All trip entries
 * @param year - Tax year
 * @returns Trips within the given year
 */
export function filterTripsByYear(trips: readonly TripEntry[], year: number): TripEntry[] {
  const yearStr = String(year);
  return trips.filter((t) => t.date.startsWith(yearStr));
}

/**
 * Filter trips by purpose.
 *
 * @param trips - Trip entries
 * @param purpose - Purpose to filter by
 * @returns Trips matching the given purpose
 */
export function filterTripsByPurpose(
  trips: readonly TripEntry[],
  purpose: MileagePurpose,
): TripEntry[] {
  return trips.filter((t) => t.purpose === purpose);
}

/**
 * Summarize mileage deductions for a specific purpose.
 *
 * @param trips - Trip entries (should be pre-filtered to a single year)
 * @param purpose - Purpose to summarize
 * @param taxYear - Tax year for rate lookup (default 2024)
 * @returns Purpose summary with total miles and deduction
 */
export function summarizeByPurpose(
  trips: readonly TripEntry[],
  purpose: MileagePurpose,
  taxYear: number = 2024,
): MileagePurposeSummary {
  const purposeTrips = filterTripsByPurpose(trips, purpose);
  const rate = getMileageRate(purpose, taxYear) ?? 0;
  const totalMiles = purposeTrips.reduce((sum, t) => sum + t.miles, 0);
  const totalDeduction = Math.round(totalMiles * rate);

  return {
    purpose,
    totalMiles,
    rate,
    totalDeduction,
    tripCount: purposeTrips.length,
  };
}

/**
 * Generate an annual mileage deduction summary.
 *
 * @param trips - All trip entries
 * @param year - Tax year
 * @returns Complete annual summary by purpose
 */
export function generateAnnualMileageSummary(
  trips: readonly TripEntry[],
  year: number,
): AnnualMileageSummary {
  const yearTrips = filterTripsByYear(trips, year);

  const purposes = [MileagePurpose.BUSINESS, MileagePurpose.MEDICAL, MileagePurpose.CHARITY];
  const byPurpose = purposes.map((p) => summarizeByPurpose(yearTrips, p, year));

  const totalMiles = byPurpose.reduce((sum, s) => sum + s.totalMiles, 0);
  const totalDeduction = byPurpose.reduce((sum, s) => sum + s.totalDeduction, 0);
  const totalTrips = byPurpose.reduce((sum, s) => sum + s.tripCount, 0);

  return {
    year,
    byPurpose,
    totalMiles,
    totalDeduction,
    totalTrips,
  };
}

/**
 * Validate a trip entry for common data issues.
 *
 * @param trip - Trip entry to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateTripEntry(trip: TripEntry): string[] {
  const errors: string[] = [];

  if (trip.miles <= 0) {
    errors.push('Miles must be greater than zero.');
  }

  if (trip.miles > 10_000) {
    errors.push('Miles exceeds 10,000 for a single trip — please verify.');
  }

  if (!trip.date || !/^\d{4}-\d{2}-\d{2}$/.test(trip.date)) {
    errors.push('Date must be in YYYY-MM-DD format.');
  }

  if (!trip.startLocation.trim()) {
    errors.push('Start location is required.');
  }

  if (!trip.endLocation.trim()) {
    errors.push('End location is required.');
  }

  return errors;
}
